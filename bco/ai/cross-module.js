// BCO AI — Cross-Module Analytics Engine (Run 5)
// Compares and correlates data across all registered modules.
// Read-only. No state mutation. Rule 5.

import { pearsonCorrelation, mean } from "./stats.js";
import { moduleRegistry, getModuleEntities } from "../core/modules.js";

// ─────────────────────────────────────────────
// CROSS-MODULE ANALYSIS ENTRY POINT
// ─────────────────────────────────────────────

/**
 * crossModuleAnalysis(valueField?)
 * Reads all module entity data, runs pairwise Pearson correlation.
 * @returns {{ correlations, summary }}
 */
export function crossModuleAnalysis(valueField = "value") {
  const modules = moduleRegistry.getAll();

  // Gather data: for each module, collect values from all its entities
  const moduleData = modules.map((m) => {
    const allValues = m.entities.flatMap((entityKey) => {
      const records = getModuleEntities(m.name, entityKey);
      return records
        .map((r) => Number(r[valueField]))
        .filter((v) => !isNaN(v));
    });

    return { name: m.name, values: allValues };
  });

  const correlations = analyseCrossCorrelation(moduleData);

  return {
    correlations,
    summary: _correlationSummary(correlations),
    modulesAnalysed: moduleData.map((m) => ({
      name:        m.name,
      dataPoints:  m.values.length,
      hasData:     m.values.length > 0
    }))
  };
}

// ─────────────────────────────────────────────
// PAIRWISE CORRELATION
// ─────────────────────────────────────────────

/**
 * analyseCrossCorrelation(modules)
 * @param {{ name, values }[]} modules
 * @returns {{ pair, correlation, strength, direction }[]}
 */
export function analyseCrossCorrelation(modules) {
  const correlations = [];

  for (let i = 0; i < modules.length; i++) {
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i];
      const b = modules[j];

      // Align lengths (use shorter array length)
      const len = Math.min(a.values.length, b.values.length);
      const r   = len >= 2
        ? pearsonCorrelation(a.values.slice(0, len), b.values.slice(0, len))
        : null;

      correlations.push({
        pair:        [a.name, b.name],
        correlation: r !== null ? parseFloat(r.toFixed(4)) : null,
        strength:    r !== null ? _strengthLabel(Math.abs(r)) : "insufficient_data",
        direction:   r !== null ? (r >= 0 ? "positive" : "negative") : null,
        dataPairSize: len
      });
    }
  }

  return correlations;
}

// ─────────────────────────────────────────────
// CALCULATE CORRELATION (public alias)
// ─────────────────────────────────────────────

export function calculateCorrelation(valuesA, valuesB) {
  const len = Math.min(valuesA?.length ?? 0, valuesB?.length ?? 0);
  if (len < 2) return null;
  return pearsonCorrelation(valuesA.slice(0, len), valuesB.slice(0, len));
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _strengthLabel(absR) {
  if (absR >= 0.8)  return "strong";
  if (absR >= 0.5)  return "moderate";
  if (absR >= 0.2)  return "weak";
  return "negligible";
}

function _correlationSummary(correlations) {
  const withData = correlations.filter((c) => c.correlation !== null);
  if (!withData.length) return { total: correlations.length, analysed: 0 };

  const strong   = withData.filter((c) => c.strength === "strong");
  const moderate = withData.filter((c) => c.strength === "moderate");

  return {
    total:          correlations.length,
    analysed:       withData.length,
    strongPairs:    strong.map((c) => c.pair),
    moderatePairs:  moderate.map((c) => c.pair),
    topCorrelation: withData.sort((a, b) =>
      Math.abs(b.correlation) - Math.abs(a.correlation)
    )[0] || null
  };
}
