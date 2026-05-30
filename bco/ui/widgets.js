// BCO Widget Engine — Run 4
// Renders UI blocks injected by modules (Run 3 §9).
// Returns DOM elements — framework-agnostic (plain JS).
// Run 5 can swap renderX() internals for React/Vue components
// without changing the dispatch contract.

import { getModuleEntities } from "../core/modules.js";

// ─────────────────────────────────────────────
// WIDGET TYPES
// ─────────────────────────────────────────────

export const WIDGET_TYPES = ["chart", "list", "map", "timeline", "card", "alert_feed"];

// ─────────────────────────────────────────────
// RENDER DISPATCHER
// ─────────────────────────────────────────────

/**
 * renderWidget(widget, moduleName)
 * Dispatches to the correct renderer based on widget.type.
 * Returns an HTMLElement.
 *
 * @param {{ id, type, dataSource, config, permissions }} widget
 * @param {string} moduleName  — used to scope entity reads
 * @param {string} userRole    — checked against widget.permissions
 */
export function renderWidget(widget, moduleName, userRole = "viewer") {
  // Permission gate
  if (widget.permissions && !widget.permissions.includes(userRole)) {
    return _el("div", { class: "bco-widget bco-widget--blocked" },
      "You do not have permission to view this widget.");
  }

  const data = getModuleEntities(moduleName, widget.dataSource);

  switch (widget.type) {
    case "chart":      return renderChart(widget, data);
    case "list":       return renderList(widget, data);
    case "timeline":   return renderTimeline(widget, data);
    case "card":       return renderCard(widget, data);
    case "alert_feed": return renderAlertFeed(widget, data);
    case "map":        return renderMap(widget, data);
    default:           return renderDefault(widget, data);
  }
}

// ─────────────────────────────────────────────
// INDIVIDUAL RENDERERS
// ─────────────────────────────────────────────

export function renderChart(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--chart", "data-id": widget.id });
  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
      <span class="bco-widget__count">${data.length} records</span>
    </div>
    <div class="bco-widget__body bco-chart-placeholder">
      <!-- Run 5: inject chart library (Chart.js / Recharts) -->
      <canvas class="bco-chart-canvas" data-source="${widget.dataSource}"></canvas>
    </div>`;
  return el;
}

export function renderList(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--list", "data-id": widget.id });
  const rows = data.slice(0, 10).map(item =>
    `<li class="bco-list__row">${_summariseRecord(item)}</li>`
  ).join("") || `<li class="bco-list__empty">No data yet.</li>`;

  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
    </div>
    <ul class="bco-widget__body bco-list">${rows}</ul>`;
  return el;
}

export function renderTimeline(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--timeline", "data-id": widget.id });
  const sorted = [...data].sort((a, b) =>
    new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0)
  );
  const items = sorted.slice(0, 8).map(item =>
    `<div class="bco-timeline__item">
       <span class="bco-timeline__dot"></span>
       <span class="bco-timeline__text">${_summariseRecord(item)}</span>
       <span class="bco-timeline__ts">${_formatTs(item.timestamp || item.created_at)}</span>
     </div>`
  ).join("") || `<div class="bco-timeline__empty">No events yet.</div>`;

  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
    </div>
    <div class="bco-widget__body bco-timeline">${items}</div>`;
  return el;
}

export function renderCard(widget, data) {
  const latest = data[data.length - 1] || {};
  const el = _el("div", { class: "bco-widget bco-widget--card", "data-id": widget.id });
  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
    </div>
    <div class="bco-widget__body bco-card">
      ${Object.entries(latest).slice(0, 5).map(([k, v]) =>
        `<div class="bco-card__row">
           <span class="bco-card__key">${k}</span>
           <span class="bco-card__val">${v}</span>
         </div>`).join("") || `<span class="bco-card__empty">No data.</span>`}
    </div>`;
  return el;
}

export function renderAlertFeed(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--alert-feed", "data-id": widget.id });
  const items = data.slice(-5).reverse().map(alert =>
    `<div class="bco-alert bco-alert--${alert.severity || "info"}">
       <span class="bco-alert__icon">${_severityIcon(alert.severity)}</span>
       <span class="bco-alert__msg">${alert.message}</span>
       <span class="bco-alert__ts">${_formatTs(alert.timestamp)}</span>
     </div>`
  ).join("") || `<div class="bco-alert--empty">No alerts.</div>`;

  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
    </div>
    <div class="bco-widget__body">${items}</div>`;
  return el;
}

export function renderMap(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--map", "data-id": widget.id });
  el.innerHTML = `
    <div class="bco-widget__header">
      <span class="bco-widget__title">${_label(widget)}</span>
    </div>
    <div class="bco-widget__body bco-map-placeholder">
      <!-- Run 5: inject map library (Leaflet / Mapbox) -->
      <div class="bco-map-canvas" data-source="${widget.dataSource}" data-count="${data.length}"></div>
    </div>`;
  return el;
}

export function renderDefault(widget, data) {
  const el = _el("div", { class: "bco-widget bco-widget--unknown", "data-id": widget.id });
  el.innerHTML = `<div class="bco-widget__body">Unknown widget type: "${widget.type}"</div>`;
  return el;
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _el(tag, attrs = {}, text = "") {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text) el.textContent = text;
  return el;
}

function _label(widget) {
  return widget.config?.title
    || widget.dataSource?.replace(/_/g, " ")
    || widget.type;
}

function _summariseRecord(item) {
  const keys = Object.keys(item).filter(k => !["id", "created_at", "updated_at"].includes(k));
  return keys.slice(0, 3).map(k => `${k}: ${item[k]}`).join(" · ");
}

function _formatTs(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

function _severityIcon(severity) {
  return { info: "ℹ️", warning: "⚠️", error: "🔴", critical: "🚨" }[severity] || "ℹ️";
}
