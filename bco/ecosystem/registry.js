// BCO Ecosystem — Public Module Registry (Run 7)
// The canonical marketplace catalogue: publish, discover, rate, trust-score.
// Separates the public ecosystem registry from the tenant install layer (Run 6).
// Tenants install FROM this registry — they don't own it.

import { validateModulePackage, compareVersions } from "./package-standard.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// MARKETPLACE STORE (in-memory; swap for DB in Run 8)
// ─────────────────────────────────────────────

const _store = new Map(); // id → MarketplaceEntry

/**
 * @typedef {Object} MarketplaceEntry
 * @property {BCOPackage} package         — validated package
 * @property {number}     rating          — weighted average 0–5
 * @property {number}     installs        — cumulative install count
 * @property {Review[]}   reviews
 * @property {string}     publishedAt
 * @property {string}     updatedAt
 * @property {"pending"|"approved"|"rejected"} status
 * @property {number}     trustScore      — 0–100
 */

// ─────────────────────────────────────────────
// PUBLISH
// ─────────────────────────────────────────────

/**
 * publishModule(pkg)
 * Validates, registers, and queues for review.
 * Returns the marketplace entry.
 */
export function publishModule(pkg) {
  const validated = validateModulePackage(pkg);  // throws on invalid

  // Version conflict check — same id + version cannot exist twice
  if (_store.has(validated.id)) {
    const existing = _store.get(validated.id);
    if (existing.package.version === validated.version) {
      throw new Error(
        `[BCO Registry] "${validated.name}"@${validated.version} is already published.`
      );
    }
  }

  const entry = {
    package:     validated,
    rating:      0,
    installs:    0,
    reviews:     [],
    publishedAt: new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    status:      validated.sandbox_level === "elevated" ? "pending" : "approved",
    trustScore:  _initialTrustScore(validated)
  };

  _store.set(validated.id, entry);
  rawLog("MODULE_PUBLISHED", { id: validated.id, name: validated.name, version: validated.version }, "REGISTRY");

  console.log(`[BCO Registry] Published: "${validated.name}"@${validated.version} — status: ${entry.status}`);
  return entry;
}

// ─────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────

/**
 * discoverModules(query?, filters?)
 * Fuzzy-search by name/description/category. Supports sort.
 *
 * @param {string} query                        — keyword search
 * @param {{ category?, plan?, sort?, free? }} filters
 * @returns {MarketplaceEntry[]}
 */
export function discoverModules(query = "", filters = {}) {
  let results = [..._store.values()].filter((e) => e.status === "approved");

  // Text search
  if (query) {
    const q = query.toLowerCase();
    results = results.filter((e) =>
      e.package.name.toLowerCase().includes(q) ||
      e.package.description.toLowerCase().includes(q) ||
      (e.package.category || "").toLowerCase().includes(q) ||
      (e.package.author || "").toLowerCase().includes(q)
    );
  }

  // Category filter
  if (filters.category) {
    results = results.filter((e) => e.package.category === filters.category);
  }

  // Free-only filter
  if (filters.free) {
    results = results.filter((e) => (e.package.price || 0) === 0);
  }

  // Sort
  const sort = filters.sort || "installs";
  switch (sort) {
    case "rating":    results.sort((a, b) => b.rating - a.rating);         break;
    case "installs":  results.sort((a, b) => b.installs - a.installs);     break;
    case "newest":    results.sort((a, b) => b.publishedAt > a.publishedAt ? 1 : -1); break;
    case "trust":     results.sort((a, b) => b.trustScore - a.trustScore); break;
  }

  return results;
}

/**
 * getModule(id)
 */
export function getModule(id) {
  return _store.get(id) || null;
}

/**
 * getModuleByName(name)
 * Returns latest approved version.
 */
export function getModuleByName(name) {
  const matches = [..._store.values()]
    .filter((e) => e.package.name === name && e.status === "approved")
    .sort((a, b) => compareVersions(b.package.version, a.package.version));
  return matches[0] || null;
}

/**
 * getAllApproved()
 * Full catalogue as BCOPackage array — used by dependency resolver.
 */
