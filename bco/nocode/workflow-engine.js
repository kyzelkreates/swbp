// BCO No-Code — Workflow Execution Engine (Run 8)
// Walks a compiled workflow graph in response to incoming events.
// Follows the §10 real-time execution flow:
//   Event → Workflow match → Trigger eval → Condition eval →
//   Branch selection → Action execution → State update → UI sync
//
// All action execution routes back through Run 2's action engine.
// AI suggestions pass through here but require human approval before activation.

import { NODE_TYPES } from "./workflow-schema.js";
import { dispatchAction } from "../core/actions.js";
import { pushNotification } from "../ui/notifications.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// ENGINE ENTRY POINT
// ─────────────────────────────────────────────

/**
 * executeWorkflow(workflow, event, tenantId?)
 * Main execution path. Walks from matched triggers to all reachable actions.
 *
 * @param {{ compiled, nodes, connections, active, permissions }} workflow
 * @param {BCOEvent} event
 * @param {string}   tenantId
 * @returns {WorkflowExecutionReport}
 */
export function executeWorkflow(workflow, event, tenantId = null) {
  if (!workflow.active) {
    return _report(workflow, event, [], "skipped", "Workflow is inactive.");
  }
  if (!workflow.compiled) {
    return _report(workflow, event, [], "error", "Workflow is not compiled.");
  }

  const log = [];

  // ── Step 1: Find matching triggers ────────
  const matchedTriggers = workflow.compiled.triggers.filter((trigger) =>
    evaluateTrigger(trigger, event)
  );

  if (matchedTriggers.length === 0) {
    return _report(workflow, event, log, "no_match", "No triggers matched this event.");
  }

  log.push({ step: "triggers_matched", count: matchedTriggers.length });

  // ── Step 2: Walk graph from each trigger ──
  matchedTriggers.forEach((trigger) => {
    _walk(trigger.nextSteps, event, workflow.compiled, log, tenantId, new Set());
  });

  rawLog("WORKFLOW_EXECUTED", {
    workflowId: workflow.id,
    eventType:  event.type,
    steps:      log.length,
    tenantId
  }, "NOCODE");

  return _report(workflow, event, log, "executed");
}

// ─────────────────────────────────────────────
// GRAPH WALKER
// ─────────────────────────────────────────────

function _walk(steps, event, compiled, log, tenantId, visited) {
  for (const step of steps) {
    const nodeId = step.nodeId;

    // Cycle guard (shouldn't occur in validated workflows but defensive)
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    // Edge condition guard
    if (step.condition && !evaluateBranch(step.condition, event)) {
      log.push({ step: "edge_condition_failed", nodeId, condition: step.condition });
      continue;
    }

    const node = compiled.nodeIndex.get(nodeId);
    if (!node) continue;

    log.push({ step: "node_entered", nodeId, type: node.type, label: node.label });

    // ── Condition nodes ─────────────────────
    if (node.type.startsWith("condition.")) {
      const passed = _evaluateConditionNode(node, event);
      log.push({ step: "condition_evaluated", nodeId, passed, type: node.type });

      const nextSteps = (node._compiledOutputs || []).filter((conn) => {
        // Route: "true" label → passed, "false" label → !passed, unlabelled → always
        if (conn.label === "true")  return passed;
        if (conn.label === "false") return !passed;
        return passed; // unlabelled edge only fires if condition passes
      });

      _walk(nextSteps.map((c) => ({ nodeId: c.target, condition: c.condition, label: c.label })),
            event, compiled, log, tenantId, visited);
      continue;
    }

    // ── Branch / flow nodes ─────────────────
    if (node.type === NODE_TYPES.BRANCH) {
      const branches = (node._compiledOutputs || []);
      // All branches evaluated independently (parallel fan-out)
      branches.forEach((conn) => {
        const branchSteps = [{ nodeId: conn.target, condition: conn.condition, label: conn.label }];
        _walk(branchSteps, event, compiled, log, tenantId, new Set(visited));
      });
      continue;
    }

    if (node.type === NODE_TYPES.STOP) {
      log.push({ step: "stop_node", nodeId });
      return;
    }

    if (node.type === NODE_TYPES.DELAY) {
      const ms = node.config?.durationMs || 1000;
      log.push({ step: "delay_queued", nodeId, ms });
      // Async delay — schedule continuation (in production: use job queue)
      setTimeout(() => {
        const next = (node._compiledOutputs || []).map((c) => ({ nodeId: c.target, condition: c.condition }));
        _walk(next, event, compiled, log, tenantId, new Set(visited));
      }, ms);
      continue;
    }

    // ── Action nodes ────────────────────────
    if (node.type.startsWith("action.")) {
      const actionResult = _executeActionNode(node, event, tenantId);
      log.push({ step: "action_executed", nodeId, type: node.type, result: actionResult });

      // Continue walking to any nodes connected after this action
      const next = (node._compiledOutputs || []).map((c) => ({ nodeId: c.target, condition: c.condition }));
      _walk(next, event, compiled, log, tenantId, visited);
    }
  }
}

// ─────────────────────────────────────────────
// TRIGGER EVALUATION
// ─────────────────────────────────────────────

/**
 * evaluateTrigger(trigger, event)
 * Returns true if the incoming event matches the trigger's conditions.
 */
