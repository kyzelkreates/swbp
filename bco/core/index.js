// BCO Core — Public API (Run 3)
// Single import surface. Always import from here, not individual files.

// ── Storage (Run 1) ──────────────────────────────────────
export { StorageAdapter, LocalStorageAdapter } from "./storage-adapter.js";
export { storage, SSOT_KEYS } from "./storage.js";

// ── Event system (Run 1 + Run 3 emitEvent) ──────────────
export { createEvent, logEvent, emitEvent } from "./events.js";

// ── Action engine — full lifecycle (Run 2) ───────────────
export {
  createAction,
  dispatchAction,
  processAction,
  validateAction,
  executeAction,
  createAlert,
  aiSuggest
} from "./actions.js";

// ── Rule engine (Run 2) ──────────────────────────────────
export { evaluateRules, evaluateCondition } from "./rules.js";

// ── Module system (Run 3) ────────────────────────────────
export {
  moduleRegistry,
  validateModule,
  createModuleEvent,
  createModuleAction,
  getModuleEntities,
  setModuleEntities,
  getModuleUI,
  canRead,
  canWrite,
  isBlocked
} from "./modules.js";

// ── System init (Run 1 + Run 3 hydration) ───────────────
export { initSSOT } from "./init.js";
