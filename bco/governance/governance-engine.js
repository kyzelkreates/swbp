// BCO Governance — Governance Engine (Run 10)
// FINAL AUTHORITY LAYER — sits between the action engine and execution.
// Every action must pass all five governance checks before it executes.
// One failing check = action blocked, logged, reason returned.
//
// System execution flow (Run 10):
//   Event → Rule Engine (R2) → Action Engine → GOVERNANCE ENGINE → Audit → Execute → State (R1)

import { checkPermission, ROLES } from "../auth/permissions.js";
import { getTenant } from "../saas/tenant.js";
import { getSubscription, PLANS } from "../saas/billing.js";
import { AGENT_FORBIDDEN } from "../agents/agent-core.js";
import { auditLog } from "./audit.js";
import { getAutonomyMode, AUTONOMY_MODES } from "./autonomy-control.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// GOVERNANCE CHECK RESULT
// ─────────────────────────────────────────────

/**
 * @typedef {Object} GovernanceResult
 * @property {boolean} allowed
 * @property {boolean} tenant_valid
 * @property {boolean} permission_valid
 * @property {boolean} billing_valid
 * @property {boolean} safety_valid
 * @property {boolean} autonomy_valid
 * @property {boolean} audit_required  — always true for non-trivial actions
 * @property {string[]} violations     — list of check names that failed
 * @property {string}   reason         — human-readable block reason
 */

// ─────────────────────────────────────────────
// ACTION CLASSIFICATION
// ─────────────────────────────────────────────

// Actions that bypass lightweight governance (read-only, telemetry)
const EXEMPT_ACTIONS = new Set([
  "COLLECT_METRICS", "READ_STATE", "AGENT_GOAL_EVENT",
  "UPDATE_FORECAST_STATE", "LOG_INEFFICIENCY", "METRICS_SNAPSHOT"
]);

// Actions that require explicit human approval regardless of autonomy mode
const APPROVAL_REQUIRED = new Set([
  "PRUNE_OLD_LOGS", "ISOLATE_MODULE", "ROLLBACK_WORKFLOW",
  "DELETE_TENANT", "MUTATE_BILLING", "MUTATE_PERMISSIONS",
  "VALIDATE_DESTRUCTIVE_ACTION", "RECOVERY_MODE", "FREEZE_AGENTS"
]);

// ─────────────────────────────────────────────
// GOVERNANCE CHECK ENTRY POINT
// ─────────────────────────────────────────────

/**
 * governanceCheck(action, context)
 * The single gate all actions must pass.
 *
 * @param {{ type, payload, source }} action
 * @param {{ tenantId, userId, userRole, autonomyMode? }} context
 * @returns {GovernanceResult}
 */
export function governanceCheck(action, context = {}) {
  const { tenantId, userId, userRole = ROLES.VIEWER, autonomyMode } = context;
  const violations = [];

  // Exempt lightweight read-only actions from full governance (perf optimisation)
  if (EXEMPT_ACTIONS.has(action.type)) {
    return _allow({ tenant_valid: true, permission_valid: true, billing_valid: true,
                    safety_valid: true, autonomy_valid: true, audit_required: false });
  }

  // ── Check 1: Tenant validity ─────────────────────────────────────
  const tenantValid = _checkTenant(tenantId);
  if (!tenantValid.ok) violations.push("tenant");

  // ── Check 2: Permission validity ─────────────────────────────────
  const permValid = _checkPermission(action, userRole, userId);
  if (!permValid.ok) violations.push("permission");

  // ── Check 3: Billing validity ─────────────────────────────────────
  const billingValid = _checkBilling(tenantId, action);
  if (!billingValid.ok) violations.push("billing");

  // ── Check 4: Safety validity ──────────────────────────────────────
  const safetyValid = _checkSafety(action, context);
  if (!safetyValid.ok) violations.push("safety");

  // ── Check 5: Autonomy mode gate ───────────────────────────────────
  const activeMode = autonomyMode ?? getAutonomyMode(tenantId);
  const autonomyValid = _checkAutonomy(action, activeMode, context);
  if (!autonomyValid.ok) violations.push("autonomy");

  const allowed = violations.length === 0;

  const result = {
    allowed,
    tenant_valid:     tenantValid.ok,
    permission_valid: permValid.ok,
    billing_valid:    billingValid.ok,
    safety_valid:     safetyValid.ok,
    autonomy_valid:   autonomyValid.ok,
    audit_required:   true,
    violations,
    reason: allowed
      ? "all checks passed"
      : `Blocked by: ${violations.join(", ")}. ${[tenantValid, permValid, billingValid, safetyValid, autonomyValid].find(c => !c.ok)?.reason || ""}`
  };

  // Audit every non-exempt action (pass or fail)
  auditLog({
    action:           action.type,
    tenantId,
    userId,
    allowed,
    violations,
    payload:          _safePayload(action.payload),
    governanceResult: result
  });

  if (!allowed) {
    rawLog("GOVERNANCE_BLOCKED", { type: action.type, violations, tenantId }, "GOVERNANCE");
  }

  return result;
}

