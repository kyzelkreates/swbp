// BCO Agents — Agent Core: schema, registry, goal engine (Run 9)
// Defines the agent model, all six system agent types, and the
// goal-driven execution contract.
//
// Safety boundary (§13) is enforced here:
//   - Agents dispatch actions through Run 2's action engine only.
//   - No agent can write billing, permissions, or cross-tenant data directly.
//   - Destructive actions require VALIDATED status before execution.

import { dispatchAction } from "../core/actions.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// AGENT TYPES
// ─────────────────────────────────────────────

export const AGENT_TYPES = {
  OPTIMISATION:  "optimisation",   // performance tuning
  MONITORING:    "monitoring",     // health + anomaly detection
  WORKFLOW:      "workflow",       // task execution
  PREDICTION:    "prediction",     // forecasting + planning
  RECOVERY:      "recovery",       // error correction
  COORDINATION:  "coordination"    // multi-module orchestration
};

// ─────────────────────────────────────────────
// AGENT STATUS
// ─────────────────────────────────────────────

export const AGENT_STATUS = {
  IDLE:     "idle",
  RUNNING:  "running",
  PAUSED:   "paused",
  ERROR:    "error",
  SHUTDOWN: "shutdown"
};

// ─────────────────────────────────────────────
// GOAL STATUS
// ─────────────────────────────────────────────

export const GOAL_STATUS = {
  PENDING:   "pending",
  ACTIVE:    "active",
  COMPLETED: "completed",
  FAILED:    "failed",
  BLOCKED:   "blocked"    // safety gate blocked execution
};

// ─────────────────────────────────────────────
// PRIORITY LEVELS
// ─────────────────────────────────────────────

export const PRIORITY = {
  CRITICAL: 0,
  HIGH:     1,
  NORMAL:   2,
  LOW:      3
};

// ─────────────────────────────────────────────
// SAFETY CAPABILITY MAP (§13)
// Defines what each agent type is ALLOWED to do.
// ─────────────────────────────────────────────

export const AGENT_CAPABILITIES = {
  [AGENT_TYPES.OPTIMISATION]: [
    "read_metrics", "suggest_config_change", "rebalance_modules",
    "adjust_thresholds", "emit_optimisation_event"
  ],
  [AGENT_TYPES.MONITORING]: [
    "read_metrics", "read_logs", "create_alert",
    "emit_anomaly_event", "notify_admin"
  ],
  [AGENT_TYPES.WORKFLOW]: [
    "read_metrics", "trigger_workflow", "emit_event",
    "update_module_state", "create_alert"
  ],
  [AGENT_TYPES.PREDICTION]: [
    "read_metrics", "read_history", "emit_forecast_event",
    "suggest_plan", "update_forecast_state"
  ],
  [AGENT_TYPES.RECOVERY]: [
    "read_metrics", "read_logs", "isolate_module",
    "rollback_module_state", "notify_admin", "emit_recovery_event"
  ],
  [AGENT_TYPES.COORDINATION]: [
    "read_metrics", "assign_goal", "delegate_to_agent",
    "emit_coordination_event", "create_alert"
  ]
};

// Forbidden for ALL agents regardless of type (§13)
export const AGENT_FORBIDDEN = [
  "mutate_billing",
  "mutate_permissions",
  "bypass_rule_engine",
  "cross_tenant_read",
  "delete_tenant",
  "execute_destructive_unvalidated"
];

// ─────────────────────────────────────────────
// AGENT FACTORY
// ─────────────────────────────────────────────

/**
 * createAgent(type, name, tenantId?, memoryScope?)
 *
 * @typedef {Object} BCOAgent
 * @property {string}   id
 * @property {string}   name
 * @property {string}   role         — from AGENT_TYPES
 * @property {Goal[]}   goals
 * @property {string[]} capabilities — from AGENT_CAPABILITIES
 * @property {object}   memory_scope — { global, tenant, module, session }
 * @property {string[]} permissions  — allowed action types
 * @property {string}   status       — from AGENT_STATUS
 * @property {string}   tenantId
 * @property {string}   createdAt
 */
export function createAgent(type, name, tenantId = null, memoryScope = {}) {
  if (!Object.values(AGENT_TYPES).includes(type)) {
    throw new Error(`[BCO Agent] Unknown agent type: "${type}"`);
  }

  return {
    id:           crypto.randomUUID(),
    name:         name || `${type}_agent`,
    role:         type,
    goals:        [],
    capabilities: AGENT_CAPABILITIES[type] || [],
    memory_scope: {
      global:  memoryScope.global  ?? true,
      tenant:  memoryScope.tenant  ?? (tenantId !== null),
      module:  memoryScope.module  ?? false,
      session: memoryScope.session ?? true
    },
    permissions:  AGENT_CAPABILITIES[type] || [],
    status:       AGENT_STATUS.IDLE,
    tenantId,
    createdAt:    new Date().toISOString(),
    lastActiveAt: null,
    runCount:     0
  };
}

// ─────────────────────────────────────────────
// IN-MEMORY AGENT REGISTRY
// ─────────────────────────────────────────────

const _agentRegistry = new Map(); // id → BCOAgent

export function registerAgent(agent) {
  _agentRegistry.set(agent.id, agent);
  rawLog("AGENT_REGISTERED", { id: agent.id, name: agent.name, role: agent.role }, "AGENT");
  return agent;
}

