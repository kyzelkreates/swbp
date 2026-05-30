// BCO Core — Run 2/3: Action Engine (Full Lifecycle)
// Uses rawLog() from storage.js instead of logEvent() from events.js
// to break the events ↔ actions circular dependency.

import { storage, SSOT_KEYS, rawLog } from "./storage.js";

// ─────────────────────────────────────────────
// ACTION FACTORY
// ─────────────────────────────────────────────

export function createAction(type, payload, triggeredBy = null) {
  return {
    id: crypto.randomUUID(),
    type,
    status: "pending",
    priority: "normal",
    module: null,
    triggeredBy,
    payload,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────

export function dispatchAction(action) {
  const actions = storage.get(SSOT_KEYS.ACTIONS) || [];
  actions.push(action);
  storage.set(SSOT_KEYS.ACTIONS, actions);

  rawLog("ACTION_DISPATCHED", { actionId: action.id, type: action.type }, action.module || "CORE");

  return processAction(action);
}

// ─────────────────────────────────────────────
// LIFECYCLE PIPELINE
// ─────────────────────────────────────────────

export function processAction(action) {
  const allowed = validateAction(action);

  if (!allowed) {
    action.status = "rejected";
    _persistActionUpdate(action);
    rawLog("ACTION_REJECTED", { actionId: action.id, type: action.type, module: action.module }, action.module || "CORE");
    return action;
  }

  action.status = "approved";
  executeAction(action);
  action.status = "executed";

  _persistActionUpdate(action);
  rawLog("ACTION_EXECUTED", { actionId: action.id, type: action.type }, action.module || "CORE");

  return action;
}

// ─────────────────────────────────────────────
// VALIDATION (SAFETY GATE)
// ─────────────────────────────────────────────

export function validateAction(action) {
  if (!action.module) return true;

  const modules = storage.get(SSOT_KEYS.MODULES) || [];
  const module = modules.find((m) => m.name === action.module);

  if (!module) {
    console.warn(`[BCO Actions] Module "${action.module}" not found — action blocked.`);
    return false;
  }

  if (module.permissions?.blockedActions?.includes(action.type)) {
    console.warn(`[BCO Actions] Action "${action.type}" blocked by module "${action.module}".`);
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────
// EXECUTION ENGINE
// ─────────────────────────────────────────────

export function executeAction(action) {
  switch (action.type) {

    case "CREATE_ALERT":
      createAlert(action.payload);
      break;

    case "UPDATE_STATE":
      storage.update(action.payload.key, () => action.payload.value);
      break;

    case "LOG_EVENT":
      rawLog(action.payload.type, action.payload.data, action.module || "CORE");
      break;

    case "TRIGGER_NOTIFICATION":
      // Run 4: wire to UI notification layer
      console.log("[BCO Notify]", action.payload);
      break;

    default:
      console.warn(`[BCO Actions] Unknown action type: "${action.type}"`);
  }
}

// ─────────────────────────────────────────────
// ALERT SYSTEM
// ─────────────────────────────────────────────

export function createAlert(payload) {
  const alerts = storage.get(SSOT_KEYS.ALERTS) || [];

  const alert = {
    id: crypto.randomUUID(),
    severity: payload.severity || "info",
    message: payload.message,
    module: payload.module || null,
    timestamp: new Date().toISOString()
  };

  alerts.push(alert);
  storage.set(SSOT_KEYS.ALERTS, alerts);
  rawLog("ALERT_CREATED", alert, alert.module || "CORE");

  return alert;
}

// ─────────────────────────────────────────────
// AI SUGGESTION LAYER (NON-DESTRUCTIVE)
// ─────────────────────────────────────────────

export function aiSuggest(event) {
  return {
    suggestions: [
      {
        type: "CREATE_ACTION",
        confidence: 0.7,
        payload: {
          message: "Suggested intervention based on pattern",
          sourceEvent: event.id
        }
      }
    ]
  };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _persistActionUpdate(action) {
  storage.update(SSOT_KEYS.ACTIONS, (actions) =>
    (actions || []).map((a) => (a.id === action.id ? action : a))
  );
}
