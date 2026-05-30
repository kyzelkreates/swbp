// BCO SaaS — Tenant Core Model + Registry (Run 6)
// Every system instance belongs to a tenant.
// Tenant isolation is enforced at the storage layer via key namespacing.
// No cross-tenant access is permitted at any layer.

import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// TENANT SCHEMA (contract)
// ─────────────────────────────────────────────

/**
 * @typedef {Object} Tenant
 * @property {string}   tenant_id
 * @property {string}   name
 * @property {"starter"|"pro"|"enterprise"} plan
 * @property {object}   branding_config       — BrandConfig (Run 4)
 * @property {string[]} modules_enabled       — module names from marketplace
 * @property {string[]} users                 — user IDs belonging to this tenant
 * @property {object}   settings              — tenant-level config overrides
 * @property {"active"|"suspended"|"cancelled"} status
 * @property {string}   created_at
 */

const DEFAULT_TENANT = {
  plan:            "starter",
  branding_config: {},
  modules_enabled: [],
  users:           [],
  settings:        {},
  status:          "active",
  created_at:      null
};

// ─────────────────────────────────────────────
// IN-MEMORY TENANT REGISTRY
// ─────────────────────────────────────────────

const _tenantRegistry = new Map();

// ─────────────────────────────────────────────
// TENANT CRUD
// ─────────────────────────────────────────────

/**
 * createTenant(fields)
 * Registers a new tenant in the in-memory registry.
 * @returns {Tenant}
 */
export function createTenant(fields) {
  if (!fields.tenant_id) throw new Error("[BCO Tenant] tenant_id is required.");
  if (!fields.name)      throw new Error("[BCO Tenant] name is required.");

  if (_tenantRegistry.has(fields.tenant_id)) {
    throw new Error(`[BCO Tenant] Tenant "${fields.tenant_id}" already exists.`);
  }

  const tenant = {
    ...DEFAULT_TENANT,
    ...fields,
    created_at: new Date().toISOString()
  };

  _tenantRegistry.set(tenant.tenant_id, tenant);
  rawLog("TENANT_CREATED", { tenant_id: tenant.tenant_id, plan: tenant.plan }, "SAAS");

  return tenant;
}

/**
 * getTenant(tenantId)
 */
export function getTenant(tenantId) {
  return _tenantRegistry.get(tenantId) || null;
}

/**
 * updateTenant(tenantId, patch)
 * Applies a partial update. Returns updated tenant.
 */
export function updateTenant(tenantId, patch) {
  const tenant = _tenantRegistry.get(tenantId);
  if (!tenant) throw new Error(`[BCO Tenant] Tenant "${tenantId}" not found.`);

  const updated = { ...tenant, ...patch };
  _tenantRegistry.set(tenantId, updated);
  rawLog("TENANT_UPDATED", { tenant_id: tenantId, fields: Object.keys(patch) }, "SAAS");

  return updated;
}

/**
 * listTenants()
 * Super-admin only. Returns all registered tenants.
 */
export function listTenants() {
  return [..._tenantRegistry.values()];
}

/**
 * suspendTenant(tenantId)
 */
export function suspendTenant(tenantId) {
  return updateTenant(tenantId, { status: "suspended" });
}

// ─────────────────────────────────────────────
// TENANT RESOLVER (request-level)
// ─────────────────────────────────────────────

/**
 * resolveTenant(request)
 * Extracts tenantId and userId from an HTTP request-like object.
 * Supports: header "x-tenant-id", URL param, or subdomain.
 *
 * @param {{ headers?, query?, hostname?, user? }} request
 * @returns {{ tenantId, userId, tenant }}
 */
export function resolveTenant(request = {}) {
  // Priority: header → query param → subdomain
  const tenantId =
    request.headers?.["x-tenant-id"] ||
    request.query?.tenant_id          ||
    _subdomainTenantId(request.hostname);

  if (!tenantId) {
    throw new Error("[BCO Tenant] Cannot resolve tenant — no x-tenant-id header, query param, or subdomain.");
  }

  const tenant = getTenant(tenantId);
  if (!tenant) {
    throw new Error(`[BCO Tenant] Tenant "${tenantId}" not found.`);
  }

  if (tenant.status !== "active") {
    throw new Error(`[BCO Tenant] Tenant "${tenantId}" is ${tenant.status}.`);
  }

  return {
    tenantId,
    userId: request.user?.id || null,
    tenant
  };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _subdomainTenantId(hostname) {
  if (!hostname) return null;
  const parts = hostname.split(".");
  // e.g. acme.bco.app → "acme"
  return parts.length >= 3 ? parts[0] : null;
}
