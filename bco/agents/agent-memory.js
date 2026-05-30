// BCO Agents — Memory + Context Scoping System (Run 9 §11)
// Four memory scopes: global, tenant, module, session.
// Each scope has its own namespaced storage key.
// Agents read/write only their permitted scopes.
// No cross-tenant reads — tenant scope enforces tenantId prefix.

import { StorageAdapter } from "../core/storage-adapter.js";
import { tenantStorage } from "../saas/tenant-storage.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// SCOPE KEYS
// ─────────────────────────────────────────────

export const MEMORY_SCOPES = {
  GLOBAL:  "global",
  TENANT:  "tenant",
  MODULE:  "module",
  SESSION: "session"
};

function _globalKey(agentId, key)          { return `bco_agent_mem:global:${agentId}:${key}`; }
function _tenantKey(tenantId, agentId, key){ return `t:${tenantId}:bco_agent_mem:${agentId}:${key}`; }
function _moduleKey(moduleName, agentId, key){ return `bco_agent_mem:module:${moduleName}:${agentId}:${key}`; }
// Session memory: JS Map (in-memory only, not persisted)
const _sessionStore = new Map();

// ─────────────────────────────────────────────
// AGENT MEMORY INTERFACE
// ─────────────────────────────────────────────

/**
 * AgentMemory
 * Scoped memory interface bound to a specific agent.
 * Each method routes to the correct storage tier.
 */
export function createAgentMemory(agent) {
  return {
    agentId:  agent.id,
    scopes:   agent.memory_scope,

    // ── Global scope (platform-wide, shared across tenants) ──────────
    global: {
      get: (key) => {
        _assertScope(agent, MEMORY_SCOPES.GLOBAL);
        return StorageAdapter.get(_globalKey(agent.id, key));
      },
      set: (key, value) => {
        _assertScope(agent, MEMORY_SCOPES.GLOBAL);
        StorageAdapter.set(_globalKey(agent.id, key), value);
        rawLog("AGENT_MEMORY_WRITE", { agentId: agent.id, scope: "global", key }, "MEMORY");
      },
      delete: (key) => {
        _assertScope(agent, MEMORY_SCOPES.GLOBAL);
        StorageAdapter.delete(_globalKey(agent.id, key));
      }
    },

    // ── Tenant scope (isolated per tenant — Run 6 boundary respected) ──
    tenant: {
      get: (key) => {
        _assertScope(agent, MEMORY_SCOPES.TENANT);
        _assertTenantId(agent);
        return StorageAdapter.get(_tenantKey(agent.tenantId, agent.id, key));
      },
      set: (key, value) => {
        _assertScope(agent, MEMORY_SCOPES.TENANT);
        _assertTenantId(agent);
        StorageAdapter.set(_tenantKey(agent.tenantId, agent.id, key), value);
        rawLog("AGENT_MEMORY_WRITE", { agentId: agent.id, scope: "tenant", tenantId: agent.tenantId, key }, "MEMORY");
      },
      delete: (key) => {
        _assertScope(agent, MEMORY_SCOPES.TENANT);
        _assertTenantId(agent);
        StorageAdapter.delete(_tenantKey(agent.tenantId, agent.id, key));
      }
    },

    // ── Module scope (namespaced per module) ─────────────────────────
    module: {
      get: (moduleName, key) => {
        _assertScope(agent, MEMORY_SCOPES.MODULE);
        return StorageAdapter.get(_moduleKey(moduleName, agent.id, key));
      },
      set: (moduleName, key, value) => {
        _assertScope(agent, MEMORY_SCOPES.MODULE);
        StorageAdapter.set(_moduleKey(moduleName, agent.id, key), value);
        rawLog("AGENT_MEMORY_WRITE", { agentId: agent.id, scope: "module", moduleName, key }, "MEMORY");
      },
      delete: (moduleName, key) => {
        _assertScope(agent, MEMORY_SCOPES.MODULE);
        StorageAdapter.delete(_moduleKey(moduleName, agent.id, key));
      }
    },

    // ── Session scope (in-memory only, not persisted) ─────────────────
    session: {
      get: (key) => {
        _assertScope(agent, MEMORY_SCOPES.SESSION);
        return _sessionStore.get(_sessionKey(agent.id, key)) ?? null;
      },
      set: (key, value) => {
        _assertScope(agent, MEMORY_SCOPES.SESSION);
        _sessionStore.set(_sessionKey(agent.id, key), value);
      },
      delete: (key) => {
        _assertScope(agent, MEMORY_SCOPES.SESSION);
        _sessionStore.delete(_sessionKey(agent.id, key));
      },
      clear: () => {
        const prefix = `session:${agent.id}:`;
        [..._sessionStore.keys()]
          .filter((k) => k.startsWith(prefix))
          .forEach((k) => _sessionStore.delete(k));
      }
    }
  };
}

// ─────────────────────────────────────────────
// AGENT MEMORY SNAPSHOT (for debugging/introspection)
// ─────────────────────────────────────────────

/**
 * getMemorySnapshot(agent)
 * Returns all persisted keys for an agent across non-session scopes.
 */
export function getMemorySnapshot(agent) {
  const prefix    = `bco_agent_mem`;
  const allKeys   = StorageAdapter.keys(prefix);
  const agentKeys = allKeys.filter((k) => k.includes(agent.id));

  return agentKeys.reduce((acc, k) => {
    acc[k] = StorageAdapter.get(k);
    return acc;
  }, {});
}

/**
 * clearAgentMemory(agent, scope?)
 * Clears all memory for an agent, optionally scoped.
 */
export function clearAgentMemory(agent, scope = null) {
  if (!scope || scope === MEMORY_SCOPES.SESSION) {
    createAgentMemory(agent).session.clear();
  }

  if (!scope || scope !== MEMORY_SCOPES.SESSION) {
    const prefix = `bco_agent_mem`;
    StorageAdapter.keys(prefix)
      .filter((k) => k.includes(agent.id))
      .forEach((k) => StorageAdapter.delete(k));
  }

  rawLog("AGENT_MEMORY_CLEARED", { agentId: agent.id, scope: scope || "all" }, "MEMORY");
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _sessionKey(agentId, key) { return `session:${agentId}:${key}`; }

function _assertScope(agent, scope) {
  if (!agent.memory_scope[scope]) {
    throw new Error(`[BCO Memory] Agent "${agent.name}" does not have access to "${scope}" memory scope.`);
  }
}

function _assertTenantId(agent) {
  if (!agent.tenantId) {
    throw new Error(`[BCO Memory] Agent "${agent.name}" has no tenantId — cannot access tenant memory scope.`);
  }
}
