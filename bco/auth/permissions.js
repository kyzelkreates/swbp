// BCO Auth — Role + Permission System (Run 6)
// Five-tier role hierarchy. Platform-wide and tenant-scoped checks.
// No session management here — this is pure permission logic.

import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// ROLE DEFINITIONS
// ─────────────────────────────────────────────

/**
 * ROLES — priority order (0 = highest)
 * super_admin  : platform owner, unrestricted
 * tenant_admin : client account owner
 * operator     : standard authenticated user
 * viewer       : read-only user
 * external_user: limited, scoped read access
 */
export const ROLES = {
  SUPER_ADMIN:   "super_admin",
  TENANT_ADMIN:  "tenant_admin",
  OPERATOR:      "operator",
  VIEWER:        "viewer",
  EXTERNAL_USER: "external_user"
};

// ─────────────────────────────────────────────
// PERMISSION MAP
// ─────────────────────────────────────────────

const PERMISSION_MAP = {
  super_admin:   ["*"],                                          // all actions
  tenant_admin:  ["read", "write", "manage", "install_module",
                  "configure_billing", "invite_user"],
  operator:      ["read", "write", "create_event",
                  "trigger_action", "dismiss_alert"],
  viewer:        ["read"],
  external_user: ["read_limited"]
};

/**
 * ROLE_PRIORITY
 * Numeric seniority for hierarchy comparisons.
 */
const ROLE_PRIORITY = {
  super_admin:   0,
  tenant_admin:  1,
  operator:      2,
  viewer:        3,
  external_user: 4
};

// ─────────────────────────────────────────────
// CORE PERMISSION CHECK
// ─────────────────────────────────────────────

/**
 * checkPermission(role, action)
 * Returns true if the role is allowed to perform the action.
 * super_admin wildcard "*" matches everything.
 */
export function checkPermission(role, action) {
  const perms = PERMISSION_MAP[role];
  if (!perms) return false;
  return perms.includes("*") || perms.includes(action);
}

/**
 * assertPermission(role, action, context?)
 * Throws if the check fails. Use at action boundaries.
 */
export function assertPermission(role, action, context = "") {
  if (!checkPermission(role, action)) {
    const msg = `[BCO Auth] Role "${role}" denied action "${action}"${context ? ` (${context})` : ""}.`;
    rawLog("AUTH_PERMISSION_DENIED", { role, action, context }, "AUTH");
    throw new Error(msg);
  }
  rawLog("AUTH_PERMISSION_GRANTED", { role, action }, "AUTH");
}

/**
 * getPermissions(role)
 * Returns the full permission list for a role.
 */
export function getPermissions(role) {
  return PERMISSION_MAP[role] || [];
}

// ─────────────────────────────────────────────
// ROLE HIERARCHY UTILITIES
// ─────────────────────────────────────────────

/**
 * isAtLeast(role, minimumRole)
 * Returns true if role is equal to or more privileged than minimumRole.
 * e.g. isAtLeast("tenant_admin", "operator") → true
 */
export function isAtLeast(role, minimumRole) {
  const rp = ROLE_PRIORITY[role]         ?? 99;
  const mp = ROLE_PRIORITY[minimumRole]  ?? 99;
  return rp <= mp;
}

/**
 * higherRole(roleA, roleB)
 * Returns whichever role has higher privilege.
 */
export function higherRole(roleA, roleB) {
  return ROLE_PRIORITY[roleA] <= ROLE_PRIORITY[roleB] ? roleA : roleB;
}

// ─────────────────────────────────────────────
// MODULE-LEVEL PERMISSION GATE
// ─────────────────────────────────────────────

/**
 * canAccessModule(module, role)
 * Checks module-level read permission (Run 3 module.permissions.read).
 */
export function canAccessModule(module, role) {
  return (
    isAtLeast(role, ROLES.SUPER_ADMIN) ||
    module.permissions?.read?.includes(role)
  );
}

/**
 * canWriteModule(module, role)
 */
export function canWriteModule(module, role) {
  return (
    isAtLeast(role, ROLES.SUPER_ADMIN) ||
    module.permissions?.write?.includes(role)
  );
}

// ─────────────────────────────────────────────
// TENANT MEMBERSHIP CHECK
// ─────────────────────────────────────────────

/**
 * assertTenantMembership(userId, tenant)
 * Throws if the user is not a member of the tenant.
 * Critical isolation guard — must be called before any tenant data access.
 */
export function assertTenantMembership(userId, tenant) {
  if (!tenant.users.includes(userId)) {
    rawLog("AUTH_TENANT_VIOLATION", { userId, tenant_id: tenant.tenant_id }, "AUTH");
    throw new Error(
      `[BCO Auth] User "${userId}" is not a member of tenant "${tenant.tenant_id}".`
    );
  }
}
