// BCO AI — Stats Primitives (Run 5)
// Pure maths utilities used by pattern detection, risk, forecasting.
// No side effects. No imports. Fully portable.

// ─────────────────────────────────────────────
// DESCRIPTIVE STATS
// ─────────────────────────────────────────────

export function mean(values) {
  if (!values?.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values) {
  if (!values?.length) return 0;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

export function stddev(values) {
  return Math.sqrt(variance(values));
}

export function median(values) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─────────────────────────────────────────────
// TREND DETECTION (linear slope sign)
// ─────────────────────────────────────────────

/**
 * linearSlope(values)
 * Returns the slope of the best-fit line through [0..n-1, values].
 * Positive = upward, negative = downward, ~0 = stable.
 */
export function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

export function trendLabel(values, threshold = 0.05) {
  const slope = linearSlope(values);
  if (slope > threshold)  return "up";
  if (slope < -threshold) return "down";
  return "stable";
}

// ─────────────────────────────────────────────
// PEARSON CORRELATION
// ─────────────────────────────────────────────

/**
 * pearsonCorrelation(xs, ys)
 * Returns r ∈ [-1, 1]. Requires equal-length arrays.
 * Returns null if insufficient data.
 */
export function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0);
  if (n < 2) return null;
  const ax = xs.slice(0, n), ay = ys.slice(0, n);
  const mx = mean(ax), my = mean(ay);
  const num = ax.reduce((s, x, i) => s + (x - mx) * (ay[i] - my), 0);
  const den = Math.sqrt(
    ax.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ay.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? null : num / den;
}

// ─────────────────────────────────────────────
// FREQUENCY ANALYSIS
// ─────────────────────────────────────────────

/**
 * analyseFrequency(timestamps)
 * Given an array of ISO timestamp strings, returns interval stats.
 */
export function analyseFrequency(timestamps) {
  if (!timestamps?.length || timestamps.length < 2) {
    return { count: timestamps?.length ?? 0, avgIntervalMs: null, isIrregular: false };
  }

  const sorted = [...timestamps]
    .map((t) => new Date(t).getTime())
    .filter(Boolean)
    .sort((a, b) => a - b);

  const intervals = sorted.slice(1).map((t, i) => t - sorted[i]);
  const avg = mean(intervals);
  const sd  = stddev(intervals);
  const cv  = avg > 0 ? sd / avg : 0;   // coefficient of variation

  return {
    count:         sorted.length,
    avgIntervalMs: Math.round(avg),
    stddevMs:      Math.round(sd),
    coeffVariation: parseFloat(cv.toFixed(3)),
    isIrregular:   cv > 0.5            // >50% CV = irregular
  };
}

// ─────────────────────────────────────────────
// SIMPLE NEXT-VALUE FORECAST
// ─────────────────────────────────────────────

/**
 * forecastNextValue(values)
 * Linear extrapolation: projects one step beyond the last value.
 */
export function forecastNextValue(values) {
  if (!values?.length) return null;
  if (values.length === 1) return values[0];
  const slope = linearSlope(values);
  return values[values.length - 1] + slope;
}

/**
 * assessConfidence(values)
 * Returns a 0–1 confidence score based on sample size and variance stability.
 */
export function assessConfidence(values) {
  if (!values?.length) return 0;
  const sizeScore    = Math.min(values.length / 30, 1);        // saturates at 30 points
  const cv           = mean(values) > 0 ? stddev(values) / mean(values) : 1;
  const stabilityScore = Math.max(0, 1 - cv);
  return parseFloat(((sizeScore * 0.5 + stabilityScore * 0.5)).toFixed(3));
}
