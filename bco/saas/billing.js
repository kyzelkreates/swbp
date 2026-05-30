// BCO SaaS — Billing + Subscription Engine (Run 6)
// Calculates charges, tracks usage, manages plan state.
// No payment processing here — this is the billing logic layer.
// Payment gateway (Stripe etc.) plugs in at the processPayment() extension point.

import { tenantStorage, TENANT_KEYS } from "./tenant-storage.js";
import { getTenant, updateTenant } from "./tenant.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// PLAN DEFINITIONS
// ─────────────────────────────────────────────

export const PLANS = {
  starter: {
    name:           "Starter",
    price:          29,
    moduleLimit:    3,
    userLimit:      5,
    aiInsights:     false,
    billing_cycle:  "monthly"
  },
  pro: {
    name:           "Pro",
    price:          99,
    moduleLimit:    10,
    userLimit:      25,
    aiInsights:     true,
    billing_cycle:  "monthly"
  },
  enterprise: {
    name:           "Enterprise",
    price:          299,
    moduleLimit:    Infinity,
    userLimit:      Infinity,
    aiInsights:     true,
    billing_cycle:  "monthly",
    sla:            true
  }
};

const MODULE_UNIT_COST = 10;   // per extra module above plan limit

// ─────────────────────────────────────────────
// BILLING CALCULATION
// ─────────────────────────────────────────────

/**
 * calculateBilling(tenant)
 * Returns the full billing breakdown for a tenant's current usage.
 *
 * @param {Tenant} tenant
 * @returns {{ base, moduleOverage, total, plan, currency, breakdown }}
 */
export function calculateBilling(tenant) {
  const plan = PLANS[tenant.plan];

  if (!plan) {
    throw new Error(`[BCO Billing] Unknown plan: "${tenant.plan}"`);
  }

  const moduleCount   = tenant.modules_enabled?.length ?? 0;
  const overageModules = Math.max(0, moduleCount - plan.moduleLimit);
  const moduleOverage  = overageModules * MODULE_UNIT_COST;
  const total          = plan.price + moduleOverage;

  return {
    tenant_id:     tenant.tenant_id,
    plan:          tenant.plan,
    currency:      "USD",
    base:          plan.price,
    moduleCount,
    moduleOverage,
    total,
    billing_cycle: plan.billing_cycle,
    breakdown: {
      basePlan:        `${plan.name}: $${plan.price}`,
      moduleOverage:   overageModules > 0
        ? `${overageModules} extra module${overageModules > 1 ? "s" : ""} × $${MODULE_UNIT_COST} = $${moduleOverage}`
        : null,
      total:           `$${total}/month`
    }
  };
}

// ─────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────────

/**
 * createSubscription(tenantId, plan)
 * Stores the active subscription record for a tenant.
 */
export function createSubscription(tenantId, plan) {
  if (!PLANS[plan]) throw new Error(`[BCO Billing] Invalid plan: "${plan}"`);

  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error(`[BCO Billing] Tenant "${tenantId}" not found.`);

  const subscription = {
    tenant_id:    tenantId,
    plan,
    status:       "active",
    started_at:   new Date().toISOString(),
    renews_at:    _nextRenewal(),
    cancelled_at: null
  };

  tenantStorage.set(tenantId, TENANT_KEYS.BILLING, subscription);
  updateTenant(tenantId, { plan });
  rawLog("SUBSCRIPTION_CREATED", { tenantId, plan }, "BILLING");

  return subscription;
}

/**
 * upgradeSubscription(tenantId, newPlan)
 * Upgrades or downgrades a plan. Returns billing diff.
 */
export function upgradeSubscription(tenantId, newPlan) {
  if (!PLANS[newPlan]) throw new Error(`[BCO Billing] Invalid plan: "${newPlan}"`);

  const tenant = getTenant(tenantId);
  const oldPlan = tenant.plan;
  const sub = tenantStorage.get(tenantId, TENANT_KEYS.BILLING) || {};

  const updated = {
    ...sub,
    plan:        newPlan,
    upgraded_at: new Date().toISOString(),
    previous_plan: oldPlan
  };

  tenantStorage.set(tenantId, TENANT_KEYS.BILLING, updated);
  updateTenant(tenantId, { plan: newPlan });

  const oldBill = calculateBilling({ ...tenant, plan: oldPlan });
  const newBill = calculateBilling({ ...tenant, plan: newPlan });

  rawLog("SUBSCRIPTION_UPGRADED", { tenantId, from: oldPlan, to: newPlan }, "BILLING");

  return {
    from:     oldPlan,
    to:       newPlan,
    oldTotal: oldBill.total,
    newTotal: newBill.total,
    diff:     newBill.total - oldBill.total
  };
}

/**
 * cancelSubscription(tenantId)
 */
export function cancelSubscription(tenantId) {
  const sub = tenantStorage.get(tenantId, TENANT_KEYS.BILLING) || {};
  const updated = { ...sub, status: "cancelled", cancelled_at: new Date().toISOString() };
  tenantStorage.set(tenantId, TENANT_KEYS.BILLING, updated);
  updateTenant(tenantId, { status: "cancelled" });
  rawLog("SUBSCRIPTION_CANCELLED", { tenantId }, "BILLING");
  return updated;
}

/**
 * getSubscription(tenantId)
 */
export function getSubscription(tenantId) {
  return tenantStorage.get(tenantId, TENANT_KEYS.BILLING) || null;
}

// ─────────────────────────────────────────────
// PLAN FEATURE GATES
// ─────────────────────────────────────────────

/**
 * assertPlanFeature(tenant, feature)
 * Throws if the tenant's plan doesn't include a feature.
 * e.g. assertPlanFeature(tenant, "aiInsights")
 */
export function assertPlanFeature(tenant, feature) {
  const plan = PLANS[tenant.plan];
  if (!plan) throw new Error(`[BCO Billing] Unknown plan: "${tenant.plan}"`);
  if (!plan[feature]) {
    throw new Error(
      `[BCO Billing] Feature "${feature}" not available on "${tenant.plan}" plan. Upgrade to access.`
    );
  }
}

/**
 * assertUserLimit(tenant)
 * Throws if the tenant has reached their user seat limit.
 */
export function assertUserLimit(tenant) {
  const plan  = PLANS[tenant.plan];
  const count = tenant.users?.length ?? 0;
  if (count >= plan.userLimit) {
    throw new Error(
      `[BCO Billing] User limit (${plan.userLimit}) reached on "${tenant.plan}" plan.`
    );
  }
}

// ─────────────────────────────────────────────
// EXTENSION POINT — Payment Gateway
// ─────────────────────────────────────────────

/**
 * processPayment(tenantId, amount, paymentMethod)
 * Stub for payment gateway integration (Stripe, etc.)
 * Replace the body here in the payment integration layer.
 */
export function processPayment(tenantId, amount, paymentMethod = {}) {
  // TODO: call Stripe / payment gateway SDK
  rawLog("PAYMENT_INITIATED", { tenantId, amount, method: paymentMethod.type || "card" }, "BILLING");
  return { status: "pending", tenantId, amount };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _nextRenewal() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
