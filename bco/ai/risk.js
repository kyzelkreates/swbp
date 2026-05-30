// BCO AI — Risk Scoring System (Run 5)
// Converts a pattern report into a numeric risk score and severity band.
// Pure function — no side effects, no storage writes.

// ─────────────────────────────────────────────
// RISK SCORE WEIGHTS
// ─────────────────────────────────────────────

const WEIGHTS = {
  anomalyBase:        40,   // +40 if anomalies > 3
  anomalyEach:         5,   // +5 per anomaly beyond 3 (capped)
  deviationBase:      30,   // +30 if deviations > 2
  deviationEach:       4,   // +4 per deviation beyond 2 (capped)
  downwardTrend:      20,   // +20 for any downward trend windows
  highFreqIrregular:  10,   // +10 if frequency is irregular
  lowSamplePenalty:   10    // +10 if sample size < 5 (low confidence)
};

// ─────────────────────────────────────────────
// RISK SCORE CALCULATOR
// ─────────────────────────────────────────────

/**
 * calculateRiskScore(patterns)
 * @param {PatternReport} patterns — output of detectPatterns()
 * @returns {{ score: number, severity: string, breakdown: object }}
 */
export function calculateRiskScore(patterns) {
  let score = 0;
  const breakdown = {};

  // Anomalies
  const anomalyCount = patterns.anomalies?.length ?? 0;
  if (anomalyCount > 3) {
    const pts = WEIGHTS.anomalyBase + Math.min((anomalyCount - 3) * WEIGHTS.anomalyEach, 20);
    score += pts;
    breakdown.anomalies = pts;
  }

  // Baseline deviations
  const devCount = patterns.deviations?.length ?? 0;
  if (devCount > 2) {
    const pts = WEIGHTS.deviationBase + Math.min((devCount - 2) * WEIGHTS.deviationEach, 16);
    score += pts;
    breakdown.deviations = pts;
  }

  // Downward trends
  const downCount = patterns.trends?.downward?.length ?? 0;
  if (downCount > 0) {
    score += WEIGHTS.downwardTrend;
    breakdown.downwardTrend = WEIGHTS.downwardTrend;
  }

  // Irregular frequency
  if (patterns.frequency?.isIrregular) {
    score += WEIGHTS.highFreqIrregular;
    breakdown.irregularFrequency = WEIGHTS.highFreqIrregular;
  }

  // Low sample size
  const sampleSize = patterns.sampleSize ?? 0;
  if (sampleSize > 0 && sampleSize < 5) {
    score += WEIGHTS.lowSamplePenalty;
    breakdown.lowSamplePenalty = WEIGHTS.lowSamplePenalty;
  }

  score = Math.min(Math.round(score), 100);

  return {
    score,
    severity: _severityBand(score),
    breakdown
  };
}

// ─────────────────────────────────────────────
// SEVERITY BANDS
// ─────────────────────────────────────────────

/**
 * _severityBand(score)
 * Maps numeric risk score to a human-readable severity label.
 */
function _severityBand(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "none";
}

export { _severityBand as severityBand };
