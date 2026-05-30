// BCO Core — Run 3: Module Registry + Plugin Architecture
// Uses rawLog() to avoid circular dep with events.js.

import { storage, SSOT_KEYS, rawLog } from "./storage.js";

// ─────────────────────────────────────────────
// MODULE REGISTRY
// ─────────────────────────────────────────────

const _memoryRegistry = [];

export const moduleRegistry = {
  register(module) {
    validateModule(module);

    if (_memoryRegistry.find((m) => m.name === module.name)) {
      console.warn(`[BCO Modules] "${module.name}" already registered. Skipping.`);
      return;
    }

    _memoryRegistry.push(module);

    const modules = storage.get(SSOT_KEYS.MODULES) || [];
    modules.push(module);
    storage.set(SSOT_KEYS.MODULES, modules);

    rawLog("MODULE_REGISTERED", { name: module.name, version: module.version });
    console.log(`[BCO Modules] "${module.name}" v${module.version} registered.`);
  },

  get(name) {
    return _memoryRegistry.find((m) => m.name === name) || null;
  },

  getAll() {
    return [..._memoryRegistry];
  },

  hydrate() {
    const persisted = storage.get(SSOT_KEYS.MODULES) || [];
    persisted.forEach((m) => {
      if (!_memoryRegistry.find((r) => r.name === m.name)) {
        _memoryRegistry.push(m);
      }
    });
  }
};

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────

export function validateModule(module) {
  if (!module.name || typeof module.name !== "string") {
    throw new Error("[BCO Modules] Module must have a valid string name.");
  }
  if (!module.version)                     module.version    = "1.0";
  if (!Array.isArray(module.entities))     throw new Error(`"${module.name}": entities must be an array.`);
  if (!Array.isArray(module.actions))      module.actions    = [];
  if (!Array.isArray(module.rules))        module.rules      = [];
  if (!Array.isArray(module.ui_blocks))    module.ui_blocks  = [];
  if (!module.config)                      module.config     = {};

  if (!module.permissions) {
    module.permissions = { read: [], write: [], blockedActions: [] };
  } else {
    module.permissions.read           = module.permissions.read           || [];
    module.permissions.write          = module.permissions.write          || [];
    module.permissions.blockedActions = module.permissions.blockedActions || [];
  }

  return true;
}

// ─────────────────────────────────────────────
// MODULE-SCOPED EVENTS
// ─────────────────────────────────────────────

export function createModuleEvent(module, type, payload, source = "user") {
  return {
    id: crypto.randomUUID(),
    module: module.name,
    type: `${module.name}.${type}`,
    payload,
    source,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// MODULE-SCOPED ENTITY STORAGE
// ─────────────────────────────────────────────

export function getModuleEntities(moduleName, key) {
  return storage.get(`${moduleName}.${key}`) || [];
}

export function setModuleEntities(moduleName, key, value) {
  storage.set(`${moduleName}.${key}`, value);
}

// ─────────────────────────────────────────────
// MODULE-SCOPED ACTION FACTORY
// ─────────────────────────────────────────────

export function createModuleAction(module, type, payload, triggeredBy = null) {
  return {
    id: crypto.randomUUID(),
    module: module.name,
    type,
    status: "pending",
    priority: "normal",
    triggeredBy,
    payload,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// UI WIDGET INJECTION
// ─────────────────────────────────────────────

export function getModuleUI(moduleName) {
  const module = moduleRegistry.get(moduleName);
  return module?.ui_blocks || [];
}

// ─────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────

export function canRead(module, role) {
  return module.permissions.read.includes(role);
}

export function canWrite(module, role) {
  return module.permissions.write.includes(role);
}

export function isBlocked(module, actionType) {
  return module.permissions.blockedActions.includes(actionType);
}
