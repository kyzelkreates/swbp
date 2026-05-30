// BCO Agents — Multi-Agent Coordination Engine (Run 9, fixed Run 10)
// Coordinates goal assignment across the agent pool.
// FIX: Per-tenant pool map — each tenant gets its own isolated agent pool.
//      No more module-level singleton that bleeds across tenants.
// §13: coordination never bypasses the rule engine.

import {
  createAgent, registerAgent, assignGoal,
  executeGoals, AGENT_TYPES, AGENT_STATUS, PRIORITY
} from "./agent-core.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// PER-TENANT POOL MAP  (Run 10 fix)
// ─────────────────────────────────────────────
// Key: tenantId string (or "__global__" for platform-level agents)
// Value: BCOAgent[]

const _pools = new Map();

const GLOBAL_KEY = "__global__";

function _poolKey(tenantId) {
  return tenantId ?? GLOBAL_KEY;
}

// ─────────────────────────────────────────────
// AGENT POOL LIFECYCLE
// ─────────────────────────────────────────────

/**
 * initAgentPool(tenantId?)
 * Bootstraps the default BCO system agent pool for a tenant (or globally).
 * Safe to call multiple times — returns existing pool if already initialised.
 */
export function initAgentPool(tenantId = null) {
  const key = _poolKey(tenantId);
  if (_pools.has(key)) return _pools.get(key);

  const pool = [
    AGENT_TYPES.OPTIMISATION,
    AGENT_TYPES.MONITORING,
    AGENT_TYPES.WORKFLOW,
    AGENT_TYPES.PREDICTION,
    AGENT_TYPES.RECOVERY,
    AGENT_TYPES.COORDINATION
  ].map((type) => registerAgent(createAgent(type, `${type}_agent`, tenantId)));

  _pools.set(key, pool);
  rawLog("AGENT_POOL_INIT", { tenantId, agents: pool.length }, "COORDINATOR");
  return pool;
}

/**
 * getAgentPool(tenantId?)
 * Returns the pool for a tenant, initialising if needed.
 */
export function getAgentPool(tenantId = null) {
  return _pools.get(_poolKey(tenantId)) || initAgentPool(tenantId);
}

/**
 * destroyAgentPool(tenantId)
 * Tears down a tenant's pool (e.g. on tenant deletion or suspension).
 */
export function destroyAgentPool(tenantId) {
  const key = _poolKey(tenantId);
  const pool = _pools.get(key);
  if (pool) {
    pool.forEach((a) => { a.status = AGENT_STATUS.SHUTDOWN; });
    _pools.delete(key);
    rawLog("AGENT_POOL_DESTROYED", { tenantId }, "COORDINATOR");
  }
}

/**
 * getAgentByType(type, tenantId?)
 */
export function getAgentByType(type, tenantId = null) {
  return getAgentPool(tenantId)
    .find((a) => a.role === type && a.status !== AGENT_STATUS.SHUTDOWN) || null;
}

/**
 * listAllPools()
 * Returns a summary of all active pools — for platform-admin introspection.
 */
export function listAllPools() {
  return [..._pools.entries()].map(([key, pool]) => ({
    tenantId: key === GLOBAL_KEY ? null : key,
    agents:   pool.length,
    active:   pool.filter((a) => a.status === AGENT_STATUS.RUNNING).length
  }));
}

// ─────────────────────────────────────────────
// TASK DECOMPOSITION
// ─────────────────────────────────────────────

/**
 * coordinateAgents(task, tenantId?, options?)
 * Splits a complex task into subtasks and assigns each to the right agent.
 *
 * @param {{ description, type?, context?, subtasks? }} task
 * @returns {{ plan, assignments }}
 */
export function coordinateAgents(task, tenantId = null, options = {}) {
  const pool = getAgentPool(tenantId);
  const plan = splitTaskIntoSubtasks(task);

  const assignments = plan.map((subtask) => {
    const agent = _selectAgent(pool, subtask) || _roundRobin(pool, subtask._index);

    if (!agent) {
      rawLog("COORDINATION_NO_AGENT", { subtask: subtask.description }, "COORDINATOR");
      return { subtask, agent: null, status: "unassigned" };
    }

    const goal = assignGoal(
      agent,
      subtask.description,
      subtask.priority ?? PRIORITY.NORMAL,
      subtask.context  ?? {}
    );

    rawLog("SUBTASK_ASSIGNED", {
      taskDescription: task.description,
      subtask:         subtask.description,
      agentId:         agent.id,
      agentRole:       agent.role,
      tenantId
    }, "COORDINATOR");

    return {
      subtask,
      agent:  { id: agent.id, name: agent.name, role: agent.role },
      goal,
      status: "assigned"
    };
  });

  return { plan, assignments };
}

