// BCO No-Code — Workflow Compiler (Run 8)
// Transforms a visual workflow (nodes + connections) into an executable plan.
// Output is a compiled graph: trigger → condition chain → action list.
// The execution engine reads compiled workflows only — never raw node graphs.

import { NODE_TYPES, validateWorkflow } from "./workflow-schema.js";

// ─────────────────────────────────────────────
// COMPILE ENTRY POINT
// ─────────────────────────────────────────────

/**
 * buildWorkflow(nodes, connections, meta?)
 * Assembles and immediately compiles a workflow.
 *
 * @returns {{ nodes, connections, compiled, valid, errors }}
 */
export function buildWorkflow(nodes, connections, meta = {}) {
  const workflow = {
    ...meta,
    nodes,
    connections
  };

  const validation = validateWorkflow(workflow);

  return {
    nodes,
    connections,
    compiled: validation.valid ? compileWorkflow(nodes, connections) : null,
    valid:    validation.valid,
    errors:   validation.errors
  };
}

/**
 * compileWorkflow(nodes, connections)
 * Converts the visual graph into a structured execution plan.
 *
 * @returns {CompiledWorkflow}
 *
 * @typedef {Object} CompiledWorkflow
 * @property {CompiledTrigger[]} triggers
 * @property {Map<string, WorkflowNode>} nodeIndex
 * @property {Map<string, string[]>}     adjacency   — sourceId → [targetId]
 * @property {string[]}                  executionOrder
 */
export function compileWorkflow(nodes, connections) {
  // Build adjacency list
  const adjacency = new Map();
  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

  nodes.forEach((n) => adjacency.set(n.id, []));
  connections.forEach((c) => {
    adjacency.get(c.source)?.push(c.target);
    // Annotate connection onto the node for fast lookup during execution
    const sourceNode = nodeIndex.get(c.source);
    if (sourceNode) {
      sourceNode._compiledOutputs = sourceNode._compiledOutputs || [];
      sourceNode._compiledOutputs.push(c);
    }
  });

  // Extract trigger nodes — entry points
  const triggers = nodes
    .filter((n) => n.type.startsWith("trigger."))
    .map((n) => _compileTrigger(n, adjacency, nodeIndex, connections));

  // Topological sort for display/debug purposes
  const executionOrder = _topologicalSort(nodeIndex, adjacency);

  return {
    triggers,
    nodeIndex,
    adjacency,
    executionOrder,
    compiledAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// TRIGGER COMPILATION
// ─────────────────────────────────────────────

function _compileTrigger(triggerNode, adjacency, nodeIndex, connections) {
  return {
    id:          triggerNode.id,
    type:        triggerNode.type,
    config:      triggerNode.config,
    label:       triggerNode.label,
    // Pre-resolve the immediate next nodes for fast lookup at runtime
    nextSteps:   (adjacency.get(triggerNode.id) || []).map((targetId) => {
      const conn = connections.find((c) => c.source === triggerNode.id && c.target === targetId);
      return { nodeId: targetId, condition: conn?.condition || null, label: conn?.label || "" };
    })
  };
}

// ─────────────────────────────────────────────
// TOPOLOGICAL SORT (Kahn's algorithm)
// ─────────────────────────────────────────────

function _topologicalSort(nodeIndex, adjacency) {
  const inDegree = new Map([...nodeIndex.keys()].map((id) => [id, 0]));

  adjacency.forEach((targets) => {
    targets.forEach((t) => inDegree.set(t, (inDegree.get(t) || 0) + 1));
  });

  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    (adjacency.get(id) || []).forEach((t) => {
      const deg = (inDegree.get(t) || 1) - 1;
      inDegree.set(t, deg);
      if (deg === 0) queue.push(t);
    });
  }

  return order;
}
