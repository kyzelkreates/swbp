// BCO No-Code — Rule Builder UI Engine (Run 8)
// Manages the visual editor canvas state: nodes, connections, drag/drop,
// zoom, pan, selection, and inspector binding.
// Rule 7: UI is a read-only render layer — all mutations route through
// workflow-registry.js (save) and workflow-engine.js (execute).

import { NODE_TYPES, NODE_CATEGORIES, createNode, createConnection,
         createWorkflow, validateWorkflow } from "./workflow-schema.js";
import { buildWorkflow } from "./workflow-compiler.js";
import { saveWorkflow, activateWorkflow } from "./workflow-registry.js";
import { loadTemplate, listTemplates } from "./workflow-templates.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// CANVAS STATE MODEL
// ─────────────────────────────────────────────

/**
 * createEditorState()
 * Initialises a fresh visual editor state.
 *
 * @typedef {Object} EditorState
 * @property {WorkflowNode[]}       canvas          — all nodes on the canvas
 * @property {WorkflowConnection[]} connections
 * @property {number}               zoom_level      — 0.25–3.0
 * @property {{ x, y }}             pan_position
 * @property {string|null}          selected_node
 * @property {string|null}          dragged_node
 * @property {boolean}              minimap
 * @property {object|null}          activeWorkflow  — the workflow being edited
 * @property {string[]}             validationErrors
 * @property {boolean}              isDirty         — unsaved changes
 */
export function createEditorState(workflow = null) {
  return {
    canvas:           workflow?.nodes       || [],
    connections:      workflow?.connections || [],
    zoom_level:       1.0,
    pan_position:     { x: 0, y: 0 },
    selected_node:    null,
    dragged_node:     null,
    minimap:          true,
    activeWorkflow:   workflow,
    validationErrors: [],
    isDirty:          false
  };
}

// ─────────────────────────────────────────────
// TOOLBAR
// ─────────────────────────────────────────────

/**
 * renderRuleBuilder(tenantId)
 * Returns the complete UI structure description for the rule builder.
 * The framework-specific renderer (React, Lit, etc.) reads this descriptor.
 */
export function renderRuleBuilder(tenantId = null) {
  return {
    toolbar: {
      categories: Object.entries(NODE_CATEGORIES).map(([cat, types]) => ({
        name:  cat,
        icon:  { trigger: "⚡", condition: "🔀", action: "⚙️", flow: "🔄" }[cat] || "📦",
        nodes: types.map((type) => ({
          type,
          label:  _labelFor(type),
          colour: _colourFor(type)
        }))
      })),
      actions: ["new", "save", "activate", "deactivate", "undo", "redo", "validate", "export"]
    },
    canvas: {
      type:      "drag_drop_workspace",
      gridSize:  20,
      snapToGrid: true,
      zoomRange: [0.25, 3.0]
    },
    inspector: {
      type:       "node_configuration_panel",
      tabs:       ["config", "conditions", "notes"],
      livePreview: true
    },
    minimap:   true,
    templates: listTemplates()
  };
}

// ─────────────────────────────────────────────
// CANVAS MUTATIONS (state helpers)
// ─────────────────────────────────────────────

