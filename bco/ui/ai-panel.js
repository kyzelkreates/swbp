// BCO UI — AI Insights Panel (Run 5)
// Renders the right-panel AI section using insight engine output.
// Plugs into dashboard.js _buildRightPanel() as a drop-in replacement.
// Rule 7: read-only render layer.

import { runFullAnalysis, insightFromEvent } from "../ai/insight-engine.js";

// ─────────────────────────────────────────────
// PANEL RENDERER
// ─────────────────────────────────────────────

/**
 * renderAIPanel(containerEl)
 * Mounts a live AI insights section into a DOM container.
 * Runs a full analysis and populates the panel.
 */
export function renderAIPanel(containerEl) {
  if (!containerEl) return;

  containerEl.innerHTML = `<div class="bco-ai-loading">Analysing…</div>`;

  // Defer to next tick to avoid blocking the dashboard render
  requestAnimationFrame(() => {
    try {
      const { insights, crossModule, optimisationPlan } = runFullAnalysis();
      containerEl.innerHTML = "";
      containerEl.appendChild(_buildInsightsList(insights));
      containerEl.appendChild(_buildCorrelationSection(crossModule));
      containerEl.appendChild(_buildOptimisationSection(optimisationPlan));
    } catch (err) {
      containerEl.innerHTML = `<div class="bco-ai-error">AI analysis failed: ${err.message}</div>`;
    }
  });
}

/**
 * updateAIPanelFromEvent(containerEl, event)
 * Refreshes only the relevant module section when a live event arrives.
 */
export function updateAIPanelFromEvent(containerEl, event) {
  const insight = insightFromEvent(event);
  if (!insight) return;

  // Find or create the module insight card
  let card = containerEl.querySelector(`[data-ai-module="${insight.module}"]`);
  if (!card) {
    card = document.createElement("div");
    card.dataset.aiModule = insight.module;
    containerEl.prepend(card);
  }
  card.outerHTML = _insightCard(insight).outerHTML;
}

// ─────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────

function _buildInsightsList(insights) {
  const section = _el("div", { class: "bco-ai-section" });
  const heading = _el("h4", { class: "bco-ai-section__heading" });
  heading.textContent = "Module Insights";
  section.appendChild(heading);

  if (!insights.length) {
    section.appendChild(_el("div", { class: "bco-empty" }, "No modules registered."));
    return section;
  }

  insights.forEach((ins) => section.appendChild(_insightCard(ins)));
  return section;
}

function _insightCard(ins) {
  const riskColor = { none: "#4ade80", low: "#a3e635", medium: "#facc15", high: "#f97316", critical: "#ef4444" };
  const severity  = ins.riskResult?.severity || "none";

  const card = _el("div", {
    class:           `bco-ai-card bco-ai-card--${severity}`,
    "data-ai-module": ins.module
  });

  card.innerHTML = `
    <div class="bco-ai-card__header">
      <span class="bco-ai-card__module">${ins.module}</span>
      <span class="bco-ai-card__risk" style="color:${riskColor[severity] || '#fff'}">
        ${ins.riskScore}/100 · ${severity}
      </span>
    </div>
    ${ins.insights?.map(i => `<div class="bco-ai-card__insight">${i.message}</div>`).join("") || ""}
    ${ins.recommendations?.slice(0, 3).map(r => `
      <div class="bco-ai-rec bco-ai-rec--${r.priority}">
        <span class="bco-ai-rec__icon">${_priorityIcon(r.priority)}</span>
        <span class="bco-ai-rec__msg">${r.message}</span>
        <span class="bco-ai-rec__conf">${Math.round(r.confidence * 100)}%</span>
      </div>`).join("") || ""}
    ${ins.forecast?.nextState?.value !== undefined && ins.forecast.nextState.value !== null ? `
      <div class="bco-ai-forecast">
        Forecast: ${ins.forecast.nextState.direction} → ${ins.forecast.nextState.value}
        <span class="bco-ai-forecast__conf">(${Math.round(ins.forecast.confidence * 100)}% conf)</span>
      </div>` : ""}
  `;

  return card;
}

function _buildCorrelationSection(crossModule) {
  const section = _el("div", { class: "bco-ai-section" });
  const heading = _el("h4", { class: "bco-ai-section__heading" });
  heading.textContent = "Cross-Module Correlations";
  section.appendChild(heading);

  const strong = crossModule.correlations?.filter(c => c.strength === "strong" || c.strength === "moderate") || [];

  if (!strong.length) {
    section.appendChild(_el("div", { class: "bco-empty" }, "No significant correlations found."));
    return section;
  }

  strong.forEach(c => {
    const div = _el("div", { class: `bco-ai-corr bco-ai-corr--${c.strength}` });
    div.innerHTML = `
      <span>${c.pair[0]} ↔ ${c.pair[1]}</span>
      <span>${c.direction} · ${c.strength} (r=${c.correlation})</span>
    `;
    section.appendChild(div);
  });

  return section;
}

function _buildOptimisationSection(plan) {
  const section = _el("div", { class: "bco-ai-section" });
  const heading = _el("h4", { class: "bco-ai-section__heading" });
  heading.textContent = "Optimisation Plan";
  section.appendChild(heading);

  if (!plan.length) {
    section.appendChild(_el("div", { class: "bco-empty" }, "No optimisations needed."));
    return section;
  }

  plan.slice(0, 3).forEach(p => {
    const div = _el("div", { class: `bco-ai-plan bco-ai-plan--${p.priority}` });
    div.innerHTML = `
      <div class="bco-ai-plan__module">${p.module} <span class="bco-ai-plan__badge">${p.priority}</span></div>
      ${p.actions.slice(0, 2).map(a =>
        `<div class="bco-ai-plan__action">→ ${a.suggestion}</div>`
      ).join("")}
    `;
    section.appendChild(div);
  });

  return section;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _el(tag, attrs = {}, text = "") {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text) el.textContent = text;
  return el;
}

function _priorityIcon(p) {
  return { critical: "🚨", high: "⚠️", medium: "📊", low: "💡" }[p] || "•";
}
