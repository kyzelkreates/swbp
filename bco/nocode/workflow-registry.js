// BCO No-Code — Workflow Registry (Run 8)
// Stores, versions, activates, and dispatches workflows per tenant.
// The execution engine queries this registry on every event.
// Versioning: every save creates a snapshot. Rollback is supported.

import { createWorkflow, validateWorkflow } from "./workflow-schema.js";
import { compileWorkflow } from "./workflow-compiler.js";
import { tenantStorage, TENANT_KEYS } from "../saas/tenant-storage.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// TENANT WORKFLOW KEY
// ─────────────────────────────────────────────

const WF_KEY = "bco_workflows";

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/**
 * saveWorkflow(tenantId, workflow, userId?)
 * Saves or updates a workflow. Recompiles and appends a version snapshot.
 * @returns {Workflow}
 */
export function saveWorkflow(tenantId, workflow, userId = "system") {
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    throw new Error(`[BCO Workflows] Invalid workflow:\n  • ${validation.errors.join("\n  • ")}`);
  }

  const all = _load(tenantId);
  const existing = all.find((w) => w.id === workflow.id);

  // Bump version
  const newVersion = _bumpVersion(existing?.version || "0.0.0");

  // Snapshot for history
  const snapshot = {
    version:   existing?.version || "0.0.0",
    savedAt:   new Date().toISOString(),
    savedBy:   userId,
    nodes:     JSON.parse(JSON.stringify(existing?.nodes || [])),
    connections: JSON.parse(JSON.stringify(existing?.connections || []))
  };

  const compiled = compileWorkflow(workflow.nodes, workflow.connections);

  const updated = {
    ...workflow,
    compiled,
    version:   newVersion,
    updatedAt: new Date().toISOString(),
    history:   [...(existing?.history || []).slice(-9), snapshot] // keep last 10 versions
  };

  if (existing) {
    const idx = all.indexOf(existing);
    all[idx] = updated;
  } else {
    all.push(updated);
  }

  _save(tenantId, all);
  rawLog("WORKFLOW_SAVED", { tenantId, id: workflow.id, version: newVersion }, "NOCODE");

  return updated;
}

/**
 * getWorkflow(tenantId, workflowId)
 */
export function getWorkflow(tenantId, workflowId) {
  return _load(tenantId).find((w) => w.id === workflowId) || null;
}

/**
 * listWorkflows(tenantId)
 */
export function listWorkflows(tenantId) {
  return _load(tenantId);
}

/**
 * deleteWorkflow(tenantId, workflowId)
 */
export function deleteWorkflow(tenantId, workflowId) {
  const all = _load(tenantId).filter((w) => w.id !== workflowId);
  _save(tenantId, all);
  rawLog("WORKFLOW_DELETED", { tenantId, workflowId }, "NOCODE");
  return true;
}

// ─────────────────────────────────────────────
// ACTIVATION
// ─────────────────────────────────────────────

/**
 * activateWorkflow(tenantId, workflowId)
 * Marks a workflow as active. AI-suggested workflows require explicit activation.
 */
export function activateWorkflow(tenantId, workflowId) {
  return _setActive(tenantId, workflowId, true);
}

export function deactivateWorkflow(tenantId, workflowId) {
  return _setActive(tenantId, workflowId, false);
}

function _setActive(tenantId, workflowId, active) {
  const all = _load(tenantId);
  const wf  = all.find((w) => w.id === workflowId);
  if (!wf) throw new Error(`[BCO Workflows] Workflow "${workflowId}" not found.`);

  wf.active    = active;
  wf.updatedAt = new Date().toISOString();
  _save(tenantId, all);
  rawLog(active ? "WORKFLOW_ACTIVATED" : "WORKFLOW_DEACTIVATED", { tenantId, workflowId }, "NOCODE");
  return wf;
}

// ─────────────────────────────────────────────
// ROLLBACK
// ─────────────────────────────────────────────

/**
 * rollbackWorkflow(tenantId, workflowId, version?)
 * Restores the last (or a specific) historical snapshot.
 * @returns {Workflow} — the restored workflow
 */
export function rollbackWorkflow(tenantId, workflowId, version = null) {
  const all = _load(tenantId);
  const wf  = all.find((w) => w.id === workflowId);
  if (!wf) throw new Error(`[BCO Workflows] Workflow "${workflowId}" not found.`);
  if (!wf.history?.length) throw new Error(`[BCO Workflows] No history available for "${workflowId}".`);

  const snapshot = version
    ? wf.history.find((h) => h.version === version)
    : wf.history[wf.history.length - 1];

  if (!snapshot) throw new Error(`[BCO Workflows] Version "${version}" not found in history.`);

  wf.nodes       = snapshot.nodes;
  wf.connections = snapshot.connections;
  wf.compiled    = compileWorkflow(snapshot.nodes, snapshot.connections);
  wf.version     = _bumpVersion(wf.version);
  wf.updatedAt   = new Date().toISOString();
  wf.active      = false; // deactivate after rollback — requires manual re-activation

  _save(tenantId, all);
  rawLog("WORKFLOW_ROLLED_BACK", { tenantId, workflowId, toVersion: snapshot.version }, "NOCODE");

  return wf;
}

// ─────────────────────────────────────────────
// ACTIVE WORKFLOW DISPATCHER (called on every event)
// ─────────────────────────────────────────────

/**
 * getActiveWorkflows(tenantId)
 * Returns only compiled, active workflows for event dispatching.
 */
export function getActiveWorkflows(tenantId) {
  return _load(tenantId).filter((w) => w.active && w.compiled);
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _load(tenantId) {
  return tenantStorage.get(tenantId, WF_KEY) || [];
}

function _save(tenantId, workflows) {
  tenantStorage.set(tenantId, WF_KEY, workflows);
}

function _bumpVersion(current) {
  const [maj, min, pat] = current.split(".").map(Number);
  return `${maj}.${min}.${(pat || 0) + 1}`;
}
