// BCO Governance — Anti-Catastrophic Failure Prevention System (Run 10)
// Monitors for: infinite loops, runaway agents, action floods,
// system instability, and rule conflicts.
// Response: isolate → freeze → rollback → notify.
// All responses route through governance + action engine (§13 still applies).

import { dispatchAction } from "../core/actions.js";
import { pushNotification } from "../ui/notifications.js";
import { StorageAdapter } from "../core/storage-adapter.js";
import { auditLog } from "./audit.js";
import { createSnapshot, rollbackToSnapshot } from "./snapshot.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// CIRCUIT BREAKER STATE
// ─────────────────────────────────────────────

// In-process counters — reset on system restart
const _counters = new Map();   // key → { count, windowStart }
const _frozen   = new Set();   // frozen agent / module IDs

// ─────────────────────────────────────────────
// THRESHOLDS
// ─────────────────────────────────────────────

export const FAILURE_THRESHOLDS = {
  ACTION_FLOOD_PER_SECOND:   50,   // actions/sec before flood declared
  ACTION_FLOOD_WINDOW_MS:   1000,
  LOOP_DETECTION_DEPTH:       20,  // recursion depth before loop declared
  AGENT_MAX_GOALS:            50,  // goals queued before agent considered runaway
  AGENT_MAX_ERRORS:           10,  // consecutive errors before agent frozen
  RULE_CONFLICT_MAX:           5,  // conflicting rules in one evaluation before halt
  INSTABILITY_ERROR_RATE:    0.4   // >40% error rate = system unstable
};

// ─────────────────────────────────────────────
// FAILURE DETECTORS
// ─────────────────────────────────────────────

/**
 * detectActionFlood(tenantId?)
 * Returns true if action rate exceeds threshold.
 */
