// BCO No-Code — Automation Template Library (Run 8)
// Pre-built workflow templates for common BCO use cases.
// Templates are blueprints — loadTemplate() returns a new workflow instance
// with fresh IDs ready to customise and save. Never modifies the original.

import { createNode, createConnection, createWorkflow, NODE_TYPES } from "./workflow-schema.js";

// ─────────────────────────────────────────────
// TEMPLATE LOADER
// ─────────────────────────────────────────────

/**
 * loadTemplate(templateName, createdBy?)
 * Returns a fully wired workflow object ready for saveWorkflow().
 * All node IDs are freshly generated — safe to load multiple instances.
 */
export function loadTemplate(templateName, createdBy = "system") {
  const factory = TEMPLATES[templateName];
  if (!factory) {
    throw new Error(
      `[BCO Templates] Template "${templateName}" not found. Available: ${Object.keys(TEMPLATES).join(", ")}`
    );
  }
  return factory(createdBy);
}

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([name, fn]) => ({
    name,
    ...TEMPLATE_META[name]
  }));
}

// ─────────────────────────────────────────────
// TEMPLATE METADATA
// ─────────────────────────────────────────────

const TEMPLATE_META = {
  alert_escalation: {
    label:       "Alert Escalation Flow",
    description: "Escalates unacknowledged alerts to high severity after a threshold.",
    category:    "operations",
    icon:        "🚨"
  },
  sleep_monitoring: {
    label:       "Sleep Monitoring Flow",
    description: "Detects poor sleep scores and triggers a wellbeing alert.",
    category:    "health",
    icon:        "😴"
  },
  neurocare_risk: {
    label:       "Neurocare Risk Detection",
    description: "Flags high-risk neurocare events and notifies the care team.",
    category:    "health",
    icon:        "🧠"
  },
  fleet_dispatch: {
    label:       "Fleet Dispatch Automation",
    description: "Auto-dispatches nearest available vehicle on job creation.",
    category:    "logistics",
    icon:        "🚚"
  }
};

// ─────────────────────────────────────────────
// TEMPLATE FACTORIES
// ─────────────────────────────────────────────

