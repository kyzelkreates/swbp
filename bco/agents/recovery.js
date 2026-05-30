// BCO Agents — Failure Recovery System (Run 9)
// Handles module isolation, state rollback, anomaly response,
// and system recovery mode.
// All mutations route through the action engine (§13).
// Recovery agent cannot touch billing, permissions, or cross-tenant data.

import { dispatchAction } from "../core/actions.js";
import { pushNotification } from "../ui/notifications.js";
import { rawLog } from "../core/storage.js";
import { tenantStorage, TENANT_KEYS } from "../saas/tenant-storage.js";
import { rollbackWorkflow, listWorkflows } from "../nocode/workflow-registry.js";

// ─────────────────────────────────────────────
// ANOMALY RESPONSE
// ─────────────────────────────────────────────

/**
 * handleAnomaly(anomaly, tenantId?, agent?)
 * Routes to the appropriate recovery action based on severity.
 *
 * @param {{ severity: "low"|"medium"|"high"|"critical", module?, detail? }} anomaly
 * @returns {{ severity, action, result }}
 */
export function handleAnomaly(anomaly, tenantId = null, agent = null) {
  const response = {
    severity: anomaly.severity,
    action:   null,
    result:   null,
    tenantId,
    timestamp: new Date().toISOString()
  };

  rawLog("ANOMALY_RECEIVED", { severity: anomaly.severity, module: anomaly.module }, "RECOVERY");

  switch (anomaly.severity) {
    case "critical":
      response.action = "RECOVERY_MODE";
      response.result = recoveryMode(anomaly.module, tenantId);
      break;

    case "high":
      response.action = "ISOLATE_MODULE";
      response.result = isolateFaultyModule(anomaly.module, tenantId);
      break;

    case "medium":
      response.action = "CREATE_ALERT";
      response.result = dispatchAction({
        type:    "CREATE_ALERT",
        payload: { severity: "medium", message: `Anomaly detected: ${anomaly.detail || anomaly.module}`, module: anomaly.module, tenantId },
        source:  "recovery"
      });
      break;

    case "low":
    default:
      response.action = "LOG_ANOMALY";
      rawLog("ANOMALY_LOGGED", { detail: anomaly.detail, module: anomaly.module }, "RECOVERY");
      response.result = { logged: true };
  }

  return response;
}

// ─────────────────────────────────────────────
// RECOVERY MODE
// ─────────────────────────────────────────────

/**
 * recoveryMode(moduleName?, tenantId?)
 * Full recovery sequence: isolate → rollback → notify.
 * Returns a recovery report.
 */
export function recoveryMode(moduleName = null, tenantId = null) {
  const report = {
    initiated:  new Date().toISOString(),
    moduleName,
    tenantId,
    steps:      [],
    completed:  false
  };

  rawLog("RECOVERY_MODE_START", { moduleName, tenantId }, "RECOVERY");

  // Step 1: Isolate the faulty module
  if (moduleName) {
    const isolation = isolateFaultyModule(moduleName, tenantId);
    report.steps.push({ step: "isolate_module", result: isolation });
  }

  // Step 2: Rollback to last safe state
  const rollback = rollbackLastSafeState(tenantId);
  report.steps.push({ step: "rollback_state", result: rollback });

  // Step 3: Notify admin
  const notification = notifySystemAdmin(
    `🚨 Recovery mode activated${moduleName ? ` for module "${moduleName}"` : ""}.`,
    tenantId
  );
  report.steps.push({ step: "notify_admin", result: notification });

  report.completed = true;
  rawLog("RECOVERY_MODE_COMPLETE", { tenantId, steps: report.steps.length }, "RECOVERY");

  return report;
}

// ─────────────────────────────────────────────
// MODULE ISOLATION
// ─────────────────────────────────────────────

/**
 * isolateFaultyModule(moduleName, tenantId?)
 * Disables event routing to a module by dispatching an ISOLATE_MODULE action.
 * Does NOT delete module data — isolation is reversible.
 */
export function isolateFaultyModule(moduleName, tenantId = null) {
  if (!moduleName) return { isolated: false, reason: "no module specified" };

  const result = dispatchAction({
    type:    "ISOLATE_MODULE",
    payload: { moduleName, tenantId, isolatedAt: new Date().toISOString() },
    source:  "recovery"
  });

  rawLog("MODULE_ISOLATED", { moduleName, tenantId }, "RECOVERY");

  // Also deactivate any active workflows tied to this module
  if (tenantId) {
    _deactivateModuleWorkflows(moduleName, tenantId);
  }

  return { isolated: true, module: moduleName, actionResult: result };
}

/**
 * restoreModule(moduleName, tenantId?)
 * Reverses isolation — re-enables event routing.
 */
export function restoreModule(moduleName, tenantId = null) {
  const result = dispatchAction({
    type:    "RESTORE_MODULE",
    payload: { moduleName, tenantId, restoredAt: new Date().toISOString() },
    source:  "recovery"
  });

  rawLog("MODULE_RESTORED", { moduleName, tenantId }, "RECOVERY");
  return { restored: true, module: moduleName, actionResult: result };
}

// ─────────────────────────────────────────────
// STATE ROLLBACK
// ─────────────────────────────────────────────

/**
 * rollbackLastSafeState(tenantId?)
 * Attempts to rollback the most recently modified active workflow
 * to its previous version. Returns a rollback report.
 */
export function rollbackLastSafeState(tenantId = null) {
  if (!tenantId) {
    rawLog("ROLLBACK_SKIPPED", { reason: "no tenantId" }, "RECOVERY");
    return { rolledBack: false, reason: "tenantId required for state rollback" };
  }

  try {
    const workflows = listWorkflows(tenantId).filter((w) => w.active && w.history?.length > 0);
    if (!workflows.length) {
      return { rolledBack: false, reason: "no active workflows with history" };
    }

    // Roll back the most recently updated active workflow
    const target = workflows.sort((a, b) => b.updatedAt > a.updatedAt ? 1 : -1)[0];
    const rolled = rollbackWorkflow(tenantId, target.id);

    rawLog("STATE_ROLLED_BACK", { tenantId, workflowId: target.id, toVersion: rolled.version }, "RECOVERY");
    return { rolledBack: true, workflowId: target.id, version: rolled.version };

  } catch (err) {
    rawLog("ROLLBACK_FAILED", { tenantId, error: err.message }, "RECOVERY");
    return { rolledBack: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// ADMIN NOTIFICATION
// ─────────────────────────────────────────────

export function notifySystemAdmin(message, tenantId = null) {
  pushNotification(message, "critical", "RECOVERY");

  dispatchAction({
    type:    "NOTIFY_ADMIN",
    payload: { message, tenantId, channel: "system", timestamp: new Date().toISOString() },
    source:  "recovery"
  });

  rawLog("ADMIN_NOTIFIED", { message, tenantId }, "RECOVERY");
  return { notified: true, message };
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _deactivateModuleWorkflows(moduleName, tenantId) {
  try {
    const workflows = listWorkflows(tenantId).filter(
      (w) => w.active && w.nodes?.some((n) => n.config?.module === moduleName)
    );

    workflows.forEach((wf) => {
      dispatchAction({
        type:    "DEACTIVATE_WORKFLOW",
        payload: { workflowId: wf.id, tenantId, reason: `module ${moduleName} isolated` },
        source:  "recovery"
      });
    });

    if (workflows.length > 0) {
      rawLog("MODULE_WORKFLOWS_DEACTIVATED", { moduleName, count: workflows.length }, "RECOVERY");
    }
  } catch { /* non-fatal — workflow layer may not be initialised */ }
}
