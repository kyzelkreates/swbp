// BCO AI — Behaviour Forecasting Engine (Run 5)
// Linear + frequency-based forecasting layer.
// Read-only. Suggestions only. Rule 5 enforced.

import {
  mean, stddev, linearSlope, forecastNextValue, assessConfidence, analyseFrequency
} from "./stats.js";

// ─────────────────────────────────────────────
// BEHAVIOUR FORECASTING
// ─────────────────────────────────────────────

/**
 * forecastBehaviour(records, valueField?, timestampField?)
 * @returns {ForecastReport}
 */
export function forecastBehaviour(records, valueField = "value", timestampField = "timestamp") {
  const values     = _nums(records, valueField);
  const timestamps = _ts(records, timestampField);

  const nextValue   = forecastNextValue(values);
  const confidence  = assessConfidence(values);
  const probability = _calculateProbability(values);
  const nextTs      = _forecastNextTimestamp(timestamps);
  const slope       = linearSlope(values);
  const direction   = slope > 0.05 ? "increasing" : slope < -0.05 ? "decreasing" : "stable";

  return {
    nextState: {
      value:         nextValue !== null ? parseFloat(nextValue.toFixed(4)) : null,
      timestamp:     nextTs,
      direction,
      slope:         parseFloat(slope.toFixed(4))
    },
    probability,
    confidence,
    basedOnSamples: values.length
  };
}

// ─────────────────────────────────────────────
// PROBABILITY ESTIMATION
// ─────────────────────────────────────────────

/**
 * _calculateProbability(values)
 * Returns P(next value > current mean) using a simple normal distribution approximation.
 * Bounded to [0.05, 0.95] — never returns certainty.
 */
function _calculateProbability(values) {
  if (values.length < 3) return 0.5;

  const m   = mean(values);
  const sd  = stddev(values);
  const next = forecastNextValue(values);

  if (sd === 0 || next === null) return 0.5;

  // z-score of predicted next value relative to distribution
  const z = (next - m) / sd;

  // Approximate Φ(z) with logistic sigmoid
  const prob = 1 / (1 + Math.exp(-0.7065 * z));

  return parseFloat(Math.min(Math.max(prob, 0.05), 0.95).toFixed(3));
}

// ─────────────────────────────────────────────
// NEXT TIMESTAMP FORECAST
// ─────────────────────────────────────────────

/**
 * _forecastNextTimestamp(timestamps)
 * Extrapolates the next expected event time based on average interval.
 */
function _forecastNextTimestamp(timestamps) {
  if (!timestamps?.length || timestamps.length < 2) return null;

  const freq = analyseFrequency(timestamps);
  if (!freq.avgIntervalMs) return null;

  const lastTs = Math.max(
    ...timestamps.map((t) => new Date(t).getTime()).filter(Boolean)
  );
  return new Date(lastTs + freq.avgIntervalMs).toISOString();
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _nums(records, field) {
  return (records || []).map((r) => Number(r[field])).filter((v) => !isNaN(v));
}

function _ts(records, field) {
  return (records || []).map((r) => r[field]).filter(Boolean);
}
