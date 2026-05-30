// BCO Governance — Compliance Enforcement Layer (Run 10)
// Enforces: data retention, access control, tenant isolation,
// audit requirements, and GDPR-style deletion compliance.

import { StorageAdapter } from "../core/storage-adapter.js";
import { tenantStorage, TENANT_KEYS } from "../saas/tenant-storage.js";
import { purgeAuditEntriesForUser, purgeAuditEntriesOlderThan, auditLog } from "./audit.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// COMPLIANCE POLICY SCHEMA
// ─────────────────────────────────────────────

/**
 * @typedef {Object} CompliancePolicy
 * @property {number}   dataRetentionDays   — max age of log/event data (0 = forever)
 * @property {boolean}  tenantIsolation      — hard enforcement flag
 * @property {boolean}  auditRequired        — every action must be audit-logged
 * @property {boolean}  gdprEnabled          — GDPR deletion rights active
 * @property {string[]} allowedRegions       — data residency (future use)
 * @property {object}   accessControl        — role-based access rules
 */

export const DEFAULT_POLICY = Object.freeze({
  dataRetentionDays: 90,
  tenantIsolation:   true,
  auditRequired:     true,
  gdprEnabled:       true,
  allowedRegions:    ["*"],
  accessControl: Object.freeze({
    adminOnly:    ["DELETE_TENANT", "MUTATE_BILLING", "MUTATE_PERMISSIONS", "PURGE_DATA"],
    operatorOnly: ["ISOLATE_MODULE", "ROLLBACK_WORKFLOW", "ACTIVATE_WORKFLOW"],
    allRoles:     ["READ_STATE", "COLLECT_METRICS", "VIEW_AUDIT_LOG"]
  })
});

const POLICY_KEY = (tenantId) => tenantId
  ? `t:${tenantId}:bco_compliance_policy`
  : "bco_compliance_policy";

// ─────────────────────────────────────────────
// POLICY MANAGEMENT
// ─────────────────────────────────────────────

export function getCompliancePolicy(tenantId = null) {
  return StorageAdapter.get(POLICY_KEY(tenantId)) || DEFAULT_POLICY;
}

export function setCompliancePolicy(tenantId, policy, context = {}) {
  const merged = { ...DEFAULT_POLICY, ...policy };
  StorageAdapter.set(POLICY_KEY(tenantId), merged);
  auditLog({
    action:   "COMPLIANCE_POLICY_UPDATED",
    tenantId,
    userId:   context.userId || "system",
    source:   "governance",
    afterState: merged
  });
  rawLog("COMPLIANCE_POLICY_SET", { tenantId }, "COMPLIANCE");
  return merged;
}

// ─────────────────────────────────────────────
// COMPLIANCE CHECKS
// ─────────────────────────────────────────────

/**
 * checkTenantIsolation(sourceTenantId, targetTenantId)
 * Hard check — tenants must never access each other's data.
 * Throws on violation.
 */
export function checkTenantIsolation(sourceTenantId, targetTenantId) {
  if (sourceTenantId && targetTenantId && sourceTenantId !== targetTenantId) {
    const msg = `[BCO Compliance] Tenant isolation violation: "${sourceTenantId}" attempted to access "${targetTenantId}".`;
    rawLog("TENANT_ISOLATION_VIOLATION", { sourceTenantId, targetTenantId }, "COMPLIANCE");
    auditLog({
      action:   "TENANT_ISOLATION_VIOLATION",
      tenantId: sourceTenantId,
      source:   "compliance",
      payload:  { targetTenantId }
    });
    throw new Error(msg);
  }
  return true;
}

/**
 * checkAccessControl(action, userRole, tenantId?)
 * Returns { allowed, reason }.
 */
export function checkAccessControl(action, userRole, tenantId = null) {
  const policy = getCompliancePolicy(tenantId);
  const ac     = policy.accessControl;

  if (ac.adminOnly?.includes(action) && userRole !== "admin") {
    return { allowed: false, reason: `"${action}" requires admin role.` };
  }
  if (ac.operatorOnly?.includes(action) && !["admin", "operator"].includes(userRole)) {
    return { allowed: false, reason: `"${action}" requires operator or admin role.` };
  }
  return { allowed: true, reason: "" };
}

/**
 * checkAuditRequirement(action, tenantId?)
 * Returns true if the action must be audit-logged per policy.
 */