export function getAllApproved() {
  return [..._store.values()]
    .filter((e) => e.status === "approved")
    .map((e) => e.package);
}

// ─────────────────────────────────────────────
// RATINGS + REVIEWS
// ─────────────────────────────────────────────

/**
 * rateModule(moduleId, rating, review)
 * Adds a review and recalculates weighted average rating.
 *
 * @param {string} moduleId
 * @param {number} rating   — 1–5
 * @param {{ userId, comment, verified? }} review
 */
export function rateModule(moduleId, rating, review = {}) {
  const entry = _store.get(moduleId);
  if (!entry) throw new Error(`[BCO Registry] Module "${moduleId}" not found.`);

  if (rating < 1 || rating > 5) throw new Error("[BCO Registry] Rating must be 1–5.");

  const reviewRecord = {
    id:        crypto.randomUUID(),
    userId:    review.userId || "anonymous",
    rating,
    comment:   review.comment || "",
    verified:  review.verified || false,
    timestamp: new Date().toISOString()
  };

  entry.reviews.push(reviewRecord);

  // Weighted average: verified reviews count 2x
  const total = entry.reviews.reduce((s, r) => s + r.rating * (r.verified ? 2 : 1), 0);
  const weight = entry.reviews.reduce((s, r) => s + (r.verified ? 2 : 1), 0);
  entry.rating = parseFloat((total / weight).toFixed(2));

  // Update trust score based on review data
  entry.trustScore = _calculateTrustScore(entry);
  entry.updatedAt  = new Date().toISOString();

  rawLog("MODULE_RATED", { moduleId, rating, newAvg: entry.rating }, "REGISTRY");
  return reviewRecord;
}

// ─────────────────────────────────────────────
// INSTALL COUNTER (called by install engine)
// ─────────────────────────────────────────────

export function recordInstall(moduleId) {
  const entry = _store.get(moduleId);
  if (!entry) return;
  entry.installs++;
  entry.trustScore = _calculateTrustScore(entry);
  entry.updatedAt  = new Date().toISOString();
}

// ─────────────────────────────────────────────
// TRUST SCORING
// ─────────────────────────────────────────────

/**
 * _calculateTrustScore(entry)
 * 0–100 composite score based on rating, installs, verified reviews, age.
 */
function _calculateTrustScore(entry) {
  let score = 0;

  // Rating component (0–40 pts)
  score += (entry.rating / 5) * 40;

  // Install volume (0–25 pts, saturates at 1000 installs)
  score += Math.min(entry.installs / 1000, 1) * 25;

  // Verified review ratio (0–20 pts)
  const verified = entry.reviews.filter((r) => r.verified).length;
  const total    = entry.reviews.length;
  if (total > 0) score += (verified / total) * 20;

  // Sandbox penalty: strict = +15, standard = +5, elevated = 0
  if (entry.package.sandbox_level === "strict")        score += 15;
  else if (entry.package.sandbox_level === "standard") score += 5;

  return Math.round(Math.min(score, 100));
}

function _initialTrustScore(pkg) {
  // New modules start with a base score from sandbox level alone
  return pkg.sandbox_level === "strict" ? 15 : pkg.sandbox_level === "standard" ? 5 : 0;
}

// ─────────────────────────────────────────────
// MODERATION
// ─────────────────────────────────────────────

/**
 * approveModule(id) / rejectModule(id, reason)
 * Platform admin actions.
 */
export function approveModule(id) {
  const entry = _store.get(id);
  if (!entry) throw new Error(`[BCO Registry] Module "${id}" not found.`);
  entry.status    = "approved";
  entry.updatedAt = new Date().toISOString();
  rawLog("MODULE_APPROVED", { id }, "REGISTRY");
  return entry;
}

export function rejectModule(id, reason = "") {
  const entry = _store.get(id);
  if (!entry) throw new Error(`[BCO Registry] Module "${id}" not found.`);
  entry.status         = "rejected";
  entry.rejectedReason = reason;
  entry.updatedAt      = new Date().toISOString();
  rawLog("MODULE_REJECTED", { id, reason }, "REGISTRY");
  return entry;
}
