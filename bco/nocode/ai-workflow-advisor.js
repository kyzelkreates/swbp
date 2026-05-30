// BCO No-Code — AI Workflow Advisor (Run 8)
// Suggests workflows based on event patterns and usage data.
// Rule §11: AI CANNOT auto-activate. All suggestions require human approval.
// This file never calls activateWorkflow() or saveWorkflow() directly.

import { generateInsights } from "../ai/insight-engine.js";
import { NODE_TYPES, createNode, createConnection, createWorkflow } from "./workflow-schema.js";
import { listWorkflows } from "./workflow-registry.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// WORKFLOW SUGGESTION ENGINE
// ─────────────────────────────────────────────

/**
 * aiSuggestWorkflow(tenantId, context?)
 * Analyses active patterns and existing workflows, returns suggested new workflows.
 * Output: suggestions only — nothing is saved or activated.
 *
 * @param {string} tenantId
 * @param {{ maxSuggestions?, valueField? }} context
 * @returns {AISuggestion[]}
 *
 * @typedef {Object} AISuggestion
 * @property {string}   reasoning
 * @property {number}   confidence        — 0–1
 * @property {object}   suggestedWorkflow — workflow blueprint (not yet saved)
 * @property {string[]} suggestedNodes    — node type list for summary display
 * @property {string[]} suggestedConnections
 * @property {boolean}  requiresApproval  — always true
 */
export function aiSuggestWorkflow(tenantId, { maxSuggestions = 3, valueField = "value" } = {}) {
  const insights   = generateInsights({ valueField });
  const existing   = listWorkflows(tenantId).map((w) => w.name);
  const suggestions = [];

  insights.forEach((ins) => {
    if (suggestions.length >= maxSuggestions) return;

    const moduleName = ins.module;
    const severity   = ins.riskResult?.severity || "none";
    const anomalies  = ins.anomalies?.length || 0;
    const downtrend  = (ins.trends?.downward?.length || 0) > 0;

    // ── High-risk module → suggest alert escalation ─────────────────
    if ((severity === "high" || severity === "critical") && !_alreadyExists(existing, "escalation", moduleName)) {
      suggestions.push(_buildSuggestion(
        `Detected ${severity} risk score (${ins.riskScore}/100) in module "${moduleName}". An escalation flow would automatically notify the right people when this worsens.`,
        0.85,
        _buildEscalationSuggestion(moduleName, ins.riskScore)
      ));
    }

    // ── Anomaly spike → suggest anomaly alerting ─────────────────────
    if (anomalies > 3 && !_alreadyExists(existing, "anomaly", moduleName)) {
      suggestions.push(_buildSuggestion(
        `${anomalies} anomalies detected in "${moduleName}". A threshold-based trigger could catch these automatically.`,
        0.78,
        _buildThresholdSuggestion(moduleName)
      ));
    }

    // ── Downward trend → suggest corrective action flow ──────────────
    if (downtrend && !_alreadyExists(existing, "correction", moduleName)) {
      suggestions.push(_buildSuggestion(
        `Sustained downward trend detected in "${moduleName}". An automated correction workflow could stabilise performance.`,
        0.70,
        _buildCorrectiveSuggestion(moduleName)
      ));
    }
  });

  rawLog("AI_WORKFLOW_SUGGESTED", {
    tenantId,
    count: suggestions.length,
    modules: insights.map((i) => i.module)
  }, "NOCODE");

  return suggestions;
}

// ─────────────────────────────────────────────
// PATTERN-BASED WORKFLOW MATCHING
// ─────────────────────────────────────────────

/**
 * aiMatchWorkflowToEvent(event, tenantId)
 * Suggests which existing inactive workflow might be relevant to activate
 * given a specific event, based on trigger type matching.
 * Returns match candidates — does not activate anything.
 */
export function aiMatchWorkflowToEvent(event, tenantId) {
  const inactive = listWorkflows(tenantId).filter((w) => !w.active);

  const matches = inactive
    .filter((wf) =>
      wf.nodes?.some((n) =>
        n.type.startsWith("trigger.") &&
        (n.config?.eventType === event.type ||
         n.config?.eventType === "*" ||
         (n.config?.eventType?.endsWith(".*") && event.type.startsWith(n.config.eventType.slice(0, -2))))
      )
    )
    .map((wf) => ({
      workflowId:   wf.id,
      workflowName: wf.name,
      matchReason:  `Trigger pattern matches event type "${event.type}"`,
      requiresApproval: true
    }));

  return matches;
}

// ─────────────────────────────────────────────
// SUGGESTION BUILDERS (produce workflow blueprints)
// ─────────────────────────────────────────────

