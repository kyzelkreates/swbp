// BCO Agents — Long-Horizon Planning Engine (Run 9)
// Generates multi-phase strategic plans from system context.
// Plans are SUGGESTIONS — no plan self-activates without user approval.
// Confidence scoring uses Run 5 AI analytics.

import { collectSystemMetrics, evaluateThresholds, isImbalanced, METRIC_THRESHOLDS } from "./metrics.js";
import { detectPatterns, detectTrends } from "../ai/patterns.js";
import { calculateRiskScore } from "../ai/risk.js";
import { forecastBehaviour } from "../ai/forecast.js";
import { generateRecommendations } from "../ai/recommendations.js";
import { rawLog } from "../core/storage.js";
import { assignGoal, AGENT_STATUS, PRIORITY } from "./agent-core.js";

// ─────────────────────────────────────────────
// PLAN PHASES
// ─────────────────────────────────────────────

export const PLAN_PHASES = {
  STABILISE:    "stabilise_system",
  OPTIMISE:     "optimise_modules",
  EXPAND:       "expand_usage",
  REDUCE_LATENCY: "reduce_latency",
  INCREASE_AUTONOMY: "increase_autonomy"
};

// ─────────────────────────────────────────────
// LONG-TERM PLAN GENERATOR
// ─────────────────────────────────────────────

/**
 * generateLongTermPlan(context)
 * Produces an adaptive multi-phase plan based on real system signals.
 *
 * @param {{ tenantId?, moduleData?, events?, horizon? }} context
 * @returns {LongTermPlan}
 *
 * @typedef {Object} LongTermPlan
 * @property {Phase[]}  phases
 * @property {string}   timeline     — "adaptive" | "N_days"
 * @property {number}   confidence   — 0–1
 * @property {string}   reasoning
 * @property {boolean}  requiresApproval  — always true
 * @property {string}   generatedAt
 */
export function generateLongTermPlan(context = {}) {
  const metrics    = collectSystemMetrics(context.tenantId);
  const thresholds = evaluateThresholds(metrics);
  const confidence = calculateConfidence(context, metrics, thresholds);

  // Determine which phases are needed based on system state
  const phases = _buildPhases(metrics, thresholds, context);

  const plan = {
    phases,
    timeline:        _estimateTimeline(phases, confidence),
    confidence,
    reasoning:       _buildReasoning(metrics, thresholds, phases),
    requiresApproval: true,  // IMMUTABLE — plans never auto-execute
    tenantId:        context.tenantId || null,
    horizon:         context.horizon  || "30d",
    generatedAt:     new Date().toISOString()
  };

  rawLog("LONG_TERM_PLAN_GENERATED", {
    tenantId:   context.tenantId,
    phases:     phases.length,
    confidence: plan.confidence
  }, "PLANNER");

  return plan;
}

// ─────────────────────────────────────────────
// CONFIDENCE SCORER
// ─────────────────────────────────────────────

/**
 * calculateConfidence(context, metrics?, thresholds?)
 * Returns a 0–1 confidence value based on data quality and system health.
 */
export function calculateConfidence(context = {}, metrics = null, thresholds = null) {
  let score = 0.5; // baseline

  if (!metrics) metrics = collectSystemMetrics(context.tenantId);
  if (!thresholds) thresholds = evaluateThresholds(metrics);

  // More data = higher confidence
  const hasHistory = (context.events?.length || 0) > 10;
  if (hasHistory) score += 0.15;

  // Clean system = higher confidence in plan
  const criticalFlags = Object.values(thresholds).filter((f) => f === "critical").length;
  const warnFlags     = Object.values(thresholds).filter((f) => f === "warn").length;
  score -= criticalFlags * 0.10;
  score -= warnFlags     * 0.05;

  // Low error rate = more reliable predictions
  if (metrics.errorRate < 0.05) score += 0.15;
  if (metrics.errorRate > 0.15) score -= 0.15;

  // Module data enriches predictions
  if (context.moduleData && Object.keys(context.moduleData).length > 0) score += 0.10;

  return parseFloat(Math.min(1, Math.max(0.1, score)).toFixed(2));
}

// ─────────────────────────────────────────────
// PLAN GENERATION
// ─────────────────────────────────────────────

/**
 * generatePlan(goal, agent)
 * Generates an executable plan for a single agent goal.
 * Used as the plannerFn in executeGoals().
 */
export function generatePlan(goal, agent) {
  const description = goal.description.toLowerCase();
  const steps       = [];

  // Map goal description keywords to safe action steps
  if (description.includes("metric") || description.includes("monitor")) {
    steps.push({
      type:       "COLLECT_METRICS",
      capability: "read_metrics",
      payload:    { goalId: goal.id }
    });
  }

  if (description.includes("anomal") || description.includes("detect")) {
    steps.push({
      type:       "DETECT_ANOMALIES",
      capability: "read_metrics",
      payload:    { goalId: goal.id }
    });
  }

  if (description.includes("optimis") || description.includes("optimiz")) {
    steps.push({
      type:       "OPTIMISE_LATENCY",
      capability: "emit_optimisation_event",
      payload:    { goalId: goal.id, strategy: "auto" }
    });
  }

  if (description.includes("rebalanc")) {
    steps.push({
      type:       "REBALANCE_MODULES",
      capability: "rebalance_modules",
      payload:    { goalId: goal.id }
    });
  }

  if (description.includes("recover") || description.includes("rollback")) {
    steps.push({
      type:       "TRIGGER_RECOVERY_SCAN",
      capability: "read_logs",
      payload:    { goalId: goal.id }
    });
  }

  if (description.includes("notif") || description.includes("alert")) {
    steps.push({
      type:       "CREATE_ALERT",
      capability: "create_alert",
      payload:    { goalId: goal.id, message: goal.description, severity: "medium" }
    });
  }

  if (description.includes("forecast") || description.includes("predict")) {
    steps.push({
      type:       "UPDATE_FORECAST_STATE",
      capability: "emit_forecast_event",
      payload:    { goalId: goal.id }
    });
  }

  // Fallback: emit a generic goal event
  if (steps.length === 0) {
    steps.push({
      type:       "AGENT_GOAL_EVENT",
      capability: "emit_event",
      payload:    { goalId: goal.id, description: goal.description, agentRole: agent.role }
    });
  }

  return { steps, strict: false, goalId: goal.id };
}

