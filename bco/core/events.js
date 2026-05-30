// BCO Core — Run 3: Event System
// emitEvent() is the canonical pipeline entry point.
// logEvent() is a thin wrapper over rawLog() for external callers.

import { storage, SSOT_KEYS, rawLog } from "./storage.js";
import { evaluateRules } from "./rules.js";
import { dispatchAction } from "./actions.js";

// ─────────────────────────────────────────────
// EVENT FACTORY
// ─────────────────────────────────────────────

export function createEvent(type, module, payload, source = "system") {
  return {
    id: crypto.randomUUID(),
    type,
    module,
    payload,
    source,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// LOG (public, for external callers)
// ─────────────────────────────────────────────

export function logEvent(type, payload, module = "CORE", source = "system") {
  return rawLog(type, payload, module, source);
}

// ─────────────────────────────────────────────
// FULL PIPELINE ENTRY POINT
// ─────────────────────────────────────────────

/**
 * emitEvent(type, moduleOrName, payload, source?)
 * THE canonical way to trigger system activity.
 * Pipeline: Event → Rule Engine → Action Engine → Storage → Log → (UI Run 4)
 * Returns: { event, actions[] }
 */
export function emitEvent(type, moduleOrName, payload, source = "user") {
  const moduleName = typeof moduleOrName === "string"
    ? moduleOrName
    : moduleOrName?.name || "CORE";

  const event = createEvent(type, moduleName, payload, source);
  rawLog(type, payload, moduleName, source);

  const actions = evaluateRules(event);
  const processed = actions.map((action) => dispatchAction(action));

  return { event, actions: processed };
}
