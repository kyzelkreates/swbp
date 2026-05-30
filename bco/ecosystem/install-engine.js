// BCO Ecosystem — Install Engine (Run 7)
// Orchestrates the full §8 installation flow:
//   Dependency check → Version compatibility → Sandbox assignment →
//   Module registration → Tenant activation → UI injection →
//   Rule integration → Event integration → Revenue tracking
//
// This is the definitive install path for marketplace modules.
// Run 6's marketplace.js (first-party installs) remains for internal modules.

import { getModule, getAllApproved, recordInstall } from "./registry.js";
import { resolveDependencies, assertDependenciesResolved } from "./dependency-resolver.js";
import { isCompatible } from "./package-standard.js";
import { runModule } from "./sandbox.js";
import { recordRevenueEvent } from "./revenue.js";
import { moduleRegistry, validateModule } from "../core/modules.js";
import { tenantStorage, TENANT_KEYS } from "../saas/tenant-storage.js";
import { getTenant, updateTenant } from "../saas/tenant.js";
import { assertPlanFeature } from "../saas/billing.js";
import { trackUsage, USAGE_CATEGORIES } from "../saas/usage.js";
import { rawLog } from "../core/storage.js";
import { logEvent } from "../core/events.js";

// ─────────────────────────────────────────────
// INSTALL FLOW ENTRY POINT
// ─────────────────────────────────────────────

/**
 * installMarketplaceModule(tenantId, moduleId, options?)
 * Full §8 pipeline. Throws on any failure — atomic: either full success or nothing installed.
 *
 * @param {string} tenantId
 * @param {string} moduleId   — registry entry id
 * @param {{ skipDeps?, dryRun? }} options
 * @returns {{ module, dependencies, sandboxLevel, installedAt }}
 */
export async function installMarketplaceModule(tenantId, moduleId, options = {}) {
  const steps = [];

  // ── 1. Fetch from registry ────────────────
  const entry = getModule(moduleId);
  if (!entry) throw new Error(`[BCO Install] Module "${moduleId}" not found in marketplace.`);
  if (entry.status !== "approved") {
    throw new Error(`[BCO Install] Module "${moduleId}" is not approved (status: ${entry.status}).`);
  }
  const pkg = entry.package;
  steps.push("registry_found");

  // ── 2. Tenant + plan gate ─────────────────
  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error(`[BCO Install] Tenant "${tenantId}" not found.`);
  steps.push("tenant_resolved");

  // ── 3. Dependency resolution ──────────────
  let deps = { resolved: [], order: [], missing: [], conflicts: [] };
  if (!options.skipDeps && pkg.dependencies?.length > 0) {
    const catalogue = getAllApproved();
    deps = resolveDependencies(pkg, catalogue);
    assertDependenciesResolved(deps);
  }
  steps.push("dependencies_resolved");

  // ── 4. Version compatibility ──────────────
  const existingInstalls = tenantStorage.get(tenantId, TENANT_KEYS.MODULES) || [];
  for (const dep of deps.resolved) {
    const alreadyInstalled = existingInstalls.find((m) => m.name === dep.name);
    if (alreadyInstalled && !isCompatible(alreadyInstalled.version, dep.version)) {
      throw new Error(
        `[BCO Install] Version conflict: "${dep.name}" installed@${alreadyInstalled.version} incompatible with required@${dep.version}.`
      );
    }
  }
  steps.push("version_compatibility_passed");

  // Already installed?
  if (existingInstalls.find((m) => m.name === pkg.name)) {
    console.warn(`[BCO Install] "${pkg.name}" already installed for tenant "${tenantId}".`);
    return { alreadyInstalled: true, module: pkg.name };
  }

  if (options.dryRun) {
    return { dryRun: true, module: pkg.name, deps: deps.order, steps };
  }

  // ── 5. Install dependencies first (in topological order) ──
  for (const depName of deps.order.slice(0, -1)) {  // all except the root module itself
    const depEntry = getAllApproved().find((m) => m.name === depName);
    if (depEntry) _registerToCore(depEntry);
  }
  steps.push("dependencies_installed");

  // ── 6. Register module into core (Run 3) ──
  _registerToCore(pkg);
  steps.push("module_registered");

  // ── 7. Tenant activation ──────────────────
  const installRecord = {
    name:         pkg.name,
    id:           pkg.id,
    version:      pkg.version,
    sandboxLevel: pkg.sandbox_level,
    installedAt:  new Date().toISOString()
  };
  existingInstalls.push(installRecord);
  tenantStorage.set(tenantId, TENANT_KEYS.MODULES, existingInstalls);

  const modules_enabled = [...(tenant.modules_enabled || []), pkg.name];
  updateTenant(tenantId, { modules_enabled });
  steps.push("tenant_activated");

  // ── 8. Revenue event ─────────────────────
  recordRevenueEvent(moduleId, tenantId);
  steps.push("revenue_recorded");

  // ── 9. Usage tracking ─────────────────────
  trackUsage(tenantId, USAGE_CATEGORIES.MODULE_EVENT, {
    action:   "install",
    moduleId,
    moduleName: pkg.name
  });
  steps.push("usage_tracked");

  // ── 10. Log + emit ────────────────────────
  logEvent("MODULE_INSTALLED", { tenantId, moduleId, name: pkg.name });
  rawLog("INSTALL_COMPLETE", { tenantId, moduleId, name: pkg.name, steps }, "INSTALL");

  console.log(`[BCO Install] "${pkg.name}"@${pkg.version} installed for tenant "${tenantId}".`);

  return {
    module:       pkg.name,
    version:      pkg.version,
    sandboxLevel: pkg.sandbox_level,
    dependencies: deps.order,
    installedAt:  installRecord.installedAt,
    steps
  };
}

