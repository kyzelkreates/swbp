// BCO Agents — Self-Optimisation Loop (Run 9)
// Observes system metrics, detects inefficiencies, generates fixes,
// and applies them through the action engine (never directly).
//
// §13 safety boundary: applyFix() routes every change through
// dispatchAction → rule engine → state update. No direct mutations.

import {
  collectSystemMetrics, evaluateThresholds,
  isImbalanced, METRIC_THRESHOLDS
} from "./metrics.js";
import { dispatchAction } from "../core/actions.js";
import { generateRecommendations } from "../ai/recommendations.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// INEFFICIENCY TYPES
// ─────────────────────────────────────────────

export const INEFFICIENCY_TYPES = {
  HIGH_LATENCY:      "high_latency",
  HIGH_ERROR_RATE:   "high_error_rate",
  EVENT_BACKLOG:     "event_backlog",
  MODULE_IMBALANCE:  "module_imbalance",
  STORAGE_PRESSURE:  "storage_pressure",
  MEMORY_PRESSURE:   "memory_pressure"
};

// ─────────────────────────────────────────────
// SELF-OPTIMISE LOOP
// ─────────────────────────────────────────────

/**
 * selfOptimise(tenantId?, dryRun?)
 * Full cycle: collect → detect → fix → report.
 * dryRun=true returns fixes without applying them (safe preview).
 *
 * @returns {{ metrics, inefficiencies, fixes, applied, skipped }}
 */
export function selfOptimise(tenantId = null, dryRun = false) {
  const metrics       = collectSystemMetrics(tenantId);
  const inefficiencies = detectInefficiencies(metrics);
  const fixes          = inefficiencies.map(generateOptimisationFix);
  const applied        = [];
  const skipped        = [];

  if (!dryRun) {
    fixes.forEach((fix) => {
      const result = applyFix(fix, tenantId);
      if (result.applied) applied.push(fix);
      else                skipped.push({ fix, reason: result.reason });
    });
  }

  rawLog("SELF_OPTIMISE_CYCLE", {
    tenantId,
    dryRun,
    inefficiencies: inefficiencies.length,
    applied:        applied.length,
    skipped:        skipped.length
  }, "OPTIMISER");

  return { metrics, inefficiencies, fixes, applied, skipped };
}

// ─────────────────────────────────────────────
// DETECT INEFFICIENCIES
// ─────────────────────────────────────────────

/**
 * detectInefficiencies(metrics)
 * Maps threshold violations and structural imbalances to typed issues.
 *
 * @returns {Inefficiency[]}
 *
 * @typedef {Object} Inefficiency
 * @property {string} type      — from INEFFICIENCY_TYPES
 * @property {string} severity  — "warn" | "critical"
 * @property {string} detail
 * @property {object} data      — raw metric values
 */
export function detectInefficiencies(metrics) {
  const flags  = evaluateThresholds(metrics);
  const issues = [];

  if (flags.latencyMs === "critical" || flags.latencyMs === "warn") {
    issues.push({
      type:     INEFFICIENCY_TYPES.HIGH_LATENCY,
      severity: flags.latencyMs,
      detail:   `Latency ${metrics.latencyMs}ms exceeds threshold (warn: ${METRIC_THRESHOLDS.latencyMs.warn}ms, critical: ${METRIC_THRESHOLDS.latencyMs.critical}ms)`,
      data:     { latencyMs: metrics.latencyMs }
    });
  }

  if (flags.errorRate === "critical" || flags.errorRate === "warn") {
    issues.push({
      type:     INEFFICIENCY_TYPES.HIGH_ERROR_RATE,
      severity: flags.errorRate,
      detail:   `Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeds threshold`,
      data:     { errorRate: metrics.errorRate }
    });
  }

  if (flags.eventBacklog === "critical" || flags.eventBacklog === "warn") {
    issues.push({
      type:     INEFFICIENCY_TYPES.EVENT_BACKLOG,
      severity: flags.eventBacklog,
      detail:   `${metrics.eventBacklog} events queued — processing backlog detected`,
      data:     { backlog: metrics.eventBacklog }
    });
  }

  if (isImbalanced(metrics.moduleStats)) {
    const dominant = Object.entries(metrics.moduleStats).sort((a, b) => b[1] - a[1])[0];
    issues.push({
      type:     INEFFICIENCY_TYPES.MODULE_IMBALANCE,
      severity: "warn",
      detail:   `Module "${dominant?.[0]}" handling disproportionate load (${dominant?.[1]} events)`,
      data:     { moduleStats: metrics.moduleStats, dominantModule: dominant?.[0] }
    });
  }

  if (flags.storageSizeKb === "critical" || flags.storageSizeKb === "warn") {
    issues.push({
      type:     INEFFICIENCY_TYPES.STORAGE_PRESSURE,
      severity: flags.storageSizeKb,
      detail:   `Storage ${metrics.storageSizeKb}KB — approaching limit`,
      data:     { storageSizeKb: metrics.storageSizeKb }
    });
  }

  if (metrics.memoryUsageMb > 0 && (flags.memoryUsageMb === "critical" || flags.memoryUsageMb === "warn")) {
    issues.push({
      type:     INEFFICIENCY_TYPES.MEMORY_PRESSURE,
      severity: flags.memoryUsageMb,
      detail:   `Memory usage ${metrics.memoryUsageMb}MB — elevated`,
      data:     { memoryUsageMb: metrics.memoryUsageMb }
    });
  }

  return issues;
}