// ─────────────────────────────────────────────
// AUTOPILOT HEALTH CHECK
// ─────────────────────────────────────────────

/**
 * systemAutopilot(tenantId?, agentPool?)
 * Observes key metrics and triggers the appropriate agent automatically.
 * The triggered agent then goes through the normal goal/plan/action pipeline.
 */
export function systemAutopilot(tenantId = null, agentPool = null) {
  const metrics    = collectSystemMetrics(tenantId);
  const thresholds = evaluateThresholds(metrics);
  const actions    = [];

  if (thresholds.errorRate === "critical" || metrics.errorRate > 0.2) {
    actions.push({ trigger: "recovery_agent", reason: `Error rate ${(metrics.errorRate * 100).toFixed(1)}%` });
    if (agentPool) _triggerAgent(agentPool, "recovery", "High error rate detected — run recovery scan", tenantId);
  }

  if (thresholds.latencyMs === "critical" || thresholds.latencyMs === "warn") {
    actions.push({ trigger: "optimisation_agent", reason: `Latency ${metrics.latencyMs}ms` });
    if (agentPool) _triggerAgent(agentPool, "optimisation", "Latency threshold exceeded — optimise system", tenantId);
  }

  if (isImbalanced(metrics.moduleStats)) {
    actions.push({ trigger: "optimisation_agent", reason: "Module load imbalance detected" });
    if (agentPool) _triggerAgent(agentPool, "optimisation", "Module load imbalance — rebalance modules", tenantId);
  }

  rawLog("AUTOPILOT_CYCLE", { tenantId, actions: actions.length, metrics: { errorRate: metrics.errorRate, latencyMs: metrics.latencyMs } }, "PLANNER");

  return { metrics, thresholds, actions };
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _buildPhases(metrics, thresholds, context) {
  const phases = [];

  // Phase 1: Always start with stabilisation if there are any issues
  const hasIssues = Object.values(thresholds).some((f) => f !== "ok" && f !== "unknown");
  phases.push({
    id:          PLAN_PHASES.STABILISE,
    label:       "Stabilise System",
    priority:    hasIssues ? 1 : 3,
    active:      hasIssues,
    description: "Resolve active threshold violations and error patterns",
    estimatedDays: hasIssues ? 1 : 0
  });

  // Phase 2: Optimise modules
  phases.push({
    id:          PLAN_PHASES.OPTIMISE,
    label:       "Optimise Modules",
    priority:    2,
    active:      metrics.moduleLoadScore > 40,
    description: "Rebalance event routing and reduce module load pressure",
    estimatedDays: 3
  });

  // Phase 3: Expand usage
  phases.push({
    id:          PLAN_PHASES.EXPAND,
    label:       "Expand Usage",
    priority:    3,
    active:      metrics.moduleLoadScore < 50 && metrics.errorRate < 0.05,
    description: "Conditions are stable — grow module usage and tenant capacity",
    estimatedDays: 7
  });

  // Phase 4: Latency reduction
  phases.push({
    id:          PLAN_PHASES.REDUCE_LATENCY,
    label:       "Reduce Latency",
    priority:    4,
    active:      metrics.latencyMs > METRIC_THRESHOLDS?.latencyMs?.warn || 50,
    description: "Profile and reduce p99 latency across hot paths",
    estimatedDays: 5
  });

  // Phase 5: Increase autonomy (final phase — requires stable system)
  phases.push({
    id:          PLAN_PHASES.INCREASE_AUTONOMY,
    label:       "Increase Autonomy",
    priority:    5,
    active:      false, // never auto-activates — human decision
    description: "Gradually expand agent decision scope — requires explicit approval",
    estimatedDays: 14
  });

  return phases.sort((a, b) => a.priority - b.priority);
}

function _estimateTimeline(phases, confidence) {
  const totalDays = phases.reduce((s, p) => s + (p.estimatedDays || 0), 0);
  if (confidence < 0.4) return "adaptive";  // too uncertain for a fixed timeline
  return `${Math.round(totalDays / confidence)}_days`;
}

function _buildReasoning(metrics, thresholds, phases) {
  const issues = Object.entries(thresholds)
    .filter(([, v]) => v !== "ok" && v !== "unknown")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  return issues
    ? `Active issues detected (${issues}). Plan prioritises stabilisation before growth.`
    : `System healthy. Plan focuses on optimisation and controlled expansion.`;
}

function _triggerAgent(pool, agentType, goalDescription, tenantId) {
  const agent = pool.find((a) => a.role === agentType && a.status === AGENT_STATUS.IDLE);
  if (agent) assignGoal(agent, goalDescription, PRIORITY.HIGH, { tenantId });
}

