// BCO SaaS — Request Pipeline (Run 6)
// Orchestrates the full Run 6 request flow per §11:
//   Tenant Resolver → Auth → Module Loader → Rule Engine →
//   Action Engine → Tenant Storage → AI Analysis → UI → Billing Tracker
//
// This is the server-side entry point for any tenant request.
// Browser/PWA requests go through emitEvent() (Run 3) which then
// calls handleTenantRequest() after auth is resolved client-side.

import { resolveTenant }           from "./tenant.js";
import { assertPermission,
         assertTenantMembership }  from "../auth/permissions.js";
import { getInstalledModules }     from "./marketplace.js";
import { trackUsage,
         assertRateLimit,
         USAGE_CATEGORIES }        from "./usage.js";
import { assertPlanFeature }       from "./billing.js";
import { emitEvent }               from "../core/events.js";
import { moduleRegistry }          from "../core/modules.js";
import { rawLog }                  from "../core/storage.js";
import { isFeatureEnabled,
         getDeploymentMode }        from "../deploy/deployment.js";

// ─────────────────────────────────────────────
// MAIN REQUEST HANDLER
// ─────────────────────────────────────────────

/**
 * handleTenantRequest(request)
 * Full pipeline execution. Returns a result object.
 *
 * @param {{
 *   headers:  object,         — must include x-tenant-id
 *   user:     { id, role },
 *   action:   string,         — the action type to emit
 *   module:   string,         — target module name
 *   payload:  object,
 *   query:    object,
 *   hostname: string
 * }} request
 */
export async function handleTenantRequest(request) {
  const pipeline = { steps: [], success: false };

  try {

    // ── STEP 1: Tenant Resolution ────────────
    const { tenantId, userId, tenant } = resolveTenant(request);
    pipeline.steps.push("tenant_resolved");

    // ── STEP 2: Auth Check ───────────────────
    const { role } = request.user || {};
    assertTenantMembership(userId, tenant);
    assertPermission(role, "read", `action=${request.action}`);
    pipeline.steps.push("auth_passed");

    // ── STEP 3: Module Loader ────────────────
    const installed = getInstalledModules(tenantId).map((m) => m.name);
    if (request.module && !installed.includes(request.module)) {
      throw new Error(
        `[BCO Pipeline] Module "${request.module}" is not installed for tenant "${tenantId}".`
      );
    }
    pipeline.steps.push("module_loaded");

    // ── STEP 4: Rate limit + feature gate ────
    if (isFeatureEnabled("usageTracking")) {
      assertRateLimit(tenant, USAGE_CATEGORIES.API_CALL);
    }
    pipeline.steps.push("rate_limit_passed");

    // ── STEP 5–6: Rule Engine + Action Engine ─
    // emitEvent() executes Run 2 pipeline internally:
    //   evaluateRules() → dispatchAction() → executeAction()
    const { event, actions } = emitEvent(
      request.action,
      request.module || "CORE",
      { ...request.payload, _tenantId: tenantId },
      "user"
    );
    pipeline.steps.push("rules_and_actions_processed");

    // ── STEP 7: Usage Tracking ────────────────
    trackUsage(tenantId, USAGE_CATEGORIES.API_CALL, {
      action:  request.action,
      module:  request.module,
      userId
    });
    pipeline.steps.push("usage_tracked");

    pipeline.success = true;
    rawLog("PIPELINE_COMPLETE", { tenantId, action: request.action, steps: pipeline.steps }, "PIPELINE");

    return {
      success:  true,
      tenantId,
      event,
      actions,
      pipeline
    };

  } catch (err) {
    rawLog("PIPELINE_ERROR", { error: err.message, steps: pipeline.steps }, "PIPELINE");
    return {
      success: false,
      error:   err.message,
      pipeline
    };
  }
}

// ─────────────────────────────────────────────
// SAAS INIT
// ─────────────────────────────────────────────

/**
 * initSaaS()
 * Boots the SaaS layer. Call after initSSOT() (Run 1).
 * Sets deployment config and logs system readiness.
 */
export function initSaaS() {
  const cfg = getDeploymentMode();
  rawLog("SAAS_INIT", {
    mode:        cfg.mode,
    multiTenant: cfg.multiTenant,
    version:     cfg.version
  }, "SAAS");
  console.log(`[BCO SaaS] Initialised. Mode: ${cfg.mode} | Multi-tenant: ${cfg.multiTenant}`);
}