export function getAgent(id) {
  return _agentRegistry.get(id) || null;
}

export function listAgents(tenantId = null) {
  const all = [..._agentRegistry.values()];
  return tenantId ? all.filter((a) => a.tenantId === tenantId || a.tenantId === null) : all;
}

export function deregisterAgent(id) {
  _agentRegistry.delete(id);
  rawLog("AGENT_DEREGISTERED", { id }, "AGENT");
}

// ─────────────────────────────────────────────
// GOAL ENGINE
// ─────────────────────────────────────────────

/**
 * assignGoal(agent, description, priority?, context?)
 * Adds a goal to the agent's queue.
 *
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} description
 * @property {string} status        — from GOAL_STATUS
 * @property {number} priority      — from PRIORITY
 * @property {object} context       — arbitrary metadata for plan generation
 * @property {string} createdAt
 * @property {string} completedAt
 */
export function assignGoal(agent, description, priority = PRIORITY.NORMAL, context = {}) {
  _assertCapability(agent, "assign_goal_or_self");  // soft check — coordination agents delegate

  const goal = {
    id:          crypto.randomUUID(),
    description,
    status:      GOAL_STATUS.PENDING,
    priority,
    context,
    createdAt:   new Date().toISOString(),
    completedAt: null,
    result:      null
  };

  agent.goals.push(goal);
  // Keep goals sorted by priority (lower number = higher priority)
  agent.goals.sort((a, b) => a.priority - b.priority);

  rawLog("GOAL_ASSIGNED", { agentId: agent.id, goalId: goal.id, description }, "AGENT");
  return goal;
}

/**
 * executeGoals(agent, plannerFn?)
 * Processes all PENDING goals in priority order.
 * plannerFn(goal, agent) → Plan — injected to keep this file pure.
 */
export async function executeGoals(agent, plannerFn) {
  if (agent.status === AGENT_STATUS.SHUTDOWN) {
    throw new Error(`[BCO Agent] Agent "${agent.name}" is shut down.`);
  }

  agent.status      = AGENT_STATUS.RUNNING;
  agent.lastActiveAt = new Date().toISOString();
  agent.runCount++;

  const pending = agent.goals.filter((g) => g.status === GOAL_STATUS.PENDING);
  const results = [];

  for (const goal of pending) {
    goal.status = GOAL_STATUS.ACTIVE;
    try {
      const plan   = plannerFn ? await plannerFn(goal, agent) : _defaultPlan(goal, agent);
      const result = await _executePlan(plan, agent);
      goal.status      = GOAL_STATUS.COMPLETED;
      goal.completedAt = new Date().toISOString();
      goal.result      = result;
      results.push({ goalId: goal.id, status: "completed", result });
      rawLog("GOAL_COMPLETED", { agentId: agent.id, goalId: goal.id }, "AGENT");
    } catch (err) {
      goal.status = GOAL_STATUS.FAILED;
      goal.result = { error: err.message };
      results.push({ goalId: goal.id, status: "failed", error: err.message });
      rawLog("GOAL_FAILED", { agentId: agent.id, goalId: goal.id, error: err.message }, "AGENT");
    }
  }

  agent.status = AGENT_STATUS.IDLE;
  return results;
}

// ─────────────────────────────────────────────
// PLAN EXECUTION
// ─────────────────────────────────────────────

/**
 * executePlan(plan, agent)
 * Executes a plan's steps sequentially through the action engine.
 * Each step must declare a type and payload — routes through Run 2.
 */
async function _executePlan(plan, agent) {
  const stepResults = [];

  for (const step of (plan.steps || [])) {
    _assertCapability(agent, step.capability || step.type);
    _assertNotForbidden(step.type);

    const result = dispatchAction({
      type:    step.type,
      payload: { ...step.payload, _agentId: agent.id, _tenantId: agent.tenantId },
      source:  "agent"
    });

    stepResults.push({ step: step.type, result });

    // Abort remaining steps if one fails and plan is strict
    if (result?.status === "rejected" && plan.strict) {
      throw new Error(`[BCO Agent] Plan step "${step.type}" was rejected by the rule engine.`);
    }
  }

  return { stepsExecuted: stepResults.length, steps: stepResults };
}

function _defaultPlan(goal, agent) {
  // Fallback: emit an event describing the goal — safe no-op
  return {
    steps: [{
      type:       "AGENT_GOAL_EVENT",
      capability: "emit_event",
      payload:    { description: goal.description, agentRole: agent.role }
    }]
  };
}

// ─────────────────────────────────────────────
// SAFETY ENFORCEMENT (§13)
// ─────────────────────────────────────────────

export function _assertCapability(agent, capability) {
  // Allow "assign_goal_or_self" — used internally, not an external capability string
  if (capability === "assign_goal_or_self") return;
  if (!agent.capabilities.includes(capability)) {
    rawLog("AGENT_CAPABILITY_DENIED", { agent: agent.name, capability }, "AGENT");
    throw new Error(`[BCO Agent] "${agent.name}" (${agent.role}) lacks capability "${capability}".`);
  }
}

export function _assertNotForbidden(actionType) {
  if (AGENT_FORBIDDEN.includes(actionType)) {
    rawLog("AGENT_FORBIDDEN_ACTION", { actionType }, "AGENT");
    throw new Error(`[BCO Agent] Action "${actionType}" is forbidden for all agents (§13).`);
  }
}
