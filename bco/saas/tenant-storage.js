// BCO SaaS — Tenant-Scoped Storage Layer (Run 6)
// ALL state reads/writes in a multi-tenant context MUST go through here.
// Wraps the Run 1 StorageAdapter with tenant-namespaced keys.
// Isolation rule: no query can ever touch another tenant's data.

import { StorageAdapter } from "../core/storage-adapter.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// KEY NAMESPACING
// ─────────────────────────────────────────────

/**
 * getTenantKey(tenantId, key)
 * Produces an isolated key: "t:acme123:bco_events"
 * The "t:" prefix separates tenant keys from system keys in the same adapter.
 */
export function getTenantKey(tenantId, key) {
  if (!tenantId) throw new Error("[BCO TenantStorage] tenantId is required.");
  if (!key)      throw new Error("[BCO TenantStorage] key is required.");
  return `t:${tenantId}:${key}`;
}

// ─────────────────────────────────────────────
// TENANT-SCOPED STORAGE API
// ─────────────────────────────────────────────

/**
 * tenantStorage
 * Drop-in replacement for core/storage.js in multi-tenant contexts.
 * Every method requires tenantId as the first argument.
 *
 * Contract: identical surface to core/storage.js but tenant-aware.
 */
export const tenantStorage = {

  get(tenantId, key) {
    return StorageAdapter.get(getTenantKey(tenantId, key));
  },

  set(tenantId, key, value) {
    StorageAdapter.set(getTenantKey(tenantId, key), value);
    rawLog("TENANT_STATE_WRITE", { tenantId, key }, "SAAS");
  },

  update(tenantId, key, fn) {
    const current = this.get(tenantId, key);
    const updated = fn(current);
    this.set(tenantId, key, updated);
  },

  delete(tenantId, key) {
    StorageAdapter.delete(getTenantKey(tenantId, key));
    rawLog("TENANT_STATE_DELETE", { tenantId, key }, "SAAS");
  },

  /**
   * purge(tenantId)
   * Deletes ALL keys belonging to a tenant (e.g. on cancellation).
   * IRREVERSIBLE.
   */
  purge(tenantId) {
    const prefix = `t:${tenantId}:`;
    const allKeys = StorageAdapter.keys().filter((k) => k.startsWith(prefix));
    allKeys.forEach((k) => StorageAdapter.delete(k));
    rawLog("TENANT_PURGED", { tenantId, keysRemoved: allKeys.length }, "SAAS");
    return allKeys.length;
  },

  /**
   * keys(tenantId)
   * Lists all keys belonging to a tenant.
   */
  keys(tenantId) {
    const prefix = `t:${tenantId}:`;
    return StorageAdapter.keys().filter((k) => k.startsWith(prefix));
  }
};

// ─────────────────────────────────────────────
// TENANT SSOT KEYS (parallel to core SSOT_KEYS)
// ─────────────────────────────────────────────

export const TENANT_KEYS = {
  MODULES:  "bco_modules",
  EVENTS:   "bco_events",
  ACTIONS:  "bco_actions",
  ALERTS:   "bco_alerts",
  LOGS:     "bco_logs",
  USAGE:    "bco_usage",
  USERS:    "bco_users",
  BILLING:  "bco_billing"
};