const TEMPLATES = {

  // ── Alert Escalation ─────────────────────────────────────────────────
  alert_escalation: (createdBy) => {
    const wf = createWorkflow("Alert Escalation Flow", TEMPLATE_META.alert_escalation.description, createdBy);

    const trigger   = createNode(NODE_TYPES.TRIGGER_EVENT,       { label: "Alert Received", eventType: "ALERT_CREATED" },        { x: 100, y: 100 });
    const condition = createNode(NODE_TYPES.CONDITION_EQUALS,    { label: "Is Unacknowledged?", field: "acknowledged", value: false }, { x: 300, y: 100 });
    const delay     = createNode(NODE_TYPES.DELAY,               { label: "Wait 15 min", durationMs: 15 * 60 * 1000 },            { x: 500, y: 100 });
    const checkAgain= createNode(NODE_TYPES.CONDITION_EQUALS,    { label: "Still Unacknowledged?", field: "acknowledged", value: false }, { x: 700, y: 100 });
    const escalate  = createNode(NODE_TYPES.ACTION_UPDATE_STATE, { label: "Escalate to Critical", key: "severity", value: "critical", module: "alerts" }, { x: 900, y: 60 });
    const notify    = createNode(NODE_TYPES.ACTION_NOTIFY,       { label: "Notify On-Call", message: "⚠️ Alert escalated to critical — immediate attention required.", severity: "critical" }, { x: 900, y: 160 });
    const stop      = createNode(NODE_TYPES.STOP,                { label: "End" },                                                { x: 1100, y: 100 });

    const nodes = [trigger, condition, delay, checkAgain, escalate, notify, stop];
    const connections = [
      createConnection(trigger.id,    condition.id,  null,          ""),
      createConnection(condition.id,  delay.id,      null,          "true"),
      createConnection(condition.id,  stop.id,       null,          "false"),
      createConnection(delay.id,      checkAgain.id, null,          ""),
      createConnection(checkAgain.id, escalate.id,   null,          "true"),
      createConnection(checkAgain.id, stop.id,       null,          "false"),
      createConnection(escalate.id,   notify.id,     null,          ""),
      createConnection(notify.id,     stop.id,       null,          "")
    ];

    return { ...wf, nodes, connections };
  },

  // ── Sleep Monitoring ─────────────────────────────────────────────────
  sleep_monitoring: (createdBy) => {
    const wf = createWorkflow("Sleep Monitoring Flow", TEMPLATE_META.sleep_monitoring.description, createdBy);

    const trigger   = createNode(NODE_TYPES.TRIGGER_STATE_CHANGE, { label: "Sleep Score Updated", module: "sleep" },            { x: 100, y: 100 });
    const threshold = createNode(NODE_TYPES.CONDITION_LT,         { label: "Score < 60?", field: "score", value: 60 },          { x: 300, y: 100 });
    const branch    = createNode(NODE_TYPES.BRANCH,               { label: "Severity Branch" },                                 { x: 500, y: 100 });
    const critical  = createNode(NODE_TYPES.CONDITION_LT,         { label: "Score < 40 (Critical)?", field: "score", value: 40 },{ x: 700, y: 60  });
    const alertCrit = createNode(NODE_TYPES.ACTION_ALERT,         { label: "Critical Sleep Alert", severity: "critical", message: "🚨 Sleep score critically low (<40). Immediate review recommended.", module: "sleep" }, { x: 900, y: 40 });
    const alertWarn = createNode(NODE_TYPES.ACTION_ALERT,         { label: "Sleep Warning",         severity: "medium",   message: "⚠️ Sleep score below threshold (<60).",                           module: "sleep" }, { x: 900, y: 120 });
    const notify    = createNode(NODE_TYPES.ACTION_NOTIFY,        { label: "Notify User",           message: "Your sleep quality needs attention.", severity: "info" },                                { x: 1100, y: 80 });
    const stop      = createNode(NODE_TYPES.STOP,                 { label: "End" },                                             { x: 1300, y: 100 });

    const nodes = [trigger, threshold, branch, critical, alertCrit, alertWarn, notify, stop];
    const connections = [
      createConnection(trigger.id,   threshold.id, null,  ""),
      createConnection(threshold.id, branch.id,    null,  "true"),
      createConnection(threshold.id, stop.id,      null,  "false"),
      createConnection(branch.id,    critical.id,  null,  "branch_1"),
      createConnection(branch.id,    alertWarn.id, null,  "branch_2"),
      createConnection(critical.id,  alertCrit.id, null,  "true"),
      createConnection(critical.id,  alertWarn.id, null,  "false"),
      createConnection(alertCrit.id, notify.id,    null,  ""),
      createConnection(alertWarn.id, notify.id,    null,  ""),
      createConnection(notify.id,    stop.id,      null,  "")
    ];

    return { ...wf, nodes, connections };
  },

  // ── Neurocare Risk Detection ──────────────────────────────────────────
  neurocare_risk: (createdBy) => {
    const wf = createWorkflow("Neurocare Risk Detection", TEMPLATE_META.neurocare_risk.description, createdBy);

    const trigger   = createNode(NODE_TYPES.TRIGGER_EVENT,        { label: "Neurocare Event",    eventType: "neurocare.*" },                    { x: 100, y: 100 });
    const riskCheck = createNode(NODE_TYPES.CONDITION_GT,         { label: "Risk Score > 70?",   field: "riskScore", value: 70 },               { x: 300, y: 100 });
    const alert     = createNode(NODE_TYPES.ACTION_ALERT,         { label: "High Risk Alert",    severity: "high", message: "🧠 High neurocare risk score detected. Care team review required.", module: "neurocare" }, { x: 500, y: 60 });
    const notify    = createNode(NODE_TYPES.ACTION_NOTIFY,        { label: "Notify Care Team",   message: "Neurocare risk escalation — please review.", severity: "high" }, { x: 700, y: 60 });
    const log       = createNode(NODE_TYPES.ACTION_EMIT_EVENT,    { label: "Log Risk Event",     eventType: "NEUROCARE_RISK_LOGGED", payload: { logged: true } }, { x: 500, y: 160 });
    const stop      = createNode(NODE_TYPES.STOP,                 { label: "End" },                                                            { x: 900, y: 100 });

    const nodes = [trigger, riskCheck, alert, notify, log, stop];
    const connections = [
      createConnection(trigger.id,   riskCheck.id, null, ""),
      createConnection(riskCheck.id, alert.id,     null, "true"),
      createConnection(riskCheck.id, log.id,       null, "false"),
      createConnection(alert.id,     notify.id,    null, ""),
      createConnection(notify.id,    stop.id,      null, ""),
      createConnection(log.id,       stop.id,      null, "")
    ];

    return { ...wf, nodes, connections };
  },

  // ── Fleet Dispatch ───────────────────────────────────────────────────
  fleet_dispatch: (createdBy) => {
    const wf = createWorkflow("Fleet Dispatch Automation", TEMPLATE_META.fleet_dispatch.description, createdBy);

    const trigger    = createNode(NODE_TYPES.TRIGGER_EVENT,        { label: "Job Created",        eventType: "fleet.JOB_CREATED" },              { x: 100, y: 100 });
    const available  = createNode(NODE_TYPES.CONDITION_EQUALS,     { label: "Vehicles Available?",field: "availableCount", operator: "gt", value: 0 }, { x: 300, y: 100 });
    const dispatch   = createNode(NODE_TYPES.ACTION_TRIGGER_MODULE,{ label: "Dispatch Nearest",   module: "fleet", actionType: "DISPATCH_VEHICLE", payload: { strategy: "nearest" } }, { x: 500, y: 60 });
    const notifyDrv  = createNode(NODE_TYPES.ACTION_NOTIFY,        { label: "Notify Driver",      message: "New job dispatched to your vehicle.", severity: "info" },                 { x: 700, y: 60 });
    const noVehicle  = createNode(NODE_TYPES.ACTION_ALERT,         { label: "No Vehicles Alert",  severity: "high", message: "🚚 No vehicles available for new job. Manual dispatch required.", module: "fleet" }, { x: 500, y: 160 });
    const stop       = createNode(NODE_TYPES.STOP,                 { label: "End" },                                                             { x: 900, y: 100 });

    const nodes = [trigger, available, dispatch, notifyDrv, noVehicle, stop];
    const connections = [
      createConnection(trigger.id,   available.id, null, ""),
      createConnection(available.id, dispatch.id,  null, "true"),
      createConnection(available.id, noVehicle.id, null, "false"),
      createConnection(dispatch.id,  notifyDrv.id, null, ""),
      createConnection(notifyDrv.id, stop.id,      null, ""),
      createConnection(noVehicle.id, stop.id,      null, "")
    ];

    return { ...wf, nodes, connections };
  }
};