function _buildSuggestion(reasoning, confidence, workflowBlueprint) {
  return {
    reasoning,
    confidence,
    suggestedWorkflow:    workflowBlueprint,
    suggestedNodes:       workflowBlueprint.nodes.map((n) => n.type),
    suggestedConnections: workflowBlueprint.connections.map((c) => `${c.source} → ${c.target}`),
    requiresApproval:     true  // IMMUTABLE — AI rule §11
  };
}

function _buildEscalationSuggestion(moduleName, riskScore) {
  const wf      = createWorkflow(`AI: ${moduleName} Escalation`, `Auto-suggested: escalate when risk > ${riskScore}`, "ai");
  const trigger = createNode(NODE_TYPES.TRIGGER_STATE_CHANGE, { label: "Risk State Changed", module: moduleName }, { x: 100, y: 100 });
  const cond    = createNode(NODE_TYPES.CONDITION_GT,         { label: `Risk > ${riskScore}`, field: "riskScore", value: riskScore }, { x: 300, y: 100 });
  const alert   = createNode(NODE_TYPES.ACTION_ALERT,         { label: "Escalate", severity: "critical", message: `Risk threshold exceeded in ${moduleName}`, module: moduleName }, { x: 500, y: 60 });
  const notify  = createNode(NODE_TYPES.ACTION_NOTIFY,        { label: "Notify Team", message: `Escalation alert: ${moduleName}`, severity: "critical" }, { x: 700, y: 60 });
  const stop    = createNode(NODE_TYPES.STOP,                 { label: "End" }, { x: 900, y: 100 });
  const nodes   = [trigger, cond, alert, notify, stop];
  const connections = [
    createConnection(trigger.id, cond.id,   null, ""),
    createConnection(cond.id,    alert.id,  null, "true"),
    createConnection(cond.id,    stop.id,   null, "false"),
    createConnection(alert.id,   notify.id, null, ""),
    createConnection(notify.id,  stop.id,   null, "")
  ];
  return { ...wf, nodes, connections };
}

function _buildThresholdSuggestion(moduleName) {
  const wf      = createWorkflow(`AI: ${moduleName} Anomaly Alert`, `Auto-suggested: alert on anomalous values in ${moduleName}`, "ai");
  const trigger = createNode(NODE_TYPES.TRIGGER_THRESHOLD,    { label: "Anomaly Threshold", field: "value", operator: "gt", value: 0 }, { x: 100, y: 100 });
  const alert   = createNode(NODE_TYPES.ACTION_ALERT,         { label: "Anomaly Alert", severity: "medium", message: `Anomalous value detected in ${moduleName}`, module: moduleName }, { x: 300, y: 100 });
  const stop    = createNode(NODE_TYPES.STOP,                 { label: "End" }, { x: 500, y: 100 });
  const nodes   = [trigger, alert, stop];
  const connections = [
    createConnection(trigger.id, alert.id, null, ""),
    createConnection(alert.id,   stop.id,  null, "")
  ];
  return { ...wf, nodes, connections };
}

function _buildCorrectiveSuggestion(moduleName) {
  const wf      = createWorkflow(`AI: ${moduleName} Correction`, `Auto-suggested: emit corrective event on downward trend in ${moduleName}`, "ai");
  const trigger = createNode(NODE_TYPES.TRIGGER_STATE_CHANGE, { label: "Trend State Changed", module: moduleName }, { x: 100, y: 100 });
  const cond    = createNode(NODE_TYPES.CONDITION_EQUALS,     { label: "Trend = down?", field: "trend", value: "down" }, { x: 300, y: 100 });
  const emit    = createNode(NODE_TYPES.ACTION_EMIT_EVENT,    { label: "Emit Correction", eventType: `${moduleName}.CORRECTION_NEEDED`, payload: { module: moduleName } }, { x: 500, y: 60 });
  const stop    = createNode(NODE_TYPES.STOP,                 { label: "End" }, { x: 700, y: 100 });
  const nodes   = [trigger, cond, emit, stop];
  const connections = [
    createConnection(trigger.id, cond.id, null, ""),
    createConnection(cond.id,    emit.id, null, "true"),
    createConnection(cond.id,    stop.id, null, "false"),
    createConnection(emit.id,    stop.id, null, "")
  ];
  return { ...wf, nodes, connections };
}

function _alreadyExists(existingNames, keyword, moduleName) {
  return existingNames.some(
    (n) => n.toLowerCase().includes(keyword) && n.toLowerCase().includes(moduleName.toLowerCase())
  );
}
