// BCO No-Code — Workflow Schema + Node Definitions (Run 8)
// Defines every node type, connection format, and the visual rule model.
// This is the schema contract — builder UI and execution engine both read from here.

// ─────────────────────────────────────────────
// NODE TYPE REGISTRY
// ─────────────────────────────────────────────

export const NODE_TYPES = {
  // Triggers — start a workflow
  TRIGGER_EVENT:          "trigger.event_received",
  TRIGGER_TIME:           "trigger.time_based",
  TRIGGER_THRESHOLD:      "trigger.threshold_crossed",
  TRIGGER_STATE_CHANGE:   "trigger.module_state_change",

  // Conditions — evaluate and branch
  CONDITION_EQUALS:       "condition.equals",
  CONDITION_GT:           "condition.greater_than",
  CONDITION_LT:           "condition.less_than",
  CONDITION_CONTAINS:     "condition.contains",
  CONDITION_AND:          "condition.and",
  CONDITION_OR:           "condition.or",
  CONDITION_NOT:          "condition.not",

  // Actions — do something
  ACTION_ALERT:           "action.create_alert",
  ACTION_UPDATE_STATE:    "action.update_state",
  ACTION_NOTIFY:          "action.send_notification",
  ACTION_TRIGGER_MODULE:  "action.trigger_module_action",
  ACTION_EMIT_EVENT:      "action.emit_event",
  ACTION_WEBHOOK:         "action.webhook",

  // Flow control
  BRANCH:                 "flow.branch",
  DELAY:                  "flow.delay",
  LOOP:                   "flow.loop",
  STOP:                   "flow.stop"
};

// Node categories for the builder toolbar
export const NODE_CATEGORIES = {
  trigger:   [NODE_TYPES.TRIGGER_EVENT, NODE_TYPES.TRIGGER_TIME, NODE_TYPES.TRIGGER_THRESHOLD, NODE_TYPES.TRIGGER_STATE_CHANGE],
  condition: [NODE_TYPES.CONDITION_EQUALS, NODE_TYPES.CONDITION_GT, NODE_TYPES.CONDITION_LT,
              NODE_TYPES.CONDITION_CONTAINS, NODE_TYPES.CONDITION_AND, NODE_TYPES.CONDITION_OR, NODE_TYPES.CONDITION_NOT],
  action:    [NODE_TYPES.ACTION_ALERT, NODE_TYPES.ACTION_UPDATE_STATE, NODE_TYPES.ACTION_NOTIFY,
              NODE_TYPES.ACTION_TRIGGER_MODULE, NODE_TYPES.ACTION_EMIT_EVENT, NODE_TYPES.ACTION_WEBHOOK],
  flow:      [NODE_TYPES.BRANCH, NODE_TYPES.DELAY, NODE_TYPES.LOOP, NODE_TYPES.STOP]
};

// ─────────────────────────────────────────────
// NODE SCHEMA (base + per-type config shapes)
// ─────────────────────────────────────────────

/**
 * createNode(type, config, position?)
 * Factory for a visual workflow node.
 *
 * @typedef {Object} WorkflowNode
 * @property {string}   id
 * @property {string}   type          — from NODE_TYPES
 * @property {string}   label         — human-readable display name
 * @property {object}   config        — type-specific parameters
 * @property {{ x, y }} position      — canvas position
 * @property {string[]} inputs        — node IDs whose outputs connect here
 * @property {string[]} outputs       — node IDs this connects to
 * @property {object}   [meta]        — UI metadata (colour, icon, notes)
 */
export function createNode(type, config = {}, position = { x: 0, y: 0 }) {
  if (!Object.values(NODE_TYPES).includes(type)) {
    throw new Error(`[BCO Workflow] Unknown node type: "${type}"`);
  }
  return {
    id:       crypto.randomUUID(),
    type,
    label:    config.label || _defaultLabel(type),
    config:   _validateNodeConfig(type, config),
    position,
    inputs:   [],
    outputs:  [],
    meta:     { colour: _nodeColour(type), icon: _nodeIcon(type) }
  };
}

// ─────────────────────────────────────────────
// CONNECTION SCHEMA
// ─────────────────────────────────────────────

/**
 * createConnection(sourceId, targetId, condition?)
 * @typedef {Object} WorkflowConnection
 * @property {string}  id
 * @property {string}  source
 * @property {string}  target
 * @property {object}  [condition]  — optional guard on this edge
 * @property {string}  [label]      — branch label ("true" / "false" / "else")
 */
export function createConnection(sourceId, targetId, condition = null, label = "") {
  return {
    id:        crypto.randomUUID(),
    source:    sourceId,
    target:    targetId,
    condition,
    label
  };
}

// ─────────────────────────────────────────────
// WORKFLOW SCHEMA
// ─────────────────────────────────────────────

/**
 * @typedef {Object} Workflow
 * @property {string}               id
 * @property {string}               name
 * @property {string}               description
 * @property {WorkflowNode[]}       nodes
 * @property {WorkflowConnection[]} connections
 * @property {boolean}              active
 * @property {string}               version        — semver
 * @property {WorkflowVersion[]}    history
 * @property {string}               createdAt
 * @property {string}               updatedAt
 * @property {string}               createdBy
 * @property {object}               permissions    — role → ["run", "edit", "view"]
 */
export function createWorkflow(name, description = "", createdBy = "system") {
  return {
    id:          crypto.randomUUID(),
    name,
    description,
    nodes:       [],
    connections: [],
    active:      false,
    version:     "1.0.0",
    history:     [],
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    createdBy,
    permissions: {
      admin:    ["run", "edit", "view", "activate", "delete"],
      operator: ["run", "edit", "view"],
      viewer:   ["view"],
      external: []
    }
  };
}

