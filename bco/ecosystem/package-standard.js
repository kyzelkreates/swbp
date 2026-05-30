// BCO Ecosystem — Module Package Standard (Run 7)
// Defines and validates the BCO-PACKAGE format.
// Every module published to the marketplace MUST conform to this schema.
// This is the contract between module developers and the BCO platform.

// ─────────────────────────────────────────────
// SANDBOX LEVELS
// ─────────────────────────────────────────────

export const SANDBOX_LEVELS = {
  STRICT:   "strict",    // event-only comms, no direct storage, full isolation
  STANDARD: "standard",  // limited storage access, no cross-module writes
  ELEVATED: "elevated"   // trusted first-party modules, direct core access
};

// ─────────────────────────────────────────────
// PERMISSION FLAGS
// ─────────────────────────────────────────────

export const MODULE_PERMISSIONS = {
  READ_OWN_DATA:    "read_own_data",
  WRITE_OWN_DATA:   "write_own_data",
  READ_AI_INSIGHTS: "read_ai_insights",
  EMIT_EVENTS:      "emit_events",
  PUSH_ALERTS:      "push_alerts",
  NETWORK_ACCESS:   "network_access",     // elevated only
  READ_CROSS_MODULE:"read_cross_module"   // elevated only
};

// ─────────────────────────────────────────────
// PACKAGE SCHEMA VALIDATOR
// ─────────────────────────────────────────────

/**
 * validateModulePackage(pkg)
 * Throws descriptive errors for any schema violation.
 * Returns the normalised package on success.
 *
 * @typedef {Object} BCOPackage
 * @property {string}   id
 * @property {string}   name
 * @property {string}   version          — semver: "MAJOR.MINOR.PATCH"
 * @property {string}   author
 * @property {string}   description
 * @property {string}   [category]
 * @property {{ name, version }[]} dependencies
 * @property {string[]} permissions      — from MODULE_PERMISSIONS
 * @property {object[]} rules
 * @property {string[]} actions
 * @property {object[]} ui_blocks
 * @property {"strict"|"standard"|"elevated"} sandbox_level
 * @property {string}   [license]        — "MIT" | "commercial" | "proprietary"
 * @property {number}   [price]          — 0 = free
 * @property {string}   [homepage_url]
 * @property {string}   [icon_url]
 */
export function validateModulePackage(pkg) {
  const errors = [];

  if (!pkg.id      || typeof pkg.id      !== "string") errors.push("id: required string");
  if (!pkg.name    || typeof pkg.name    !== "string") errors.push("name: required string");
  if (!pkg.version || !_isValidSemver(pkg.version))   errors.push("version: must be semver (MAJOR.MINOR.PATCH)");
  if (!pkg.author  || typeof pkg.author  !== "string") errors.push("author: required string");
  if (!pkg.description)                               errors.push("description: required");

  if (!Array.isArray(pkg.dependencies)) errors.push("dependencies: must be array");
  if (!Array.isArray(pkg.permissions))  errors.push("permissions: must be array");
  if (!Array.isArray(pkg.rules))        errors.push("rules: must be array");
  if (!Array.isArray(pkg.actions))      errors.push("actions: must be array");
  if (!Array.isArray(pkg.ui_blocks))    errors.push("ui_blocks: must be array");

  if (!Object.values(SANDBOX_LEVELS).includes(pkg.sandbox_level)) {
    errors.push(`sandbox_level: must be one of ${Object.values(SANDBOX_LEVELS).join(", ")}`);
  }

  // Elevated sandbox requires explicit justification
  if (pkg.sandbox_level === SANDBOX_LEVELS.ELEVATED && !pkg._elevatedReason) {
    errors.push("sandbox_level=elevated: requires _elevatedReason field (platform review only)");
  }

  // Permission × sandbox compatibility
  const elevatedOnlyPerms = [MODULE_PERMISSIONS.NETWORK_ACCESS, MODULE_PERMISSIONS.READ_CROSS_MODULE];
  elevatedOnlyPerms.forEach((p) => {
    if (pkg.permissions.includes(p) && pkg.sandbox_level !== SANDBOX_LEVELS.ELEVATED) {
      errors.push(`permission "${p}" requires sandbox_level=elevated`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`[BCO Package] Validation failed:\n  • ${errors.join("\n  • ")}`);
  }

  // Normalise defaults
  return {
    license:      "MIT",
    price:        0,
    category:     "general",
    homepage_url: null,
    icon_url:     null,
    ...pkg,
    _validatedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// SEMVER UTILITIES
// ─────────────────────────────────────────────

/**
 * parseSemver("1.2.3") → { major: 1, minor: 2, patch: 3 }
 */
export function parseSemver(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw:   version
  };
}

/**
 * isCompatible(installedVersion, requiredVersion)
 * Semver rule: same MAJOR = compatible. Minor/patch: installed >= required.
 */
export function isCompatible(installedVersion, requiredVersion) {
  const a = parseSemver(installedVersion);
  const b = parseSemver(requiredVersion);
  if (!a || !b) return false;
  if (a.major !== b.major) return false;
  if (a.minor < b.minor)   return false;
  if (a.minor === b.minor && a.patch < b.patch) return false;
  return true;
}

/**
 * compareVersions(a, b) → -1 | 0 | 1
 * For sorting: -1 = a is older, 1 = a is newer
 */
export function compareVersions(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

function _isValidSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v));
}
