// BCO Dashboard Engine — Run 4
// Composes the three-panel UI from registered modules and user role.
// Returns structured render data — framework-agnostic.
// Rule 7: UI reads state, never mutates it directly.

import { moduleRegistry, getModuleUI } from "../core/modules.js";
import { storage, SSOT_KEYS } from "../core/storage.js";
import { renderWidget } from "./widgets.js";
import { applyBranding, getBrandConfig } from "../brand/brand-engine.js";
import { getUnreadCount } from "./notifications.js";

// ─────────────────────────────────────────────
// CORE DASHBOARD ENGINE
// ─────────────────────────────────────────────

/**
 * renderDashboard(userRole)
 * Returns structured module-widget map for the centre panel.
 * Each entry: { module: string, ui: widget[] }
 */
export function renderDashboard(userRole) {
  return moduleRegistry
    .getAll()
    .filter((m) => m.permissions.read.includes(userRole))
    .map((m) => ({
      module: m.name,
      version: m.version,
      ui: getActiveModuleUI(m.name)
    }));
}

/**
 * getActiveModuleUI(moduleName)
 * Returns the UI block definitions for a module.
 */
export function getActiveModuleUI(moduleName) {
  return getModuleUI(moduleName);
}

// ─────────────────────────────────────────────
// ROLE-BASED VISIBILITY
// ─────────────────────────────────────────────

/**
 * getVisibleModules(userRole)
 * Filters registry by read permission.
 * Roles: admin | operator | viewer | external_user
 */
export function getVisibleModules(userRole) {
  return moduleRegistry.getAll().filter((m) =>
    m.permissions.read.includes(userRole)
  );
}

// ─────────────────────────────────────────────
// DOM COMPOSER (three-panel layout)
// ─────────────────────────────────────────────

/**
 * mountDashboard(mountEl, userRole)
 * Mounts the full three-panel dashboard into a container element.
 * Consumes CSS classes defined in dashboard.css.
 *
 * Layout:
 * ┌─────────────┬──────────────────┬─────────────────┐
 * │  LEFT       │   CENTRE         │  RIGHT          │
 * │  Nav/Modules│   Active Widgets │  Alerts/AI      │
 * └─────────────┴──────────────────┴─────────────────┘
 */
export function mountDashboard(mountEl, userRole = "viewer") {
  if (!mountEl) throw new Error("[BCO Dashboard] Mount element not found.");

  mountEl.className = "bco-dashboard";
  mountEl.innerHTML = "";

  // ── LEFT PANEL ──────────────────────────────
  const left = document.createElement("aside");
  left.className = "bco-panel bco-panel--left";
  left.appendChild(_buildNavPanel(userRole));
  mountEl.appendChild(left);

  // ── CENTRE PANEL ────────────────────────────
  const centre = document.createElement("main");
  centre.className = "bco-panel bco-panel--centre";
  centre.id = "bco-centre-panel";
  mountEl.appendChild(centre);

  // Default: load first visible module
  const visibleModules = getVisibleModules(userRole);
  if (visibleModules.length > 0) {
    loadModuleView(centre, visibleModules[0].name, userRole);
  } else {
    centre.innerHTML = `<div class="bco-empty">No modules available for role: ${userRole}</div>`;
  }

  // ── RIGHT PANEL ──────────────────────────────
  const right = document.createElement("aside");
  right.className = "bco-panel bco-panel--right";
  right.appendChild(_buildRightPanel());
  mountEl.appendChild(right);

  return { left, centre, right };
}

/**
 * loadModuleView(container, moduleName, userRole)
 * Renders a module's widgets into the centre panel.
 */
export function loadModuleView(container, moduleName, userRole) {
  container.innerHTML = `
    <div class="bco-module-header">
      <h2 class="bco-module-title">${moduleName}</h2>
    </div>
    <div class="bco-widget-grid" id="bco-widget-grid--${moduleName}"></div>
  `;

  const grid = container.querySelector(`#bco-widget-grid--${moduleName}`);
  const widgets = getActiveModuleUI(moduleName);

  if (widgets.length === 0) {
    grid.innerHTML = `<div class="bco-empty">No UI blocks registered for ${moduleName}.</div>`;
    return;
  }

  widgets.forEach((widget) => {
    const rendered = renderWidget(widget, moduleName, userRole);
    grid.appendChild(rendered);
  });
}

// ─────────────────────────────────────────────
// INTERNAL PANEL BUILDERS
// ─────────────────────────────────────────────

function _buildNavPanel(userRole) {
  const nav = document.createElement("nav");
  nav.className = "bco-nav";

  const brand = getBrandConfig();
  nav.innerHTML = `
    <div class="bco-nav__brand">
      ${brand.logo_url ? `<img src="${brand.logo_url}" alt="${brand.app_name}" class="bco-nav__logo">` : ""}
      <span class="bco-nav__appname">${brand.app_name}</span>
    </div>
    <div class="bco-nav__role-badge">Role: ${userRole}</div>
    <ul class="bco-nav__modules"></ul>
    <div class="bco-nav__footer">
      <div class="bco-system-status" id="bco-system-status">● System ready</div>
    </div>
  `;

  const list = nav.querySelector(".bco-nav__modules");
  getVisibleModules(userRole).forEach((module) => {
    const li = document.createElement("li");
    li.className = "bco-nav__item";
    li.textContent = module.name;
    li.dataset.module = module.name;
    li.addEventListener("click", () => {
      const centre = document.getElementById("bco-centre-panel");
      if (centre) loadModuleView(centre, module.name, userRole);
      list.querySelectorAll(".bco-nav__item").forEach(el => el.classList.remove("active"));
      li.classList.add("active");
    });
    list.appendChild(li);
  });

  // Mark first item active
  list.querySelector(".bco-nav__item")?.classList.add("active");

  return nav;
}

function _buildRightPanel() {
  const panel = document.createElement("div");
  panel.className = "bco-right-panel";

  const alerts = storage.get(SSOT_KEYS.ALERTS) || [];
  const unread = alerts.filter((a) => !a.read).reverse().slice(0, 5);
  const unreadCount = getUnreadCount();

  panel.innerHTML = `
    <div class="bco-right-panel__section">
      <h3 class="bco-right-panel__heading">
        Alerts
        ${unreadCount > 0 ? `<span class="bco-badge">${unreadCount}</span>` : ""}
      </h3>
      <div class="bco-alert-list" id="bco-alert-list">
        ${unread.length > 0
          ? unread.map(a => `
              <div class="bco-alert bco-alert--${a.severity || "info"}">
                <span>${a.message}</span>
                <span class="bco-alert__ts">${_formatTs(a.timestamp)}</span>
              </div>`).join("")
          : `<div class="bco-empty">No alerts.</div>`
        }
      </div>
    </div>
    <div class="bco-right-panel__section">
      <h3 class="bco-right-panel__heading">AI Insights</h3>
      <div class="bco-ai-panel" id="bco-ai-panel">
        <div class="bco-empty">No suggestions yet.</div>
      </div>
    </div>
  `;

  return panel;
}

// ─────────────────────────────────────────────
// FULL INIT
// ─────────────────────────────────────────────

/**
 * initDashboard(mountEl, userRole)
 * Full product layer boot: brand → PWA → dashboard mount.
 * Call once on app start.
 */
export function initDashboard(mountEl, userRole = "viewer") {
  applyBranding();
  const panels = mountDashboard(mountEl, userRole);
  console.log(`[BCO Dashboard] Mounted for role: ${userRole}`);
  return panels;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _formatTs(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}
