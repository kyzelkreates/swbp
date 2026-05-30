// BCO SaaS — Module Marketplace Engine (Run 6)
// Handles module discovery, installation, uninstallation per tenant.
// Install/uninstall are write operations but scoped to tenant storage only.
// No cross-tenant module access.

import { tenantStorage, TENANT_KEYS } from "./tenant-storage.js";
import { getTenant, updateTenant } from "./tenant.js";
import { assertPlanFeature } from "./billing.js";
import { PLANS } from "./billing.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// MODULE CATALOGUE
// ─────────────────────────────────────────────

/**
 * MARKETPLACE_CATALOGUE
 * The registry of all available modules.
 * Extend this as new modules are built.
 */
export const MARKETPLACE_CATALOGUE = [
  {
    name:        "sleep",
    version:     "1.0",
    category:    "health",
    description: "Sleep tracking and quality analysis",
    requiredPlan: "starter"
  },
  {
    name:        "neurocare",
    version:     "1.0",
    category:    "health",
    description: "Neurodivergent care and child profile management",
    requiredPlan: "starter"
  },
  {
    name:        "fleet",
    version:     "1.0",
    category:    "logistics",
    description: "Fleet vehicle tracking and operations management",
    requiredPlan: "pro"
  },
  {
    name:        "business_ops",
    version:     "1.0",
    category:    "business",
    description: "Business operations, KPIs and workflow management",
    requiredPlan: "starter"
  },
  {
    name:        "ai_agents",
    version:     "1.0",
    category:    "ai",
    description: "Autonomous AI agent task execution layer",
    requiredPlan: "enterprise"
  }
];

/**
 * listAvailableModules(planFilter?)
 * Returns modules available for a given plan, or all if no filter.
 */
export function listAvailableModules(plan = null) {
  if (!plan) return MARKETPLACE_CATALOGUE;

  const planOrder = { starter: 0, pro: 1, enterprise: 2 };
  const planLevel = planOrder[plan] ?? 0;

  return MARKETPLACE_CATALOGUE.filter(
    (m) => (planOrder[m.requiredPlan] ?? 0) <= planLevel
  );
}

// ─────────────────────────────────────────────
// INSTALL
// ─────────────────────────────────────────────

/**
 * installModule(tenantId, moduleName)
 * Installs a module for a tenant after validating plan eligibility and module limit.
 * @returns {{ name, version, installedAt }}
 */
export function installModule(tenantId, moduleName) {
  const tenant     = _assertTenant(tenantId);
  const catalogueEntry = MARKETPLACE_CATALOGUE.find((m) => m.name === moduleName);

  if (!catalogueEntry) {
    throw new Error(`[BCO Marketplace] Module "${moduleName}" not found in catalogue.`);
  }

  // Plan gate: check module requires at most the tenant's plan
  const planOrder  = { starter: 0, pro: 1, enterprise: 2 };
  const tenantLevel = planOrder[tenant.plan] ?? 0;
  const moduleLevel = planOrder[catalogueEntry.requiredPlan] ?? 0;
  if (moduleLevel > tenantLevel) {
    throw new Error(
      `[BCO Marketplace] Module "${moduleName}" requires the "${catalogueEntry.requiredPlan}" plan. Current plan: "${tenant.plan}".`
    );
  }

  // Module limit gate
  const plan        = PLANS[tenant.plan];
  const currentCount = tenant.modules_enabled?.length ?? 0;
  if (currentCount >= plan.moduleLimit) {
    throw new Error(
      `[BCO Marketplace] Module limit (${plan.moduleLimit}) reached on "${tenant.plan}" plan. Upgrade or add overage billing.`
    );
  }

  // Already installed?
  if (tenant.modules_enabled?.includes(moduleName)) {
    console.warn(`[BCO Marketplace] Module "${moduleName}" is already installed for tenant "${tenantId}".`);
    return null;
  }

  // Persist to tenant storage
  const record = {
    name:        catalogueEntry.name,
    version:     catalogueEntry.version,
    installedAt: new Date().toISOString()
  };

  const tenantModules = tenantStorage.get(tenantId, TENANT_KEYS.MODULES) || [];
  tenantModules.push(record);
  tenantStorage.set(tenantId, TENANT_KEYS.MODULES, tenantModules);

  // Update tenant model
  const modules_enabled = [...(tenant.modules_enabled || []), moduleName];
  updateTenant(tenantId, { modules_enabled });

  rawLog("MODULE_INSTALLED", { tenantId, moduleName }, "MARKETPLACE");
  console.log(`[BCO Marketplace] "${moduleName}" installed for tenant "${tenantId}".`);

  return record;
}

/**
 * uninstallModule(tenantId, moduleName)
 */
export function uninstallModule(tenantId, moduleName) {
  const tenant = _assertTenant(tenantId);

  const tenantModules = (tenantStorage.get(tenantId, TENANT_KEYS.MODULES) || [])
    .filter((m) => m.name !== moduleName);
  tenantStorage.set(tenantId, TENANT_KEYS.MODULES, tenantModules);

  const modules_enabled = (tenant.modules_enabled || []).filter((n) => n !== moduleName);
  updateTenant(tenantId, { modules_enabled });

  rawLog("MODULE_UNINSTALLED", { tenantId, moduleName }, "MARKETPLACE");
  return true;
}

/**
 * getInstalledModules(tenantId)
 * Returns the list of module records currently installed for a tenant.
 */
export function getInstalledModules(tenantId) {
  return tenantStorage.get(tenantId, TENANT_KEYS.MODULES) || [];
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _assertTenant(tenantId) {
  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error(`[BCO Marketplace] Tenant "${tenantId}" not found.`);
  if (tenant.status !== "active") throw new Error(`[BCO Marketplace] Tenant "${tenantId}" is ${tenant.status}.`);
  return tenant;
}
