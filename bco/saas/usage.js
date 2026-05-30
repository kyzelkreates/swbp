// BCO SaaS — Usage Tracking Engine (Run 6)
// Tracks per-tenant action usage for billing, analytics, and rate limiting.
// All writes are tenant-scoped. No cross-tenant reads.

import { tenantStorage, TENANT_KEYS } from "./tenant-storage.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// TRACKED ACTION CATEGORIES
// ─────────────────────────────────────────────

export const USAGE_CATEGORIES = {
  API_CALL:       "api_call",
  AI_ANALYSIS:    "ai_analysis",
  MODULE_EVENT:   "module_event",
  ACTION_RUN:     "action_run",
  DASHBOARD_LOAD: "dashboard_load",
  PWA_QUICK_ACTION: "pwa_quick_action"
};

// ─────────────────────────────────────────────
// TRACK USAGE
// ─────────────────────────────────────────────

/**
 * trackUsage(tenantId, action, metadata?)
 * Appends a usage record for a tenant.
 * Lightweight — designed to be called on every tenant action.
 */
export function trackUsage(tenantId, action, metadata = {}) {
  if (!tenantId || !action) return;

  const record = {
    id:        crypto.randomUUID(),
    action,
    metadata,
    timestamp: new Date().toISOString()
  };

  tenantStorage.update(tenantId, TENANT_KEYS.USAGE, (usage) => [
    ...(usage || []),
    record
  ]);

  rawLog("USAGE_TRACKED", { tenantId, action }, "USAGE");
  return record;
}

// ─────────────────────────────────────────────
// USAGE QUERIES
// ─────────────────────────────────────────────

/**
 * getUsage(tenantId, options?)
 * Returns usage records, optionally filtered by time range or action.
 *
 * @param {string} tenantId
 * @param {{ since?, until?, action?, limit? }} options
 */
export function getUsage(tenantId, { since, until, action, limit = 500 } = {}) {
  let records = tenantStorage.get(tenantId, TENANT_KEYS.USAGE) || [];

  if (since)  records = records.filter((r) => r.timestamp >= since);
  if (until)  records = records.filter((r) => r.timestamp <= until);
  if (action) records = records.filter((r) => r.action === action);

  return records.slice(-limit);
}

/**
 * getUsageSummary(tenantId)
 * Returns aggregated usage counts per action category.
 */
export function getUsageSummary(tenantId) {
  const records = tenantStorage.get(tenantId, TENANT_KEYS.USAGE) || [];

  const counts = records.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  // Rolling 30-day window
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentRecords = records.filter((r) => r.timestamp >= thirtyDaysAgo);

  return {
    tenantId,
    totalEvents:      records.length,
    last30Days:       recentRecords.length,
    byAction:         counts,
    firstEventAt:     records[0]?.timestamp || null,
    lastEventAt:      records[records.length - 1]?.timestamp || null
  };
}

// ─────────────────────────────────────────────
// RATE LIMITING (soft gate)
// ─────────────────────────────────────────────

const PLAN_LIMITS = {
  starter:    { ai_analysis: 100,  api_call: 5_000  },
  pro:        { ai_analysis: 1_000, api_call: 50_000 },
  enterprise: { ai_analysis: Infinity, api_call: Infinity }
};

/**
 * assertRateLimit(tenant, action)
 * Throws if the tenant has exceeded their monthly action quota.
 * Called before expensive operations (AI analysis, API calls).
 */
export function assertRateLimit(tenant, action) {
  const limit = PLAN_LIMITS[tenant.plan]?.[action];
  if (!limit || limit === Infinity) return;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const records = getUsage(tenant.tenant_id, {
    since:  monthStart.toISOString(),
    action
  });

  if (records.length >= limit) {
    rawLog("RATE_LIMIT_EXCEEDED", { tenantId: tenant.tenant_id, action, limit }, "USAGE");
    throw new Error(
      `[BCO Usage] Monthly limit for "${action}" (${limit}) reached on "${tenant.plan}" plan.`
    );
  }
}
