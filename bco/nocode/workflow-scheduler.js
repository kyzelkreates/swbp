// BCO No-Code — Workflow Scheduler (Run 8 outstanding item)
// Drives time-based trigger nodes (TRIGGER_TIME) by emitting the
// sentinel event "SCHEDULED:{triggerId}" at the configured interval.
// Integrates with the workflow engine without touching state directly.

import { NODE_TYPES } from "./workflow-schema.js";
import { getActiveWorkflows } from "./workflow-registry.js";
import { executeWorkflow } from "./workflow-engine.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// SCHEDULER STATE
// ─────────────────────────────────────────────

const _handles  = new Map(); // triggerId → intervalId
const _registry = new Map(); // triggerId → { tenantId, workflowId, config }

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

/**
 * startScheduler(tenantId)
 * Scans active workflows for TRIGGER_TIME nodes and registers timers.
 * Call once on tenant boot, and again after any workflow save/activate.
 */
export function startScheduler(tenantId) {
  const workflows = getActiveWorkflows(tenantId);

  workflows.forEach((wf) => {
    wf.nodes
      .filter((n) => n.type === NODE_TYPES.TRIGGER_TIME)
      .forEach((triggerNode) => {
        _register(tenantId, wf.id, triggerNode);
      });
  });

  rawLog("SCHEDULER_STARTED", { tenantId, registered: _handles.size }, "SCHEDULER");
}

/**
 * stopScheduler(tenantId?)
 * Clears all timers, optionally scoped to one tenant.
 */
export function stopScheduler(tenantId = null) {
  for (const [triggerId, handle] of _handles) {
    const entry = _registry.get(triggerId);
    if (!tenantId || entry?.tenantId === tenantId) {
      clearInterval(handle);
      _handles.delete(triggerId);
      _registry.delete(triggerId);
    }
  }
  rawLog("SCHEDULER_STOPPED", { tenantId }, "SCHEDULER");
}

/**
 * reschedule(tenantId)
 * Stops and restarts timers for a tenant — call after workflow changes.
 */
export function reschedule(tenantId) {
  stopScheduler(tenantId);
  startScheduler(tenantId);
}

// ─────────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────────

function _register(tenantId, workflowId, triggerNode) {
  const triggerId = triggerNode.id;
  const cfg       = triggerNode.config || {};

  // Already registered — skip
  if (_handles.has(triggerId)) return;

  const intervalMs = _parseInterval(cfg.interval) || _parseCron(cfg.cron);
  if (!intervalMs) {
    console.warn(`[BCO Scheduler] TRIGGER_TIME "${triggerId}" has no valid interval or cron. Skipping.`);
    return;
  }

  const handle = setInterval(() => _fire(tenantId, workflowId, triggerId), intervalMs);
  _handles.set(triggerId, handle);
  _registry.set(triggerId, { tenantId, workflowId, config: cfg });

  rawLog("TRIGGER_REGISTERED", { triggerId, tenantId, intervalMs }, "SCHEDULER");
}

function _fire(tenantId, workflowId, triggerId) {
  const workflows = getActiveWorkflows(tenantId);
  const wf        = workflows.find((w) => w.id === workflowId);
  if (!wf) {
    // Workflow was deactivated — clean up timer
    clearInterval(_handles.get(triggerId));
    _handles.delete(triggerId);
    _registry.delete(triggerId);
    return;
  }

  const sentinelEvent = {
    id:        crypto.randomUUID(),
    type:      `SCHEDULED:${triggerId}`,
    source:    "scheduler",
    module:    "SCHEDULER",
    payload:   { triggerId, firedAt: new Date().toISOString() },
    timestamp: new Date().toISOString()
  };

  rawLog("SCHEDULED_TRIGGER_FIRED", { triggerId, workflowId, tenantId }, "SCHEDULER");
  executeWorkflow(wf, sentinelEvent, tenantId);
}

// ─────────────────────────────────────────────
// INTERVAL PARSERS
// ─────────────────────────────────────────────

/**
 * _parseInterval("5m") → 300000
 * Supports: ms, s, m, h, d
 */
function _parseInterval(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) return null;
  const val  = parseFloat(match[1]);
  const unit = match[2];
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * (mult[unit] || 1);
}

/**
 * _parseCron(expr)
 * Minimal cron: "*/5 * * * *" → returns the interval in ms for simple
 * "every N minutes/hours" patterns. Full cron parsing deferred to Run 10.
 */
function _parseCron(expr) {
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min] = parts;
  const everyN = min.match(/^\*\/(\d+)$/);
  if (everyN) return parseInt(everyN[1], 10) * 60_000;

  return null; // Non-simple cron → deferred
}
