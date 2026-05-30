// BCO AI — Pattern Detection Engine (Run 5)
// Stateless analysis layer. Input: array of records. Output: pattern report.
// No storage writes. No action dispatch. AI reads only — Rule 5 enforced.

import {
  mean, stddev, trendLabel, analyseFrequency, linearSlope
} from "./stats.js";

// ─────────────────────────────────────────────
// MASTER PATTERN DETECTOR
// ─────────────────────────────────────────────

/**
 * detectPatterns(records, valueField?, timestampField?)
 * Runs all sub-detectors and returns a unified pattern report.
 *
 * @param {object[]} records          — array of entity records
 * @param {string}   valueField       — numeric field to analyse (default: "value")
 * @param {string}   timestampField   — datetime field (default: "timestamp")
 * @returns {PatternReport}
 */
export function detectPatterns(records, valueField = "value", timestampField = "timestamp") {
  const values     = _extractNumbers(records, valueField);
  const timestamps = _extractTimestamps(records, timestampField);

  return {
    sampleSize:  records.length,
    frequency:   analyseFrequency(timestamps),
    anomalies:   detectAnomalies(records, valueField),
    trends:      detectTrends(records, valueField),
    deviations:  detectDeviationFromBaseline(values),
    summary:     _summarise(values)
  };
}

// ─────────────────────────────────────────────
// ANOMALY DETECTION
// ─────────────────────────────────────────────

/**
 * detectAnomalies(records, valueField)
 * Flags records whose value is more than 2σ from the mean (z-score method).
 * Falls back to ±50% of mean if σ = 0 (constant dataset).
 *
 * @returns {{ record, value, zScore, reason }[]}
 */
export function detectAnomalies(records, valueField = "value") {
  const values = _extractNumbers(records, valueField);
  if (values.length < 3) return [];

  const m  = mean(values);
  const sd = stddev(values);

  return records
    .map((rec, i) => {
      const val = Number(rec[valueField]);
      if (isNaN(val)) return null;

      const zScore = sd > 0 ? (val - m) / sd : 0;
      const isFallbackAnomaly = sd === 0 && (val > m * 1.5 || val < m * 0.5);
      const isZAnomaly        = Math.abs(zScore) > 2;

      if (!isZAnomaly && !isFallbackAnomaly) return null;

      return {
        index:    i,
        record:   rec,
        value:    val,
        mean:     parseFloat(m.toFixed(4)),
        stddev:   parseFloat(sd.toFixed(4)),
        zScore:   parseFloat(zScore.toFixed(3)),
        reason:   isZAnomaly
          ? `Value deviates ${Math.abs(zScore).toFixed(1)}σ from mean`
          : "Value outside ±50% of mean (zero-variance dataset)"
      };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────
// TREND ANALYSIS
// ─────────────────────────────────────────────

/**
 * detectTrends(records, valueField)
 * Splits records into upward / downward / stable segments
 * using a rolling window of 3 consecutive values.
 *
 * @returns {{ upward, downward, stable, overallTrend, slope }}
 */
export function detectTrends(records, valueField = "value") {
  const values = _extractNumbers(records, valueField);

  if (values.length < 2) {
    return { upward: [], downward: [], stable: [], overallTrend: "stable", slope: 0 };
  }

  const upward   = [];
  const downward = [];
  const stable   = [];
  const WINDOW   = 3;

  for (let i = 0; i <= values.length - WINDOW; i++) {
    const window = values.slice(i, i + WINDOW);
    const label  = trendLabel(window);
    const entry  = { startIndex: i, window, trend: label };

    if (label === "up")     upward.push(entry);
    else if (label === "down") downward.push(entry);
    else                    stable.push(entry);
  }

  const overallSlope = linearSlope(values);
  const overallTrend = trendLabel(values);

  return { upward, downward, stable, overallTrend, slope: parseFloat(overallSlope.toFixed(4)) };
}

// ─────────────────────────────────────────────
// BASELINE DEVIATION
// ─────────────────────────────────────────────

/**
 * detectDeviationFromBaseline(values, windowSize?)
 * Compares each value against a rolling baseline (moving average).
 * Returns entries where deviation exceeds 25% of the baseline.
 *
 * @returns {{ index, value, baseline, deviationPct }[]}
 */
export function detectDeviationFromBaseline(values, windowSize = 5) {
  if (!values?.length || values.length < windowSize) return [];

  const deviations = [];

  for (let i = windowSize; i < values.length; i++) {
    const window    = values.slice(i - windowSize, i);
    const baseline  = mean(window);
    const val       = values[i];
    const deviationPct = baseline !== 0
      ? Math.abs((val - baseline) / baseline) * 100
      : 0;

    if (deviationPct > 25) {
      deviations.push({
        index:        i,
        value:        val,
        baseline:     parseFloat(baseline.toFixed(4)),
        deviationPct: parseFloat(deviationPct.toFixed(2))
      });
    }
  }

  return deviations;
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _extractNumbers(records, field) {
  return (records || [])
    .map((r) => Number(r[field]))
    .filter((v) => !isNaN(v));
}

function _extractTimestamps(records, field) {
  return (records || [])
    .map((r) => r[field])
    .filter(Boolean);
}

function _summarise(values) {
  if (!values.length) return null;
  const m  = mean(values);
  const sd = stddev(values);
  return {
    count:  values.length,
    mean:   parseFloat(m.toFixed(4)),
    stddev: parseFloat(sd.toFixed(4)),
    min:    Math.min(...values),
    max:    Math.max(...values)
  };
}