// ─────────────────────────────────────────────
// FIX GENERATOR
// ─────────────────────────────────────────────

/**
 * generateOptimisationFix(inefficiency)
 * Maps each inefficiency type to a safe, actionable fix.
 *
 * @typedef {Object} OptimisationFix
 * @property {string} type
 * @property {string} actionType    — action to dispatch
 * @property {object} payload
 * @property {boolean} destructive  — requires extra validation gate
 * @property {string} rationale
 */
export function generateOptimisationFix(inefficiency) {
  switch (inefficiency.type) {

    case INEFFICIENCY_TYPES.HIGH_LATENCY:
      return {
        type:        inefficiency.type,
        actionType:  "OPTIMISE_LATENCY",
        payload:     { strategy: "flush_event_queue", priority: "high" },
        destructive: false,
        rationale:   `Flush pending event queue to reduce processing latency (${inefficiency.data.latencyMs}ms)`
      };

    case INEFFICIENCY_TYPES.HIGH_ERROR_RATE:
      return {
        type:        inefficiency.type,
        actionType:  "TRIGGER_RECOVERY_SCAN",
        payload:     { errorRate: inefficiency.data.errorRate, strategy: "analyse_logs" },
        destructive: false,
        rationale:   `Error rate ${(inefficiency.data.errorRate * 100).toFixed(1)}% — trigger recovery agent scan`
      };

    case INEFFICIENCY_TYPES.EVENT_BACKLOG:
      return {
        type:        inefficiency.type,
        actionType:  "DRAIN_EVENT_BACKLOG",
        payload:     { backlog: inefficiency.data.backlog, strategy: "batch_process" },
        destructive: false,
        rationale:   `${inefficiency.data.backlog} events queued — batch drain`
      };

    case INEFFICIENCY_TYPES.MODULE_IMBALANCE:
      return {
        type:        inefficiency.type,
        actionType:  "REBALANCE_MODULES",
        payload:     { dominantModule: inefficiency.data.dominantModule, moduleStats: inefficiency.data.moduleStats },
        destructive: false,
        rationale:   `Rebalance event routing away from "${inefficiency.data.dominantModule}"`
      };

    case INEFFICIENCY_TYPES.STORAGE_PRESSURE:
      return {
        type:        inefficiency.type,
        actionType:  "PRUNE_OLD_LOGS",
        payload:     { storageSizeKb: inefficiency.data.storageSizeKb, maxAgeDays: 30 },
        destructive: true, // data deletion — requires validation
        rationale:   `Prune log entries older than 30 days to relieve storage pressure`
      };

    case INEFFICIENCY_TYPES.MEMORY_PRESSURE:
      return {
        type:        inefficiency.type,
        actionType:  "SUGGEST_MEMORY_RELIEF",
        payload:     { memoryUsageMb: inefficiency.data.memoryUsageMb },
        destructive: false,
        rationale:   `Emit memory relief suggestion — cannot force GC, suggesting module unload`
      };

    default:
      return {
        type:        inefficiency.type,
        actionType:  "LOG_INEFFICIENCY",
        payload:     { detail: inefficiency.detail },
        destructive: false,
        rationale:   "Unknown inefficiency — logged for review"
      };
  }
}

// ─────────────────────────────────────────────
// FIX APPLICATION
// ─────────────────────────────────────────────

/**
 * applyFix(fix, tenantId?)
 * Routes through the action engine (§13: no direct state mutation).
 * Destructive fixes require the action to return status="approved" first.
 */
export function applyFix(fix, tenantId = null) {
  // Destructive fixes: validate first
  if (fix.destructive) {
    const validation = dispatchAction({
      type:    "VALIDATE_DESTRUCTIVE_ACTION",
      payload: { actionType: fix.actionType, ...fix.payload, tenantId },
      source:  "optimiser"
    });
    if (validation?.status !== "approved") {
      rawLog("FIX_BLOCKED", { type: fix.type, reason: "destructive_not_approved" }, "OPTIMISER");
      return { applied: false, reason: "destructive action requires explicit approval" };
    }
  }

  const result = dispatchAction({
    type:    fix.actionType,
    payload: { ...fix.payload, _optimiserFix: true, tenantId },
    source:  "optimiser"
  });

  const applied = result?.status !== "rejected";
  rawLog("FIX_APPLIED", { type: fix.type, actionType: fix.actionType, applied }, "OPTIMISER");

  return { applied, result };
}