export const canvasActions = {

  /**
   * addNode(state, type, position?)
   * Adds a new node to the canvas.
   */
  addNode(state, type, position = { x: 100, y: 100 }) {
    const node = createNode(type, {}, position);
    return {
      ...state,
      canvas:  [...state.canvas, node],
      isDirty: true,
      selected_node: node.id
    };
  },

  /**
   * removeNode(state, nodeId)
   * Removes a node and all its connections.
   */
  removeNode(state, nodeId) {
    return {
      ...state,
      canvas:      state.canvas.filter((n) => n.id !== nodeId),
      connections: state.connections.filter((c) => c.source !== nodeId && c.target !== nodeId),
      selected_node: state.selected_node === nodeId ? null : state.selected_node,
      isDirty: true
    };
  },

  /**
   * updateNode(state, nodeId, patch)
   * Updates a node's config or position.
   */
  updateNode(state, nodeId, patch) {
    return {
      ...state,
      canvas: state.canvas.map((n) =>
        n.id === nodeId ? { ...n, ...patch, config: { ...n.config, ...(patch.config || {}) } } : n
      ),
      isDirty: true
    };
  },

  /**
   * moveNode(state, nodeId, position)
   */
  moveNode(state, nodeId, position) {
    return canvasActions.updateNode(state, nodeId, { position });
  },

  /**
   * connect(state, sourceId, targetId, condition?, label?)
   * Draws a connection between two nodes.
   */
  connect(state, sourceId, targetId, condition = null, label = "") {
    // Prevent duplicate connections
    const exists = state.connections.some((c) => c.source === sourceId && c.target === targetId);
    if (exists) return state;

    const conn = createConnection(sourceId, targetId, condition, label);
    return {
      ...state,
      connections: [...state.connections, conn],
      isDirty: true
    };
  },

  /**
   * disconnect(state, connectionId)
   */
  disconnect(state, connectionId) {
    return {
      ...state,
      connections: state.connections.filter((c) => c.id !== connectionId),
      isDirty: true
    };
  },

  /**
   * selectNode(state, nodeId)
   */
  selectNode(state, nodeId) {
    return { ...state, selected_node: nodeId };
  },

  /**
   * setZoom(state, level)
   */
  setZoom(state, level) {
    return { ...state, zoom_level: Math.min(3.0, Math.max(0.25, level)) };
  },

  /**
   * pan(state, dx, dy)
   */
  pan(state, dx, dy) {
    return {
      ...state,
      pan_position: {
        x: state.pan_position.x + dx,
        y: state.pan_position.y + dy
      }
    };
  },

  /**
   * loadFromTemplate(state, templateName, createdBy?)
   * Replaces canvas with a template workflow.
   */
  loadFromTemplate(state, templateName, createdBy = "user") {
    const wf = loadTemplate(templateName, createdBy);
    return createEditorState(wf);
  },

  /**
   * validate(state)
   * Runs structural validation and returns state with errors populated.
   */
  validate(state) {
    const result = validateWorkflow({
      name:        state.activeWorkflow?.name || "Draft",
      nodes:       state.canvas,
      connections: state.connections
    });
    return { ...state, validationErrors: result.errors };
  }
};

// ─────────────────────────────────────────────
// SAVE + ACTIVATE (routes to registry)
// ─────────────────────────────────────────────

/**
 * saveEditorState(tenantId, state, userId?)
 * Persists the current canvas to the workflow registry.
 */
export function saveEditorState(tenantId, state, userId = "user") {
  const wf = state.activeWorkflow
    ? { ...state.activeWorkflow, nodes: state.canvas, connections: state.connections }
    : { ...createWorkflow("New Workflow", "", userId), nodes: state.canvas, connections: state.connections };

  const saved = saveWorkflow(tenantId, wf, userId);
  rawLog("EDITOR_SAVED", { tenantId, workflowId: saved.id }, "NOCODE");
  return { ...state, activeWorkflow: saved, isDirty: false, validationErrors: [] };
}

/**
 * activateEditorWorkflow(tenantId, state)
 * Validates, saves, then activates the workflow.
 * Throws if validation fails — activation requires a valid workflow.
 */
export function activateEditorWorkflow(tenantId, state, userId = "user") {
  const validated = canvasActions.validate(state);
  if (validated.validationErrors.length > 0) {
    throw new Error(
      `[BCO Builder] Cannot activate invalid workflow:\n  • ${validated.validationErrors.join("\n  • ")}`
    );
  }
  const saved = saveEditorState(tenantId, validated, userId);
  activateWorkflow(tenantId, saved.activeWorkflow.id);
  rawLog("EDITOR_ACTIVATED", { tenantId, workflowId: saved.activeWorkflow.id }, "NOCODE");
  return { ...saved, activeWorkflow: { ...saved.activeWorkflow, active: true } };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _labelFor(type) {
  return type.split(".").pop().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function _colourFor(type) {
  if (type.startsWith("trigger."))   return "#3b82f6";
  if (type.startsWith("condition.")) return "#f59e0b";
  if (type.startsWith("action."))    return "#10b981";
  if (type.startsWith("flow."))      return "#8b5cf6";
  return "#6b7280";
}