export function checkAuditRequirement(action, tenantId = null) {
  const policy = getCompliancePolicy(tenantId);
  if (!policy.auditRequired) return false;
  // Read-only / exempt actions don't need audit
  const AUDIT_EXEMPT = new Set(["READ_STATE", "COLLECT_METRICS"]);
  return !AUDIT_EXEMPT.has(action);
}

// ─────────────────────────────────────────────
// DATA RETENTION ENFORCEMENT
// ─────────────────────────────────────────────

/**
 * enforceDataRetention(tenantId?)
 * Purges audit entries and event logs older than the policy retention period.
 * Safe to call on a schedule.
 */
export function enforceDataRetention(tenantId = null) {
  const policy = getCompliancePolicy(tenantId);
  if (!policy.dataRetentionDays || policy.dataRetentionDays === 0) {
    return { skipped: true, reason: "retention=0 (keep forever)" };
  }

  const days = policy.dataRetentionDays;
  const auditResult = purgeAuditEntriesOlderThan(days, tenantId);

  // Also prune event log
  const eventKey  = tenantId ? `t:${tenantId}:bco_events` : "bco_events";
  const cutoff    = new Date(Date.now() - days * 86_400_000).toISOString();
  const events    = StorageAdapter.get(eventKey) || [];
  const kept      = events.filter((e) => e.timestamp >= cutoff);
  const evtPruned = events.length - kept.length;
  StorageAdapter.set(eventKey, kept);

  rawLog("RETENTION_ENFORCED", { tenantId, days, auditPurged: auditResult.removed, eventsPruned: evtPruned }, "COMPLIANCE");

  return {
    tenantId,
    retentionDays:  days,
    auditPurged:    auditResult.removed,
    eventsPruned:   evtPruned
  };
}

// ─────────────────────────────────────────────
// GDPR — RIGHT TO ERASURE
// ─────────────────────────────────────────────

/**
 * erasureRequest(userId, tenantId?, context?)
 * GDPR Article 17 — Right to erasure.
 * Redacts user identity from audit logs and removes user-specific tenant data.
 * Returns a deletion receipt.
 */
export function erasureRequest(userId, tenantId = null, context = {}) {
  if (!userId) throw new Error("[BCO Compliance] erasureRequest requires userId.");

  const policy = getCompliancePolicy(tenantId);
  if (!policy.gdprEnabled) {
    return { processed: false, reason: "GDPR not enabled for this tenant." };
  }

  // 1. Redact from audit log
  const auditResult = purgeAuditEntriesForUser(userId, tenantId);

  // 2. Remove user-specific tenant storage keys
  let storageKeysRemoved = 0;
  if (tenantId) {
    const prefix = `t:${tenantId}:`;
    StorageAdapter.keys(prefix)
      .filter((k) => k.includes(userId))
      .forEach((k) => {
        StorageAdapter.delete(k);
        storageKeysRemoved++;
      });
  }

  const receipt = {
    userId,
    tenantId,
    processedAt:        new Date().toISOString(),
    auditEntriesRedacted: auditResult.purged,
    storageKeysRemoved,
    requestedBy:        context.userId || "system"
  };

  auditLog({
    action:    "GDPR_ERASURE",
    tenantId,
    userId:    context.userId || "system",
    source:    "compliance",
    afterState: { targetUserId: "[REDACTED]", ...receipt }
  });

  rawLog("GDPR_ERASURE_PROCESSED", { userId, tenantId, ...receipt }, "COMPLIANCE");
  return receipt;
}

// ─────────────────────────────────────────────
// FULL COMPLIANCE REPORT
// ─────────────────────────────────────────────

/**
 * generateComplianceReport(tenantId?)
 * Returns a summary of current compliance posture.
 */
export function generateComplianceReport(tenantId = null) {
  const policy = getCompliancePolicy(tenantId);

  return {
    tenantId,
    generatedAt:      new Date().toISOString(),
    policy,
    checks: {
      tenantIsolation: policy.tenantIsolation  ? "enforced"  : "disabled",
      auditLogging:    policy.auditRequired    ? "active"    : "disabled",
      gdpr:            policy.gdprEnabled      ? "enabled"   : "disabled",
      dataRetention:   policy.dataRetentionDays > 0
                         ? `${policy.dataRetentionDays} days`
                         : "unlimited"
    },
    status: "compliant"
  };
}
