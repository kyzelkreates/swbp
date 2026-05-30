// BCO Ecosystem — Revenue Sharing Engine (Run 7)
// Calculates and tracks developer earnings, platform commission, and enterprise licensing.
// No payment processing — this is accounting logic only.
// Payment gateway integration is the extension point at processPayoutBatch().

import { getModule, recordInstall } from "./registry.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// REVENUE MODEL CONFIG
// ─────────────────────────────────────────────

export const REVENUE_CONFIG = {
  platformCut:    0.20,   // 20% platform commission
  developerShare: 0.80,   // 80% to developer
  minPayoutUSD:   25,     // minimum payout threshold
  taxReserve:     0.00    // optional: withhold for tax (set per jurisdiction)
};

// License types
export const LICENSE_TYPES = {
  FREE:        "free",
  PAID:        "paid",
  SUBSCRIPTION:"subscription",
  ENTERPRISE:  "enterprise"   // custom licensing, direct negotiation
};

// ─────────────────────────────────────────────
// REVENUE CALCULATOR
// ─────────────────────────────────────────────

/**
 * calculateRevenue(installs, pricePerInstall, config?)
 * Base revenue split for a paid module.
 *
 * @returns {{ gross, developer, platform, perInstall, installs }}
 */
export function calculateRevenue(installs, pricePerInstall, config = REVENUE_CONFIG) {
  const gross     = installs * pricePerInstall;
  const platform  = gross * config.platformCut;
  const developer = gross * config.developerShare;

  return {
    installs,
    pricePerInstall,
    gross:     parseFloat(gross.toFixed(2)),
    developer: parseFloat(developer.toFixed(2)),
    platform:  parseFloat(platform.toFixed(2)),
    currency:  "USD"
  };
}

// ─────────────────────────────────────────────
// INSTALL-TRIGGERED REVENUE TRACKING
// ─────────────────────────────────────────────

// In-memory ledger — swap for DB in Run 8
const _ledger = new Map(); // moduleId → { entries: [], totalGross, totalDeveloper }

/**
 * recordRevenueEvent(moduleId, tenantId)
 * Called by the install engine after each successful paid module install.
 * Updates the install counter in the registry and records revenue.
 */
export function recordRevenueEvent(moduleId, tenantId) {
  const entry = getModule(moduleId);
  if (!entry) return;

  const pkg   = entry.package;
  const price = pkg.price || 0;

  // Always increment install counter (free modules too)
  recordInstall(moduleId);

  if (price === 0) return null; // free module — no revenue event

  const revenue = calculateRevenue(1, price);

  if (!_ledger.has(moduleId)) {
    _ledger.set(moduleId, { entries: [], totalGross: 0, totalDeveloper: 0, totalPlatform: 0 });
  }

  const ledgerEntry = _ledger.get(moduleId);
  ledgerEntry.entries.push({
    tenantId,
    gross:      revenue.gross,
    developer:  revenue.developer,
    platform:   revenue.platform,
    timestamp:  new Date().toISOString()
  });
  ledgerEntry.totalGross     += revenue.gross;
  ledgerEntry.totalDeveloper += revenue.developer;
  ledgerEntry.totalPlatform  += revenue.platform;

  rawLog("REVENUE_EVENT", {
    moduleId,
    tenantId,
    gross: revenue.gross,
    developer: revenue.developer
  }, "REVENUE");

  return revenue;
}

// ─────────────────────────────────────────────
// DEVELOPER EARNINGS REPORT
// ─────────────────────────────────────────────

/**
 * getDeveloperEarnings(moduleId)
 * Returns cumulative earnings for a module's developer.
 */
export function getDeveloperEarnings(moduleId) {
  const ledger = _ledger.get(moduleId);
  if (!ledger) return { moduleId, totalGross: 0, totalDeveloper: 0, totalPlatform: 0, payable: false };

  return {
    moduleId,
    totalGross:     parseFloat(ledger.totalGross.toFixed(2)),
    totalDeveloper: parseFloat(ledger.totalDeveloper.toFixed(2)),
    totalPlatform:  parseFloat(ledger.totalPlatform.toFixed(2)),
    transactions:   ledger.entries.length,
    payable:        ledger.totalDeveloper >= REVENUE_CONFIG.minPayoutUSD,
    currency:       "USD"
  };
}

/**
 * getPlatformRevenueSummary()
 * Super-admin: total platform commission across all modules.
 */
export function getPlatformRevenueSummary() {
  let totalGross = 0, totalPlatform = 0, totalDeveloper = 0;

  _ledger.forEach((ledger) => {
    totalGross     += ledger.totalGross;
    totalPlatform  += ledger.totalPlatform;
    totalDeveloper += ledger.totalDeveloper;
  });

  return {
    modulesWithRevenue: _ledger.size,
    totalGross:     parseFloat(totalGross.toFixed(2)),
    totalPlatform:  parseFloat(totalPlatform.toFixed(2)),
    totalDeveloper: parseFloat(totalDeveloper.toFixed(2)),
    currency:       "USD"
  };
}

// ─────────────────────────────────────────────
// ENTERPRISE LICENSING
// ─────────────────────────────────────────────

/**
 * calculateEnterpriseLicense(seats, basePrice, years?)
 * Volume-discounted enterprise licence pricing.
 */
export function calculateEnterpriseLicense(seats, basePrice, years = 1) {
  const volumeDiscount =
    seats >= 500 ? 0.30 :
    seats >= 100 ? 0.20 :
    seats >= 25  ? 0.10 : 0;

  const annualBase = seats * basePrice * 12;
  const discount   = annualBase * volumeDiscount;
  const annual     = annualBase - discount;
  const total      = annual * years;

  const split = calculateRevenue(1, total);

  return {
    seats,
    years,
    annualBase:     parseFloat(annualBase.toFixed(2)),
    volumeDiscount: `${(volumeDiscount * 100).toFixed(0)}%`,
    annualTotal:    parseFloat(annual.toFixed(2)),
    contractTotal:  parseFloat(total.toFixed(2)),
    developer:      parseFloat((total * REVENUE_CONFIG.developerShare).toFixed(2)),
    platform:       parseFloat((total * REVENUE_CONFIG.platformCut).toFixed(2)),
    currency:       "USD"
  };
}

// ─────────────────────────────────────────────
// EXTENSION POINT — Payout Gateway
// ─────────────────────────────────────────────

/**
 * processPayoutBatch()
 * Stub: collect all payable developer earnings and initiate transfer.
 * Wire to Stripe Connect / Wise / bank transfer in production.
 */
export function processPayoutBatch() {
  const payouts = [];

  _ledger.forEach((ledger, moduleId) => {
    if (ledger.totalDeveloper >= REVENUE_CONFIG.minPayoutUSD) {
      payouts.push({ moduleId, amount: ledger.totalDeveloper });
      rawLog("PAYOUT_QUEUED", { moduleId, amount: ledger.totalDeveloper }, "REVENUE");
    }
  });

  // TODO: call Stripe Connect / payout API here
  return payouts;
}