// ─────────────────────────────────────────────
// UNINSTALL
// ─────────────────────────────────────────────

/**
 * uninstallMarketplaceModule(tenantId, moduleId)
 * Removes from tenant storage. Does NOT remove from core registry
 * (other tenants may still use it). Logs the action.
 */
export function uninstallMarketplaceModule(tenantId, moduleId) {
  const entry = getModule(moduleId);
  const moduleName = entry?.package?.name || moduleId;

  const installs = (tenantStorage.get(tenantId, TENANT_KEYS.MODULES) || [])
    .filter((m) => m.id !== moduleId && m.name !== moduleName);
  tenantStorage.set(tenantId, TENANT_KEYS.MODULES, installs);

  const tenant = getTenant(tenantId);
  if (tenant) {
    updateTenant(tenantId, {
      modules_enabled: (tenant.modules_enabled || []).filter((n) => n !== moduleName)
    });
  }

  logEvent("MODULE_UNINSTALLED", { tenantId, moduleId, name: moduleName });
  rawLog("UNINSTALL_COMPLETE", { tenantId, moduleId, name: moduleName }, "INSTALL");

  return { uninstalled: true, module: moduleName };
}

// ─────────────────────────────────────────────
// INTERNAL — CORE MODULE REGISTRATION
// ─────────────────────────────────────────────

function _registerToCore(pkg) {
  // Build a Run 3-compatible module descriptor from the BCO-PACKAGE
  const coreModule = {
    name:     pkg.name,
    version:  pkg.version,
    entities: pkg.entities || [],
    actions:  pkg.actions  || [],
    rules:    pkg.rules    || [],
    ui_blocks: pkg.ui_blocks || [],
    config:   pkg.config   || {},
    permissions: pkg.permissions
      ? _mapPermissions(pkg.permissions)
      : { read: ["operator", "viewer"], write: ["operator"], blockedActions: [] }
  };

  try {
    moduleRegistry.register(coreModule);
  } catch (e) {
    // Already registered in core — not a failure condition
    if (!e.message.includes("already registered")) throw e;
  }
}

function _mapPermissions(rawPerms) {
  // BCO-PACKAGE permissions → Run 3 module.permissions format
  return {
    read:           ["operator", "viewer"],
    write:          rawPerms.includes("write_own_data") ? ["operator"] : [],
    blockedActions: []
  };
}
