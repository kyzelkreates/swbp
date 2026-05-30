// BCO Core — Run 3: SSOT Core State Engine
// Single source of truth. All state reads/writes flow through here.
// Also exports rawLog() — a cycle-safe internal event writer used by
// actions.js and modules.js to avoid importing from events.js.

import { StorageAdapter } from "./storage-adapter.js";

export const SSOT_KEYS = {
  USERS:    "bco_users",
  ROLES:    "bco_roles",
  SESSIONS: "bco_sessions",
  EVENTS:   "bco_events",
  ACTIONS:  "bco_actions",
  ALERTS:   "bco_alerts",
  MODULES:  "bco_modules",
  LOGS:     "bco_logs"
};

export const storage = {
  get(key) {
    return StorageAdapter.get(key);
  },

  set(key, value) {
    StorageAdapter.set(key, value);
    rawLog("STATE_WRITE", { key });
  },

  update(key, fn) {
    StorageAdapter.update(key, fn);
    rawLog("STATE_UPDATE", { key });
  },

  delete(key) {
    StorageAdapter.delete(key);
    rawLog("STATE_DELETE", { key });
  },

  subscribe(key, callback) {
    StorageAdapter.subscribe(key, callback);
  }
};

/**
 * rawLog(type, payload)
 * Writes an event record directly via the adapter — no imports from events.js.
 * Used by storage.js, actions.js, and modules.js to break circular deps.
 * NOT for external use — consumers should use logEvent() from events.js.
 */
export function rawLog(type, payload, module = "CORE", source = "system") {
  const raw = JSON.parse(localStorage.getItem(SSOT_KEYS.EVENTS) || "[]");
  raw.push({
    id: crypto.randomUUID(),
    type,
    module,
    payload,
    source,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem(SSOT_KEYS.EVENTS, JSON.stringify(raw));
}
