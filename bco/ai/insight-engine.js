// BCO AI — Insight Engine (Run 5)
// Master orchestrator. Coordinates all AI sub-systems per module
// and assembles the standardised InsightReport output.
// Rule 5: read-only. All output is suggestions. Nothing is dispatched here.

import { moduleRegistry, getModuleEntities } from "../core/modules.js";
import { rawLog } from "../core/storage.js";
import { detectPatterns } from "./patterns.js";
import { calculateRiskScore } from "./risk.js";
import { generateRecommendations, generateOptimisationPlan } from "./recommendations.js";
import { forecastBehaviour } from "./forecast.js";
import { crossModuleAnalysis } from "./cross-module.js";

// ─────────────────────────────────────────────
// PER-MODULE INSIGHT GENERATOR
// ─────────────────────────────────────────────

/**
 * generateInsights(options?)
 * Runs the full AI pipeline across all registered modules.
 *
 * @param {{ valueField?, timestampField?, includeForecasts? }} options
 * @returns {InsightReport[]}
 *
 * InsightReport shape (Run 5 §14 contract):
 * {
 *   module, riskScore, riskResult, insights,
 *   anomalies, trends, correlations, recommendations, forecast
 * }
 */
export function generateInsights({
  valueField     = "value",
  timestampField = "timestamp",
  includeForecasts = true
} = {}) {
  const modules  = moduleRegistry.getAll();
  const reports  = [];

  modules.forEach((module) => {
    // Collect all records across every entity the module owns
    const allRecords = module.entities.flatMap((entityKey) =>
      getModuleEntities(module.name, entityKey)
    );

    if (allRecords.length === 0) {
      reports.push(_emptyReport(module.name));
      return;
    }

    const patterns        = detectPatterns(allRecords, valueField, timestampField);
    const riskResult      = calculateRiskScore(patterns);
    const recommendations = generateRecommendations(patterns, riskResult);
    const forecast        = includeForecasts
      ? forecastBehaviour(allRecords, valueField, timestampField)
      : null;

    reports.push({
      module:          module.name,
      recordCount:     allRecords.length,
      riskScore:       riskResult.score,
      riskResult,
      // Run 5 §14 standardised output
      insights:        _buildInsightSummary(patterns, riskResult),
      anomalies:       patterns.anomalies,
      trends:          patterns.trends,
      correlations:    [],   // populated by crossModuleAnalysis() below
      recommendations,
      forecast:        forecast || {}
    });
  });

  rawLog("AI_INSIGHTS_GENERATED", {
    modules:      reports.map((r) => r.module),
    highRisk:     reports.filter((r) => r.riskScore >= 60).map((r) => r.module),
    timestamp:    new Date().toISOString()
  }, "AI");

  return reports;
}

// ─────────────────────────────────────────────
// FULL ANALYSIS (insights + cross-module + plan)
// ─────────────────────────────────────────────

/**
 * runFullAnalysis(options?)
 * Convenience wrapper: per-module insights + cross-module correlations + optimisation plan.
 *
 * @returns {{ insights, crossModule, optimisationPlan, generatedAt }}
 */
export function runFullAnalysis(options = {}) {
  const insights      = generateInsights(options);
  const crossModule   = crossModuleAnalysis(options.valueField);

  // Inject correlations back into each insight report
  crossModule.correlations.forEach((corr) => {
    corr.pair.forEach((moduleName) => {
      const report = insights.find((r) => r.module === moduleName);
      if (report) report.correlations.push(corr);
    });
  });

  const optimisationPlan = generateOptimisationPlan(insights);

  rawLog("AI_FULL_ANALYSIS_RUN", {
    modulesAnalysed:   insights.length,
    correlationPairs:  crossModule.correlations.length,
    planActions:       optimisationPlan.reduce((s, p) => s + p.actions.length, 0)
  }, "AI");

  return {
    insights,
    crossModule,
    optimisationPlan,
    generatedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// SINGLE-EVENT INSIGHT (lightweight)
// ─────────────────────────────────────────────

/**
 * insightFromEvent(event)
 * Analyses the module referenced by an event.
 * Used by the action engine or UI right panel on live events.
 * Returns null if the module has no data.
 */
export function insightFromEvent(event) {
  const module = moduleRegistry.get(event.module);
  if (!module) return null;

  const allRecords = module.entities.flatMap((entityKey) =>
    getModuleEntities(module.name, entityKey)
  );
  if (!allRecords.length) return null;

  const patterns        = detectPatterns(allRecords);
  const riskResult      = calculateRiskScore(patterns);
  const recommendations = generateRecommendations(patterns, riskResult);

  return {
    module:          module.name,
    triggeredBy:     event.id,
    riskScore:       riskResult.score,
    riskResult,
    anomalies:       patterns.anomalies,
    trends:          patterns.trends,
    recommendations
  };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _buildInsightSummary(patterns, riskResult) {
  const items = [];

  if (patterns.summary) {
    items.push({
      type:    "data_summary",
      message: `${patterns.sampleSize} records · mean ${patterns.summary.mean} · σ ${patterns.summary.stddev}`
    });
  }

  if (riskResult.score > 0) {
    items.push({
      type:    "risk",
      message: `Risk: ${riskResult.score}/100 (${riskResult.severity})`
    });
  }

  if (patterns.trends?.overallTrend) {
    items.push({
      type:    "trend",
      message: `Overall trend: ${patterns.trends.overallTrend} (slope ${patterns.trends.slope})`
    });
  }

  return items;
}

function _emptyReport(moduleName) {
  return {
    module:          moduleName,
    recordCount:     0,
    riskScore:       0,
    riskResult:      { score: 0, severity: "none", breakdown: {} },
    insights:        [{ type: "data_quality", message: "No data available for analysis" }],
    anomalies:       [],
    trends:          {},
    correlations:    [],
    recommendations: [{ priority: "low", category: "data_quality", message: "Add data to this module to enable AI insights", confidence: 1 }],
    forecast:        {}
  };
}