export function evaluateTrigger(trigger, event) {
  switch (trigger.type) {

    case NODE_TYPES.TRIGGER_EVENT:
      // Match by event type (supports wildcard "*" and prefix "MODULE.*")
      return _matchEventType(trigger.config.eventType, event.type);

    case NODE_TYPES.TRIGGER_THRESHOLD: {
      const val = _resolve(trigger.config.field, event.payload);
      return _compare(val, trigger.config.operator, trigger.config.value);
    }

    case NODE_TYPES.TRIGGER_STATE_CHANGE:
      return event.type === "STATE_CHANGED" &&
             (!trigger.config.module || event.module === trigger.config.module);

    case NODE_TYPES.TRIGGER_TIME:
      // Time-based triggers are fired externally (scheduler calls executeWorkflow).
      // If we receive the matching sentinel event, treat it as triggered.
      return event.type === `SCHEDULED:${trigger.id}`;

    default:
      return false;
  }
}

// ─────────────────────────────────────────────
// CONDITION / BRANCH EVALUATION
// ─────────────────────────────────────────────

/**
 * evaluateBranch(condition, event)
 * Recursive AND/OR/NOT + leaf condition evaluator.
 */
export function evaluateBranch(condition, event) {
  if (!condition) return true;

  switch (condition.type) {
    case "AND":
    case NODE_TYPES.CONDITION_AND:
      return (condition.rules || []).every((r) => evaluateBranch(r, event));

    case "OR":
    case NODE_TYPES.CONDITION_OR:
      return (condition.rules || []).some((r) => evaluateBranch(r, event));

    case "NOT":
    case NODE_TYPES.CONDITION_NOT:
      return !evaluateBranch(condition.rule, event);

    default:
      // Leaf condition
      return _evaluateLeaf(condition, event);
  }
}

function _evaluateConditionNode(node, event) {
  switch (node.type) {
    case NODE_TYPES.CONDITION_AND:
      return (node.config.rules || []).every((r) => evaluateBranch(r, event));
    case NODE_TYPES.CONDITION_OR:
      return (node.config.rules || []).some((r) => evaluateBranch(r, event));
    case NODE_TYPES.CONDITION_NOT:
      return !evaluateBranch(node.config.rule, event);
    default:
      return _evaluateLeaf(node.config, event);
  }
}

function _evaluateLeaf(condition, event) {
  const actual = _resolve(condition.field, event?.payload ?? event);
  return _compare(actual, condition.operator || condition.type?.split(".").pop(), condition.value);
}

// ─────────────────────────────────────────────
// ACTION EXECUTION
// ─────────────────────────────────────────────

function _executeActionNode(node, event, tenantId) {
  const cfg = node.config || {};

  switch (node.type) {

    case NODE_TYPES.ACTION_ALERT:
      return dispatchAction({
        type:    "CREATE_ALERT",
        payload: {
          severity: cfg.severity || "medium",
          message:  cfg.message  || `Alert from workflow: ${node.label}`,
          module:   cfg.module   || event.module,
          tenantId
        },
        source: "workflow"
      });

    case NODE_TYPES.ACTION_NOTIFY:
      pushNotification(
        cfg.message || `Notification: ${node.label}`,
        cfg.severity || "info",
        cfg.module   || event.module
      );
      return { notified: true };

    case NODE_TYPES.ACTION_UPDATE_STATE:
      return dispatchAction({
        type:    "UPDATE_STATE",
        payload: { key: cfg.key, value: cfg.value, module: cfg.module, tenantId },
        source:  "workflow"
      });

    case NODE_TYPES.ACTION_TRIGGER_MODULE:
      return dispatchAction({
        type:    cfg.actionType || "MODULE_ACTION",
        payload: { ...cfg.payload, module: cfg.module, tenantId },
        source:  "workflow"
      });

    case NODE_TYPES.ACTION_EMIT_EVENT:
      return dispatchAction({
        type:    cfg.eventType || "WORKFLOW_EVENT",
        payload: { ...cfg.payload, tenantId },
        source:  "workflow"
      });

    case NODE_TYPES.ACTION_WEBHOOK:
      // Async fire-and-forget — does not block workflow execution
      _fireWebhook(cfg.url, { event, tenantId, node: node.id }).catch((e) =>
        rawLog("WEBHOOK_ERROR", { nodeId: node.id, error: e.message }, "NOCODE")
      );
      return { webhookQueued: true };

    default:
      rawLog("UNKNOWN_ACTION_NODE", { type: node.type }, "NOCODE");
      return { skipped: true };
  }
}

async function _fireWebhook(url, payload) {
  if (!url) return;
  await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload)
  });
}

// ─────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────

function _resolve(path, obj) {
  if (!path || !obj) return undefined;
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function _compare(actual, operator, expected) {
  switch (operator) {
    case "equals":       case "eq":  return actual == expected;
    case "not_equals":   case "neq": return actual != expected;
    case "greater_than": case "gt":  return Number(actual) > Number(expected);
    case "less_than":    case "lt":  return Number(actual) < Number(expected);
    case "gte":                      return Number(actual) >= Number(expected);
    case "lte":                      return Number(actual) <= Number(expected);
    case "contains":                 return String(actual).includes(String(expected));
    case "starts_with":              return String(actual).startsWith(String(expected));
    case "ends_with":                return String(actual).endsWith(String(expected));
    case "exists":                   return actual !== undefined && actual !== null;
    case "is_empty":                 return actual === undefined || actual === null || actual === "";
    default:                         return false;
  }
}

function _matchEventType(pattern, type) {
  if (!pattern || pattern === "*") return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -2));
  return pattern === type;
}

function _report(workflow, event, log, status, message = "") {
  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    eventType:  event.type,
    status,
    message,
    steps:      log.length,
    log,
    executedAt: new Date().toISOString()
  };
}
