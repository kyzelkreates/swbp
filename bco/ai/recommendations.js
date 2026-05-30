// BCO AI — Recommendation Engine (Run 5)
// Translates pattern + risk reports into actionable, ranked suggestions.
// Output is suggestions only — Rule 5: AI cannot dispatch or mutate.

// ─────────────────────────────────────────────
// RECOMMENDATION GENERATOR
// ─────────────────────────────────────────────

/**
 * generateRecommendations(patterns, riskResult)
 * @param {PatternReport} patterns   — from detectPatterns()
 * @param {{ score, severity, breakdown }} riskResult — from calculateRiskScore()
 * @returns {{ priority, category, message, confidence }[]}
 */
export function generateRecommendations(patterns, riskResult = {}) {
  const recs = [];
  const severity = riskResult.severity || "none";
  const score    = riskResult.score    || 0;

  // ── Anomaly recommendations ──────────────────
  const anomalyCount = patterns.anomalies?.length ?? 0;
  if (anomalyCount > 3) {
    recs.push({
      priority:   "high",
      category:   "anomaly",
      message:    `${anomalyCount} anomalous data points detected — investigate abnormal behaviour patterns`,
      confidence: Math.min(0.6 + anomalyCount * 0.04, 0.95)
    });
  } else if (anomalyCount > 0) {
    recs.push({
      priority:   "low",
      category:   "anomaly",
      message:    `${anomalyCount} minor anomal${anomalyCount > 1 ? "ies" : "y"} detected — monitor for escalation`,
      confidence: 0.5
    });
  }

  // ── Trend recommendations ────────────────────
  const downCount = patterns.trends?.downward?.length ?? 0;
  const upCount   = patterns.trends?.upward?.length   ?? 0;
  const trend     = patterns.trends?.overallTrend;

  if (downCount > 0 && trend === "down") {
    recs.push({
      priority:   "high",
      category:   "trend",
      message:    "Sustained downward trend detected — apply corrective optimisation strategy",
      confidence: Math.min(0.5 + downCount * 0.05, 0.9)
    });
  } else if (downCount > 0) {
    recs.push({
      priority:   "medium",
      category:   "trend",
      message:    `${downCount} downward trend window${downCount > 1 ? "s" : ""} detected — review contributing factors`,
      confidence: 0.55
    });
  }

  if (upCount > 0 && trend === "up") {
    recs.push({
      priority:   "low",
      category:   "trend",
      message:    "Positive upward trend — consider reinforcing current conditions",
      confidence: 0.6
    });
  }

  // ── Frequency / scheduling recommendations ───
  if (patterns.frequency?.isIrregular) {
    recs.push({
      priority:   "medium",
      category:   "frequency",
      message:    `Activity scheduling is irregular (CV=${patterns.frequency.coeffVariation}) — stabilise event frequency`,
      confidence: 0.65
    });
  }

  // ── Deviation recommendations ─────────────────
  const devCount = patterns.deviations?.length ?? 0;
  if (devCount > 2) {
    recs.push({
      priority:   "medium",
      category:   "deviation",
      message:    `${devCount} baseline deviations detected — review thresholds or recalibrate baseline`,
      confidence: 0.6
    });
  }

  // ── Risk-level global recommendation ─────────
  if (score >= 80) {
    recs.push({
      priority:   "critical",
      category:   "risk",
      message:    `Risk score ${score}/100 (${severity}) — immediate review required`,
      confidence: 0.9
    });
  } else if (score >= 60) {
    recs.push({
      priority:   "high",
      category:   "risk",
      message:    `Elevated risk score ${score}/100 — schedule a timely review`,
      confidence: 0.8
    });
  }

  // ── Low data warning ─────────────────────────
  if ((patterns.sampleSize ?? 0) < 5) {
    recs.push({
      priority:   "low",
      category:   "data_quality",
      message:    `Only ${patterns.sampleSize} records available — insights have low statistical confidence`,
      confidence: 0.4
    });
  }

  // Sort: critical → high → medium → low
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => (ORDER[a.priority] ?? 4) - (ORDER[b.priority] ?? 4));

  return recs;
}

// ─────────────────────────────────────────────
// OPTIMISATION PLAN
// ─────────────────────────────────────────────

/**
 * generateOptimisationPlan(insights)
 * Maps per-module insight reports into a unified optimisation plan.
 * Output is suggestions only — no actions dispatched.
 *
 * @param {InsightReport[]} insights — array from generateInsights()
 * @returns {{ module, priority, actions: { type, suggestion }[] }[]}
 */
export function generateOptimisationPlan(insights) {
  return insights
    .filter((ins) => ins.recommendations?.length > 0)
    .map((ins) => ({
      module:   ins.module,
      priority: ins.riskResult?.severity || "none",
      actions:  ins.recommendations.map((r) => ({
        type:       "OPTIMISE",
        suggestion: r.message,
        confidence: r.confidence,
        category:   r.category
      }))
    }))
    .sort((a, b) => {
      const ORDER = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (ORDER[a.priority] ?? 5) - (ORDER[b.priority] ?? 5);
    });
}
