// BCO Governance — Autonomy Control Mode System (Run 10)
// Four modes gate how much autonomous execution is permitted per tenant.
// The governance engine reads the active mode on every action check.
// Mode changes are audit-logged and require admin permission.

import { StorageAdapter } from "../core/storage-adapter.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// AUTONOMY MODES
// ─────────────────────────────────────────────

export const AUTONOMY_MODES = {
  MANUAL:     "manual",      // user controls all actions
  ASSISTED:   "assisted",    // AI suggests, user approves
  AUTOMATED:  "automated",   // predefined workflows allowed in safe zones
  AUTONOMOUS: "autonomous"   // agents active under strict governance + sandbox
};

// Default mode for new tenants
export const DEFAULT_AUTONOMY_MODE = AUTONOMY_MODES.ASSISTED;

// Mode capability matrix — what is allowed at each level
export const MODE_CAPABILITIES = {
  [AUTONOMY_MODES.MANUAL]: {
    userActions:      true,
    aiSuggestions:    false,
    agentExecution:   false,
    workflowAuto:     false,
    description:      "Full manual control. No AI or agent automation."
  },
  [AUTONOMY_MODES.ASSISTED]: {
    userActions:      true,
    aiSuggestions:    true,
    agentExecution:   false, // agents suggest only
    workflowAuto:     false,
    description:      "AI suggests, user approves all actions."
  },
  [AUTONOMY_MODES.AUTOMATED]: {
    userActions:      true,
    aiSuggestions:    true,
    agentExecution:   true,  // within safe-zone whitelist only
    workflowAuto:     true,
    description:      "Pre-approved workflows run automatically. Agents limited to safe actions."
  },
  [AUTONOMY_MODES.AUTONOMOUS]: {
    userActions:      true,
    aiSuggestions:    true,
    agentExecution:   true,  // full — but still blocked by §13 + governance
    workflowAuto:     true,
    description:      "Full agent autonomy under governance and sandbox constraints."
  }
};

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────

const MODE_KEY = (tenantId) => tenantId ? `t:${tenantId}:bco_autonomy_mode` : "bco_autonomy_mode";

// ─────────────────────────────────────────────
// READ / WRITE
// ─────────────────────────────────────────────

/**
 * getAutonomyMode(tenantId?)
 */
export function getAutonomyMode(tenantId = null) {
  return StorageAdapter.get(MODE_KEY(tenantId)) || DEFAULT_AUTONOMY_MODE;
}

/**
 * setAutonomyMode(mode, tenantId?, context?)
 * Requires admin role. Logs the change.
 *
 * @param {string}  mode      — from AUTONOMY_MODES
 * @param {string}  tenantId
 * @param {{ userId, userRole }} context
 */
export function setAutonomyMode(mode, tenantId = null, context = {}) {
  if (!Object.values(AUTONOMY_MODES).includes(mode)) {
    throw new Error(`[BCO Autonomy] Unknown mode: "${mode}". Valid: ${Object.values(AUTONOMY_MODES).join(", ")}`);
  }

  // Only admins can change autonomy mode
  if (context.userRole && context.userRole !== "admin") {
    throw new Error(`[BCO Autonomy] Only admins can change autonomy mode. Got role: "${context.userRole}".`);
  }

  const previous = getAutonomyMode(tenantId);
  StorageAdapter.set(MODE_KEY(tenantId), mode);

  rawLog("AUTONOMY_MODE_CHANGED", {
    tenantId,
    from:   previous,
    to:     mode,
    userId: context.userId || "system"
  }, "GOVERNANCE");

  return { previous, current: mode, tenantId };
}

/**
 * getModeCapabilities(mode?)
 * Returns the capability matrix for a given mode (or current mode).
 */
export function getModeCapabilities(mode = null, tenantId = null) {
  const activeMode = mode || getAutonomyMode(tenantId);
  return { mode: activeMode, ...MODE_CAPABILITIES[activeMode] };
}

/**
 * canAgentsExecute(tenantId?)
 * Quick check used by the agent pool before running goals.
 */
export function canAgentsExecute(tenantId = null) {
  return MODE_CAPABILITIES[getAutonomyMode(tenantId)]?.agentExecution ?? false;
}

/**
 * canWorkflowsAutoRun(tenantId?)
 */
export function canWorkflowsAutoRun(tenantId = null) {
  return MODE_CAPABILITIES[getAutonomyMode(tenantId)]?.workflowAuto ?? false;
}