/**
 * splitTaskIntoSubtasks(task)
 */
export function splitTaskIntoSubtasks(task) {
  if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
    return task.subtasks.map((s, i) => ({ ...s, _index: i }));
  }

  const decompositions = {
    system_health:     _healthSubtasks,
    module_optimise:   _optimiseSubtasks,
    incident_response: _incidentSubtasks,
    planning:          _planningSubtasks
  };

  const decompose = decompositions[task.type || "general"] || _genericSubtasks;
  return decompose(task).map((s, i) => ({ ...s, _index: i }));
}

// ─────────────────────────────────────────────
// EXECUTE ASSIGNED GOALS (batch)
// ─────────────────────────────────────────────

export async function runAssignedGoals(assignments, plannerFn = null, tenantId = null) {
  const pool    = getAgentPool(tenantId);
  const results = [];

  for (const assignment of assignments) {
    if (!assignment.agent?.id) continue;
    const agent = pool.find((a) => a.id === assignment.agent.id);
    if (!agent) continue;

    const agentResults = await executeGoals(agent, plannerFn);
    results.push({ agentId: agent.id, role: agent.role, results: agentResults });
  }

  return results;
}

// ─────────────────────────────────────────────
// AGENT SELECTION
// ─────────────────────────────────────────────

const _capabilityMap = {
  optimise:   AGENT_TYPES.OPTIMISATION,
  monitor:    AGENT_TYPES.MONITORING,
  recover:    AGENT_TYPES.RECOVERY,
  predict:    AGENT_TYPES.PREDICTION,
  workflow:   AGENT_TYPES.WORKFLOW,
  coordinate: AGENT_TYPES.COORDINATION
};

function _selectAgent(pool, subtask) {
  const hint = subtask.agentHint || subtask.type || "";
  const targetKey = _capabilityMap[hint]
    ? hint
    : Object.keys(_capabilityMap).find((k) => subtask.description?.toLowerCase().includes(k));

  if (!targetKey) return null;

  return pool.find(
    (a) => a.role === _capabilityMap[targetKey] && a.status === AGENT_STATUS.IDLE
  ) || null;
}

function _roundRobin(pool, index) {
  const available = pool.filter((a) => a.status === AGENT_STATUS.IDLE);
  return available.length ? available[index % available.length] : null;
}

// ─────────────────────────────────────────────
// DECOMPOSITION HEURISTICS
// ─────────────────────────────────────────────

function _healthSubtasks(task) {
  return [
    { description: "Collect and analyse system metrics",    type: "monitor",  priority: PRIORITY.HIGH },
    { description: "Detect anomalies and error patterns",   type: "monitor",  priority: PRIORITY.HIGH },
    { description: "Generate optimisation recommendations", type: "optimise", priority: PRIORITY.NORMAL },
    { description: "Apply safe performance fixes",          type: "optimise", priority: PRIORITY.NORMAL }
  ];
}

function _optimiseSubtasks(task) {
  return [
    { description: "Profile module load distribution",      type: "monitor",  priority: PRIORITY.NORMAL },
    { description: "Identify bottlenecks",                  type: "optimise", priority: PRIORITY.HIGH },
    { description: "Rebalance event routing",               type: "optimise", priority: PRIORITY.NORMAL }
  ];
}

function _incidentSubtasks(task) {
  return [
    { description: "Isolate affected module",               type: "recover",  priority: PRIORITY.CRITICAL },
    { description: "Capture diagnostic snapshot",           type: "monitor",  priority: PRIORITY.CRITICAL },
    { description: "Roll back to last safe state",          type: "recover",  priority: PRIORITY.HIGH },
    { description: "Notify admin of incident",              type: "monitor",  priority: PRIORITY.HIGH },
    { description: "Generate post-incident report",         type: "predict",  priority: PRIORITY.NORMAL }
  ];
}

function _planningSubtasks(task) {
  return [
    { description: "Analyse historical performance trends", type: "predict",  priority: PRIORITY.NORMAL },
    { description: "Generate long-term optimisation plan",  type: "predict",  priority: PRIORITY.NORMAL },
    { description: "Schedule follow-up health checks",      type: "workflow", priority: PRIORITY.LOW }
  ];
}

function _genericSubtasks(task) {
  return [
    { description: `Analyse: ${task.description}`,          type: "monitor",  priority: PRIORITY.NORMAL },
    { description: `Execute: ${task.description}`,          type: "workflow", priority: PRIORITY.NORMAL },
    { description: `Verify: ${task.description}`,           type: "monitor",  priority: PRIORITY.LOW }
  ];
}
