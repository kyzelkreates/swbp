// BCO Deploy — Deployment Abstraction Layer (Run 6)
// Detects or explicitly sets the deployment mode.
// Downstream code reads from here — never hardcodes environment assumptions.

import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// DEPLOYMENT MODES
// ─────────────────────────────────────────────

export const DEPLOY_MODES = {
  LOCAL:       "local",
  STAGING:     "staging",
  PRODUCTION:  "production"
};

export const STORAGE_BACKENDS = {
  LOCAL_STORAGE: "localStorage",
  SUPABASE:      "supabase",
  MEMORY:        "memory"
};

// ─────────────────────────────────────────────
// ACTIVE CONFIG (singleton)
// ─────────────────────────────────────────────

let _config = null;

// ─────────────────────────────────────────────
// DETECT DEPLOYMENT MODE
// ─────────────────────────────────────────────

/**
 * detectDeploymentMode()
 * Auto-detects the environment from available signals.
 * Can be overridden by calling setDeploymentConfig() explicitly.
 */
function detectDeploymentMode() {
  // Node / server environment signals
  if (typeof process !== "undefined" && process.env) {
    const env = process.env.NODE_ENV || process.env.BCO_ENV;
    if (env === "production")  return DEPLOY_MODES.PRODUCTION;
    if (env === "staging")     return DEPLOY_MODES.STAGING;
  }

  // Browser: check hostname
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return DEPLOY_MODES.LOCAL;
    if (host.includes("staging") || host.includes("vercel") || host.includes("netlify")) {
      return DEPLOY_MODES.STAGING;
    }
    return DEPLOY_MODES.PRODUCTION;
  }

  return DEPLOY_MODES.LOCAL;
}

function detectStorageBackend(mode) {
  if (typeof process !== "undefined" && process.env?.SUPABASE_URL) {
    return STORAGE_BACKENDS.SUPABASE;
  }
  if (typeof localStorage !== "undefined") return STORAGE_BACKENDS.LOCAL_STORAGE;
  return STORAGE_BACKENDS.MEMORY;
}

// ─────────────────────────────────────────────
// GET DEPLOYMENT CONFIG
// ─────────────────────────────────────────────

/**
 * getDeploymentMode()
 * Returns the active deployment configuration.
 * Lazy-initialised on first call.
 */
export function getDeploymentMode() {
  if (_config) return _config;

  const mode    = detectDeploymentMode();
  const storage = detectStorageBackend(mode);

  _config = {
    mode,
    storage,
    multiTenant:    mode !== DEPLOY_MODES.LOCAL,
    debug:          mode === DEPLOY_MODES.LOCAL,
    analyticsEnabled: mode === DEPLOY_MODES.PRODUCTION,
    version:        "6.0.0",
    buildTime:      new Date().toISOString()
  };

  rawLog("DEPLOYMENT_DETECTED", { mode, storage }, "DEPLOY");
  return _config;
}

/**
 * setDeploymentConfig(overrides)
 * Explicitly override auto-detection. Call before initSSOT().
 */
export function setDeploymentConfig(overrides) {
  const mode    = overrides.mode    || detectDeploymentMode();
  const storage = overrides.storage || detectStorageBackend(mode);

  _config = {
    mode,
    storage,
    multiTenant:      overrides.multiTenant      ?? mode !== DEPLOY_MODES.LOCAL,
    debug:            overrides.debug            ?? mode === DEPLOY_MODES.LOCAL,
    analyticsEnabled: overrides.analyticsEnabled ?? mode === DEPLOY_MODES.PRODUCTION,
    version:          overrides.version          ?? "6.0.0",
    buildTime:        new Date().toISOString()
  };

  rawLog("DEPLOYMENT_CONFIG_SET", { mode: _config.mode, storage: _config.storage }, "DEPLOY");
  return _config;
}

// ─────────────────────────────────────────────
// FEATURE FLAGS (environment-driven)
// ─────────────────────────────────────────────

/**
 * isFeatureEnabled(feature)
 * Simple flag resolver — extend for remote config (LaunchDarkly etc.)
 */
export function isFeatureEnabled(feature) {
  const cfg = getDeploymentMode();

  const FLAGS = {
    multiTenant:      cfg.multiTenant,
    aiInsights:       cfg.mode !== DEPLOY_MODES.LOCAL,
    supabaseSync:     cfg.storage === STORAGE_BACKENDS.SUPABASE,
    usageTracking:    cfg.mode === DEPLOY_MODES.PRODUCTION,
    billingEnforced:  cfg.mode === DEPLOY_MODES.PRODUCTION,
    pwaEnabled:       true
  };

  return FLAGS[feature] ?? false;
}

// ─────────────────────────────────────────────
// STORAGE ADAPTER BOOTSTRAPPER
// ─────────────────────────────────────────────

/**
 * bootstrapStorageAdapter()
 * Returns the correct StorageAdapter class based on deployment config.
 * Run 1's StorageAdapter.js is swapped here for Supabase in production.
 *
 * Extension point: import SupabaseAdapter from "../core/supabase-adapter.js"
 * and return it when storage === "supabase".
 */
export async function bootstrapStorageAdapter() {
  const cfg = getDeploymentMode();

  if (cfg.storage === STORAGE_BACKENDS.SUPABASE) {
    // Run 7 extension point — swap in Supabase adapter
    // const { SupabaseAdapter } = await import("../core/supabase-adapter.js");
    // return SupabaseAdapter;
    console.warn("[BCO Deploy] Supabase adapter not yet loaded — falling back to localStorage.");
  }

  const { LocalStorageAdapter } = await import("../core/storage-adapter.js");
  return LocalStorageAdapter;
}