export function detectActionFlood(tenantId = null) {
  const key = `action_rate:${tenantId || "global"}`;
  const now = Date.now();
  const entry = _counters.get(key) || { count: 0, windowStart: now };

  const elapsed = now - entry.windowStart;
  if (elapsed > FAILURE_THRESHOLDS.ACTION_FLOOD_WINDOW_MS) {
    // New window
    _counters.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  _counters.set(key, entry);

  return entry.count > FAILURE_THRESHOLDS.ACTION_FLOOD_PER_SECOND;
}

/**
 * detectRunawayAgent(agent)
 * Returns true if an agent has too many queued goals or consecutive errors.
 */
export function detectRunawayAgent(agent) {
  const pendingGoals = agent.goals?.filter((g) => g.status === "pending" || g.status === "active").length || 0;
  const errorGoals   = agent.goals?.filter((g) => g.status === "failed").length || 0;

  return pendingGoals > FAILURE_THRESHOLDS.AGENT_MAX_GOALS ||
         errorGoals   > FAILURE_THRESHOLDS.AGENT_MAX_ERRORS;
}

/**
 * detectInfiniteLoop(depth, executionId)
 * Checks if a workflow execution has exceeded safe depth.
 */
export function detectInfiniteLoop(depth, executionId = "unknown") {
  if (depth > FAILURE_THRESHOLDS.LOOP_DETECTION_DEPTH) {
    rawLog("INFINITE_LOOP_DETECTED", { depth, executionId }, "FAILURE_PREVENTION");
    return true;
  }
  return false;
}

/**
 * detectRuleConflict(conflicts)
 * Returns true if too many rule conflicts detected in one evaluation pass.
 */
export function detectRuleConflict(conflicts = []) {
  return conflicts.length > FAILURE_THRESHOLDS.RULE_CONFLICT_MAX;
}

/**
 * detectSystemInstability(metrics)
 * Returns true if system metrics indicate instability.
 */
export function detectSystemInstability(metrics) {
  return (metrics?.errorRate || 0) > FAILURE_THRESHOLDS.INSTABILITY_ERROR_RATE;
}

// ─────────────────────────────────────────────
// FAILURE RESPONSE ENGINE
// ─────────────────────────────────────────────

/**
 * handleFailure(failureType, context)
 * Unified response entry point.
 *
 * @param {"action_flood"|"runaway_agent"|"infinite_loop"|"rule_conflict"|"instability"} failureType
 * @param {{ tenantId, agentId?, moduleId?, depth?, metrics?, userId? }} context
 * @returns {FailureResponse}
 */
export function handleFailure(failureType, context = {}) {
  const { tenantId, agentId, moduleId } = context;

  rawLog("FAILURE_DETECTED", { failureType, tenantId, agentId, moduleId }, "FAILURE_PREVENTION");

  auditLog({
    action:   "FAILURE_DETECTED",
    tenantId,
    source:   "failure_prevention",
    payload:  { failureType, agentId, moduleId }
  });

  const report = {
    failureType,
    tenantId,
    detectedAt: new Date().toISOString(),
    steps:      []
  };

  switch (failureType) {
    case "action_flood":
      report.steps.push(_isolateModule(moduleId || "CORE", tenantId));
      report.steps.push(_notifyAdmin(`⚡ Action flood detected — ${moduleId || "CORE"} isolated.`, tenantId));
      break;

    case "runaway_agent":
      report.steps.push(_freezeAgent(agentId, tenantId));
      report.steps.push(_notifyAdmin(`🤖 Runaway agent "${agentId}" frozen.`, tenantId));
      break;

    case "infinite_loop":
      report.steps.push(_isolateModule(moduleId, tenantId));
      report.steps.push(_rollbackSafe(tenantId, context.userId));
      report.steps.push(_notifyAdmin(`🔄 Infinite loop detected — module isolated + rollback initiated.`, tenantId));
      break;

    case "rule_conflict":
      report.steps.push(_haltRuleEngine(tenantId));
      report.steps.push(_notifyAdmin(`⚠️ Rule conflict threshold exceeded — rule engine halted.`, tenantId));
      break;

    case "instability":
      report.steps.push(_freezeAllAgents(tenantId));
      report.steps.push(_rollbackSafe(tenantId, context.userId));
      report.steps.push(_notifyAdmin(`🚨 System instability detected — agents frozen + rollback initiated.`, tenantId));
      break;

    default:
      report.steps.push({ action: "unknown_failure", logged: true });
  }

  rawLog("FAILURE_RESPONSE_COMPLETE", { failureType, tenantId, steps: report.steps.length }, "FAILURE_PREVENTION");
  return report;
}

// ─────────────────────────────────────────────
// CIRCUIT BREAKER (action-level)
// ─────────────────────────────────────────────

/**
 * circuitBreaker(actionType, tenantId?)
 * Wraps action execution — blocks if action flood detected.
 * Returns { allowed, reason }.
 */
export function circuitBreaker(actionType, tenantId = null) {
  if (_frozen.has(`module:${tenantId}:CORE`)) {
    return { allowed: false, reason: "Core module is frozen — circuit breaker open." };
  }

  const flood = detectActionFlood(tenantId);
  if (flood) {
    rawLog("CIRCUIT_BREAKER_OPEN", { actionType, tenantId }, "FAILURE_PREVENTION");
    return { allowed: false, reason: "Action flood detected — circuit breaker open." };
  }

  return { allowed: true, reason: "" };
}

/**
 * isAgentFrozen(agentId)
 */
export function isAgentFrozen(agentId) {
  return _frozen.has(`agent:${agentId}`);
}

/**
 * unfreezeAgent(agentId)
 */
export function unfreezeAgent(agentId, context = {}) {
  _frozen.delete(`agent:${agentId}`);
  rawLog("AGENT_UNFROZEN", { agentId, by: context.userId }, "FAILURE_PREVENTION");
  return { unfrozen: true, agentId };
}

// ─────────────────────────────────────────────
// RESPONSE ACTIONS (internal)
// ─────────────────────────────────────────────

function _isolateModule(moduleId, tenantId) {
  if (!moduleId) return { action: "isolate_module", skipped: true, reason: "no moduleId" };
  dispatchAction({
    type:    "ISOLATE_MODULE",
    payload: { moduleName: moduleId, tenantId, reason: "failure_prevention" },
    source:  "failure_prevention"
  });
  return { action: "isolate_module", module: moduleId, ok: true };
}

function _freezeAgent(agentId, tenantId) {
  if (!agentId) return { action: "freeze_agent", skipped: true };
  _frozen.add(`agent:${agentId}`);
  rawLog("AGENT_FROZEN", { agentId, tenantId }, "FAILURE_PREVENTION");
  return { action: "freeze_agent", agentId, ok: true };
}

function _freezeAllAgents(tenantId) {
  // Mark a tenant-level freeze flag — coordinator checks this on goal execution
  StorageAdapter.set(`t:${tenantId}:bco_agents_frozen`, {
    frozen: true,
    frozenAt: new Date().toISOString(),
    reason: "system_instability"
  });
  rawLog("ALL_AGENTS_FROZEN", { tenantId }, "FAILURE_PREVENTION");
  return { action: "freeze_all_agents", tenantId, ok: true };
}

function _rollbackSafe(tenantId, userId) {
  if (!tenantId) return { action: "rollback", skipped: true, reason: "no tenantId" };
  try {
    // Take a pre-rollback snapshot first (captures current broken state for forensics)
    createSnapshot(tenantId, "recovery", { userId });
    const result = rollbackToSnapshot(tenantId, null, { userId });
    return { action: "rollback", ok: result.success, snapshotId: result.snapshotId };
  } catch (err) {
    return { action: "rollback", ok: false, error: err.message };
  }
}

function _notifyAdmin(message, tenantId) {
  pushNotification(message, "critical", "FAILURE_PREVENTION");
  dispatchAction({
    type:    "NOTIFY_ADMIN",
    payload: { message, tenantId, channel: "system", timestamp: new Date().toISOString() },
    source:  "failure_prevention"
  });
  return { action: "notify_admin", message, ok: true };
}

function _haltRuleEngine(tenantId) {
  StorageAdapter.set(`t:${tenantId}:bco_rule_engine_halted`, {
    halted: true,
    haltedAt: new Date().toISOString()
  });
  rawLog("RULE_ENGINE_HALTED", { tenantId }, "FAILURE_PREVENTION");
  return { action: "halt_rule_engine", tenantId, ok: true };
}