// ─────────────────────────────────────────────
// WORKFLOW VALIDATION
// ─────────────────────────────────────────────

/**
 * validateWorkflow(workflow)
 * Structural validation before save or activation.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorkflow(workflow) {
  const errors = [];
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  if (!workflow.name?.trim()) errors.push("Workflow must have a name.");

  if (!workflow.nodes.some((n) => n.type.startsWith("trigger."))) {
    errors.push("Workflow must have at least one trigger node.");
  }

  if (!workflow.nodes.some((n) => n.type.startsWith("action."))) {
    errors.push("Workflow must have at least one action node.");
  }

  // Every connection must reference real nodes
  for (const conn of workflow.connections) {
    if (!nodeIds.has(conn.source)) errors.push(`Connection "${conn.id}": source "${conn.source}" not found.`);
    if (!nodeIds.has(conn.target)) errors.push(`Connection "${conn.id}": target "${conn.target}" not found.`);
  }

  // Detect isolated nodes (no connections at all)
  const connectedIds = new Set([
    ...workflow.connections.map((c) => c.source),
    ...workflow.connections.map((c) => c.target)
  ]);
  workflow.nodes
    .filter((n) => !connectedIds.has(n.id) && workflow.nodes.length > 1)
    .forEach((n) => errors.push(`Node "${n.label}" (${n.id}) is isolated — not connected to any other node.`));

  // Detect cycles (depth-first)
  if (_hasCycle(workflow)) errors.push("Workflow contains a cycle. Loops must use the LOOP node explicitly.");

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _validateNodeConfig(type, config) {
  // Normalise — fill required fields with sensible defaults
  const base = { ...config };

  if (type === NODE_TYPES.TRIGGER_TIME && !base.cron && !base.interval) {
    base.interval = "5m";
  }
  if (type === NODE_TYPES.TRIGGER_THRESHOLD) {
    base.field    = base.field    || "value";
    base.operator = base.operator || "gt";
    base.value    = base.value    ?? 0;
  }
  if (type.startsWith("condition.") && !type.endsWith(".and") && !type.endsWith(".or") && !type.endsWith(".not")) {
    base.field    = base.field    || "value";
    base.value    = base.value    ?? "";
  }
  if (type === NODE_TYPES.DELAY) {
    base.durationMs = base.durationMs || 1000;
  }

  return base;
}

function _hasCycle(workflow) {
  const adjList = new Map(workflow.nodes.map((n) => [n.id, []]));
  workflow.connections.forEach((c) => adjList.get(c.source)?.push(c.target));

  const visited = new Set(), recStack = new Set();

  function dfs(id) {
    visited.add(id);
    recStack.add(id);
    for (const neighbour of (adjList.get(id) || [])) {
      if (!visited.has(neighbour) && dfs(neighbour)) return true;
      if (recStack.has(neighbour)) return true;
    }
    recStack.delete(id);
    return false;
  }

  return workflow.nodes.some((n) => !visited.has(n.id) && dfs(n.id));
}

function _defaultLabel(type) {
  const labels = {
    [NODE_TYPES.TRIGGER_EVENT]:        "Event Received",
    [NODE_TYPES.TRIGGER_TIME]:         "Time Trigger",
    [NODE_TYPES.TRIGGER_THRESHOLD]:    "Threshold Crossed",
    [NODE_TYPES.TRIGGER_STATE_CHANGE]: "State Changed",
    [NODE_TYPES.CONDITION_EQUALS]:     "Equals",
    [NODE_TYPES.CONDITION_GT]:         "Greater Than",
    [NODE_TYPES.CONDITION_LT]:         "Less Than",
    [NODE_TYPES.CONDITION_CONTAINS]:   "Contains",
    [NODE_TYPES.CONDITION_AND]:        "AND",
    [NODE_TYPES.CONDITION_OR]:         "OR",
    [NODE_TYPES.CONDITION_NOT]:        "NOT",
    [NODE_TYPES.ACTION_ALERT]:         "Create Alert",
    [NODE_TYPES.ACTION_UPDATE_STATE]:  "Update State",
    [NODE_TYPES.ACTION_NOTIFY]:        "Send Notification",
    [NODE_TYPES.ACTION_TRIGGER_MODULE]:"Trigger Module",
    [NODE_TYPES.ACTION_EMIT_EVENT]:    "Emit Event",
    [NODE_TYPES.ACTION_WEBHOOK]:       "Webhook",
    [NODE_TYPES.BRANCH]:               "Branch",
    [NODE_TYPES.DELAY]:                "Delay",
    [NODE_TYPES.LOOP]:                 "Loop",
    [NODE_TYPES.STOP]:                 "Stop"
  };
  return labels[type] || type;
}

function _nodeColour(type) {
  if (type.startsWith("trigger."))   return "#3b82f6"; // blue
  if (type.startsWith("condition.")) return "#f59e0b"; // amber
  if (type.startsWith("action."))    return "#10b981"; // green
  if (type.startsWith("flow."))      return "#8b5cf6"; // purple
  return "#6b7280";
}

function _nodeIcon(type) {
  if (type.startsWith("trigger."))   return "⚡";
  if (type.startsWith("condition.")) return "🔀";
  if (type.startsWith("action."))    return "⚙️";
  if (type.startsWith("flow."))      return "🔄";
  return "📦";
}
