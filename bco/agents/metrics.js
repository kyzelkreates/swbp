// BCO Agents — System Metrics Engine (Run 9)
// Collects real observable signals from the live BCO system:
// event queue depth, log error rate, module load, storage size, memory.
// Returns structured metrics consumed by the Monitoring and Optimisation agents.

import { StorageAdapter } from "../core/storage-adapter.js";
import { rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// METRICS SNAPSHOT
// ─────────────────────────────────────────────

/**
 * collectSystemMetrics(tenantId?)
 * Builds a full system metrics snapshot from observable signals.
 *
 * @typedef {Object} SystemMetrics
 * @property {number}   latencyMs         — estimated action round-trip
 * @property {number}   errorRate         — 0–1 fraction of recent log entries that are errors
 * @property {number}   eventBacklog      — queued events not yet processed
 * @property {number}   moduleLoadScore   — 0–100 composite module pressure score
 * @property {number}   storageSizeKb     — total storage footprint in KB
 * @property {number}   memoryUsageMb     — JS heap size (browser only, else -1)
 * @property {number}   activeAgents      — agents currently in RUNNING status
 * @property {object}   moduleStats       — per-module event count
 * @property {string}   collectedAt
 */
export function collectSystemMetrics(tenantId = null) {
  const start = Date.now();

  const allKeys    = StorageAdapter.keys();
  const scopedKeys = tenantId
    ? allKeys.filter((k) => k.startsWith(`t:${tenantId}:`))
    : allKeys;

  const logs         = _readLogs(tenantId);
  const errorRate    = _calculateErrorRate(logs);
  const eventBacklog = _measureEventBacklog(tenantId);
  const moduleStats  = _measureModuleLoad(scopedKeys);
  const storageSizeKb= _measureStorageSize(scopedKeys);
  const memoryUsageMb= _measureMemory();
  const latencyMs    = Date.now() - start; // proxy: time to collect = system responsiveness

  const metrics = {
    latencyMs,
    errorRate,
    eventBacklog,
    moduleLoadScore: _compositeLoadScore(moduleStats, eventBacklog, errorRate),
    storageSizeKb,
    memoryUsageMb,
    activeAgents:    0, // populated by agent-monitor
    moduleStats,
    tenantId,
    collectedAt:     new Date().toISOString()
  };

  rawLog("METRICS_COLLECTED", { latencyMs, errorRate, eventBacklog }, "METRICS");
  return metrics;
}

// ─────────────────────────────────────────────
// INDIVIDUAL METRIC COLLECTORS
// ─────────────────────────────────────────────

export function measureLatency() {
  const start = Date.now();
  StorageAdapter.get("bco_ping");
  return Date.now() - start;
}

export function measureErrors(tenantId = null) {
  return _calculateErrorRate(_readLogs(tenantId));
}

export function measureModulePerformance(tenantId = null) {
  const keys = tenantId
    ? StorageAdapter.keys().filter((k) => k.startsWith(`t:${tenantId}:`))
    : StorageAdapter.keys();
  return _measureModuleLoad(keys);
}

export function measureEventQueue(tenantId = null) {
  return _measureEventBacklog(tenantId);
}

export function measureMemory() {
  return _measureMemory();
}

// ─────────────────────────────────────────────
// THRESHOLD DEFINITIONS
// ─────────────────────────────────────────────

export const METRIC_THRESHOLDS = {
  latencyMs:        { warn: 50,  critical: 200  },
  errorRate:        { warn: 0.1, critical: 0.2  },
  eventBacklog:     { warn: 50,  critical: 200  },
  moduleLoadScore:  { warn: 60,  critical: 85   },
  storageSizeKb:    { warn: 1024, critical: 4096 },
  memoryUsageMb:    { warn: 100, critical: 250  }
};

/**
 * evaluateThresholds(metrics)
 * Returns per-metric severity flags.
 */
export function evaluateThresholds(metrics) {
  const flags = {};
  for (const [key, thresholds] of Object.entries(METRIC_THRESHOLDS)) {
    const val = metrics[key];
    if (val === undefined || val < 0) { flags[key] = "unknown"; continue; }
    if (val >= thresholds.critical)  flags[key] = "critical";
    else if (val >= thresholds.warn) flags[key] = "warn";
    else                             flags[key] = "ok";
  }
  return flags;
}

/**
 * isImbalanced(moduleStats)
 * Returns true if any single module handles >60% of total events.
 */
export function isImbalanced(moduleStats) {
  const totals = Object.values(moduleStats);
  if (totals.length < 2) return false;
  const total = totals.reduce((s, v) => s + v, 0);
  if (total === 0) return false;
  return Math.max(...totals) / total > 0.6;
}

// ─────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────

function _readLogs(tenantId) {
  const key  = tenantId ? `t:${tenantId}:bco_logs` : "bco_logs";
  return StorageAdapter.get(key) || [];
}

function _calculateErrorRate(logs) {
  if (!logs.length) return 0;
  const recent = logs.slice(-100); // last 100 log entries
  const errors = recent.filter((l) => l?.level === "ERROR" || l?.type?.includes("ERROR")).length;
  return parseFloat((errors / recent.length).toFixed(3));
}

function _measureEventBacklog(tenantId) {
  const key    = tenantId ? `t:${tenantId}:bco_events` : "bco_events";
  const events = StorageAdapter.get(key) || [];
  return events.filter((e) => e?.status === "pending" || !e?.status).length;
}

function _measureModuleLoad(keys) {
  const stats = {};
  keys
    .filter((k) => k.includes("bco_events") || k.includes("bco_actions"))
    .forEach((k) => {
      const data = StorageAdapter.get(k) || [];
      (Array.isArray(data) ? data : []).forEach((entry) => {
        const mod = entry?.module || "CORE";
        stats[mod] = (stats[mod] || 0) + 1;
      });
    });
  return stats;
}

function _measureStorageSize(keys) {
  let bytes = 0;
  keys.forEach((k) => {
    try {
      const raw = typeof localStorage !== "undefined"
        ? localStorage.getItem(k)
        : JSON.stringify(StorageAdapter.get(k));
      bytes += (raw?.length || 0) * 2; // UTF-16: 2 bytes per char
    } catch { /* skip */ }
  });
  return parseFloat((bytes / 1024).toFixed(2));
}

function _measureMemory() {
  if (typeof performance !== "undefined" && performance.memory) {
    return parseFloat((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2));
  }
  return -1; // unavailable (Node or no API)
}

function _compositeLoadScore(moduleStats, backlog, errorRate) {
  const modules     = Object.values(moduleStats);
  const totalEvents = modules.reduce((s, v) => s + v, 0);
  const eventScore  = Math.min(totalEvents / 500, 1) * 40;   // 0–40 pts
  const backlogScore= Math.min(backlog / 200, 1) * 30;        // 0–30 pts
  const errorScore  = Math.min(errorRate / 0.2, 1) * 30;      // 0–30 pts
  return Math.round(eventScore + backlogScore + errorScore);
}