/**
 * assertGovernance(action, context)
 * Throws if governance fails — use in synchronous action pipelines.
 */
export function assertGovernance(action, context = {}) {
  const result = governanceCheck(action, context);
  if (!result.allowed) {
    throw new Error(`[BCO Governance] Action "${action.type}" blocked. ${result.reason}`);
  }
  return result;
}

// ─────────────────────────────────────────────
// CHECK IMPLEMENTATIONS
// ─────────────────────────────────────────────

function _checkTenant(tenantId) {
  if (!tenantId) return { ok: true, reason: "" }; // platform-level actions (no tenant)

  const tenant = getTenant(tenantId);
  if (!tenant)               return { ok: false, reason: `Tenant "${tenantId}" not found.` };
  if (tenant.status === "suspended")
                             return { ok: false, reason: `Tenant "${tenantId}" is suspended.` };
  return { ok: true, reason: "" };
}

function _checkPermission(action, userRole, userId) {
  // Agents acting as "system" source get operator-level permissions
  const effectiveRole = userRole || ROLES.VIEWER;

  // Admin always passes
  if (effectiveRole === ROLES.ADMIN) return { ok: true, reason: "" };

  // Viewer cannot write anything
  if (effectiveRole === ROLES.VIEWER && _isWriteAction(action.type)) {
    return { ok: false, reason: `Role "${effectiveRole}" cannot execute write action "${action.type}".` };
  }

  // External has no access
  if (effectiveRole === ROLES.EXTERNAL) {
    return { ok: false, reason: `External role cannot execute "${action.type}".` };
  }

  return { ok: true, reason: "" };
}

function _checkBilling(tenantId, action) {
  if (!tenantId) return { ok: true, reason: "" };

  const subscription = getSubscription(tenantId);
  if (!subscription)   return { ok: true, reason: "" }; // no billing = free tier allowed

  // Suspended subscription blocks write actions
  if (subscription.status === "cancelled" && _isWriteAction(action.type)) {
    return { ok: false, reason: `Subscription cancelled — action "${action.type}" blocked.` };
  }

  return { ok: true, reason: "" };
}

function _checkSafety(action, context) {
  // Agent forbidden list (§13 from Run 9)
  if (AGENT_FORBIDDEN.includes(action.type)) {
    return { ok: false, reason: `Action "${action.type}" is on the absolute forbidden list (§13).` };
  }

  // Approval-required actions need explicit approval_status in payload
  if (APPROVAL_REQUIRED.has(action.type)) {
    if (action.payload?.approval_status !== "approved") {
      return {
        ok:     false,
        reason: `Action "${action.type}" requires explicit approval (approval_status: "approved" in payload).`
      };
    }
  }

  return { ok: true, reason: "" };
}

function _checkAutonomy(action, mode, context) {
  // MANUAL: only user-sourced actions pass
  if (mode === AUTONOMY_MODES.MANUAL && context.source !== "user") {
    return { ok: false, reason: `MANUAL mode: only user actions allowed, got source="${context.source}".` };
  }

  // ASSISTED: AI/agent actions blocked unless source is "user" or "approved_suggestion"
  if (mode === AUTONOMY_MODES.ASSISTED &&
      context.source === "agent" &&
      action.payload?.userApproved !== true) {
    return { ok: false, reason: `ASSISTED mode: agent action requires userApproved=true in payload.` };
  }

  // AUTOMATED: only whitelisted workflow action types
  if (mode === AUTONOMY_MODES.AUTOMATED && context.source === "agent") {
    if (!_isAllowedInAutomatedMode(action.type)) {
      return { ok: false, reason: `AUTOMATED mode: action "${action.type}" not in safe-zone whitelist.` };
    }
  }

  // AUTONOMOUS: agent actions allowed but still blocked by safety check above
  return { ok: true, reason: "" };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const WRITE_PREFIXES = ["CREATE", "UPDATE", "DELETE", "TRIGGER", "DISPATCH",
                        "ISOLATE", "RESTORE", "ROLLBACK", "PRUNE", "REBALANCE",
                        "DRAIN", "FREEZE", "NOTIFY", "ACTIVATE", "DEACTIVATE"];

function _isWriteAction(type) {
  return WRITE_PREFIXES.some((p) => type.startsWith(p));
}

const AUTOMATED_SAFE_ACTIONS = new Set([
  "CREATE_ALERT", "SEND_NOTIFICATION", "EMIT_EVENT",
  "TRIGGER_WORKFLOW", "UPDATE_MODULE_STATE",
  "COLLECT_METRICS", "DETECT_ANOMALIES",
  "OPTIMISE_LATENCY", "DRAIN_EVENT_BACKLOG"
]);

function _isAllowedInAutomatedMode(type) {
  return AUTOMATED_SAFE_ACTIONS.has(type);
}

function _allow(checks) {
  return { allowed: true, ...checks, violations: [], reason: "exempt" };
}

function _safePayload(payload) {
  if (!payload) return {};
  // Strip potentially large or sensitive fields from audit payload copy
  const { approval_status, _agentId, _optimiserFix, ...safe } = payload;
  return safe;
}
