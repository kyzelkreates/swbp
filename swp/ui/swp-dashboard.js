// SWP — Dashboard Engine
// Extends BCO Dashboard Engine (Run 4) for Student Wellbeing Platform
// Reuses: mountDashboard pattern, role-based visibility, widget grid
// Converts: BCO generic modules → SWP education modules

import { SWP_BRAND, getSWPIcon, applySWPBranding } from "./swp-brand.js";
import { MODULE_ACCESS } from "../auth/swp-permissions.js";
import { generateAllDemoData } from "../data/demo-data.js";
import {
  generateSchoolOverview,
  generateClassSummary,
  generateYearGroupSummary,
  generateStudentSummary,
  calculateAlertLevel,
  analyseStressTrends,
  correlateAttendanceWellbeing,
  suggestInterventions
} from "../ai/wellbeing-analysis.js";
import {
  generateSchoolWellbeingReport,
  generateEngagementReport,
  generateInterventionReport,
  generateSupportRequestReport,
  generateAttendanceCorrelationReport,
  REPORT_CATALOGUE
} from "../reports/report-engine.js";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let _state = {
  role:            "school_admin",
  demo:            null,
  activeModule:    null,
  selectedStudent: null,
  selectedClass:   null,
  selectedYG:      null,
  searchQuery:     "",
  alertFilter:     "all",
  checkInDraft:    { moodScore: 3, stressScore: 3, energyScore: 3, motivationScore: 3, confidenceScore: 3, note: "" }
};

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

export function initSWP(mountEl) {
  applySWPBranding();
  _state.demo = generateAllDemoData();

  mountEl.innerHTML = "";
  mountEl.className = "swp-app";

  // Build shell
  mountEl.appendChild(_buildHeader());
  mountEl.appendChild(_buildRoleBar());

  const body = document.createElement("div");
  body.className = "swp-body";
  body.id = "swp-body";

  body.appendChild(_buildSidebar());
  body.appendChild(_buildMain());
  body.appendChild(_buildRightPanel());

  mountEl.appendChild(body);

  // Load default module
  const defaultModule = MODULE_ACCESS[_state.role][0];
  loadModule(defaultModule);
}

// ─────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────

function _buildHeader() {
  const h = document.createElement("header");
  h.className = "swp-header";
  h.innerHTML = `
    <div class="swp-header__brand">
      <span class="swp-header__logo">💚</span>
      <span>${SWP_BRAND.app_name}</span>
    </div>
    <div class="swp-header__meta">
      <span id="swp-role-badge" class="swp-header__role">${_roleLabel(_state.role)}</span>
      <span style="color:var(--color-muted);font-size:0.8rem;">Demo Mode</span>
    </div>
  `;
  return h;
}

// ─────────────────────────────────────────────
// ROLE SWITCHER BAR
// ─────────────────────────────────────────────

function _buildRoleBar() {
  const bar = document.createElement("div");
  bar.className = "swp-role-selector";
  bar.id = "swp-role-bar";

  const roles = [
    { id: "school_admin",        label: "🏛️ School Admin" },
    { id: "safeguarding_officer",label: "🔒 Safeguarding" },
    { id: "pastoral_lead",       label: "🤝 Pastoral Lead" },
    { id: "teacher",             label: "📚 Teacher" },
    { id: "student",             label: "🎓 Student" }
  ];

  roles.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "swp-role-btn" + (r.id === _state.role ? " active" : "");
    btn.textContent = r.label;
    btn.dataset.role = r.id;
    btn.addEventListener("click", () => switchRole(r.id));
    bar.appendChild(btn);
  });

  const info = document.createElement("span");
  info.style.cssText = "margin-left:auto;font-size:0.75rem;color:var(--color-muted);align-self:center;";
  info.textContent = "Switch role to explore different views";
  bar.appendChild(info);

  return bar;
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

function _buildSidebar() {
  const sidebar = document.createElement("aside");
  sidebar.className = "swp-sidebar";
  sidebar.id = "swp-sidebar";
  _renderSidebarNav(sidebar);
  return sidebar;
}

function _renderSidebarNav(sidebar) {
  sidebar.innerHTML = "";

  const modules = MODULE_ACCESS[_state.role] || [];
  const isStudent = _state.role === "student";

  if (!isStudent) {
    const label = _el("div", "swp-nav__section-label", "Navigation");
    sidebar.appendChild(label);
  }

  const overview = _state.demo ? generateSchoolOverview(
    _state.demo.students, _state.demo.checkIns,
    _state.demo.interventions, _state.demo.supportRequests
  ) : null;

  modules.forEach(modName => {
    const item = document.createElement("div");
    item.className = "swp-nav__item" + (modName === _state.activeModule ? " active" : "");
    item.dataset.module = modName;

    const icon = getSWPIcon(modName);
    let badgeHTML = "";

    if (modName === "Alerts" && overview) {
      const count = overview.redAlerts + overview.amberAlerts;
      if (count > 0) badgeHTML = `<span class="swp-nav__badge">${count}</span>`;
    }
    if (modName === "SupportRequests" && overview) {
      if (overview.openSupportRequests > 0)
        badgeHTML = `<span class="swp-nav__badge amber">${overview.openSupportRequests}</span>`;
    }

    item.innerHTML = `<span class="swp-nav__icon">${icon}</span><span>${_moduleLabel(modName)}</span>${badgeHTML}`;
    item.addEventListener("click", () => loadModule(modName));
    sidebar.appendChild(item);
  });
}

// ─────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────

function _buildMain() {
  const main = document.createElement("main");
  main.className = "swp-main";
  main.id = "swp-main";
  return main;
}

// ─────────────────────────────────────────────
// RIGHT PANEL
// ─────────────────────────────────────────────

function _buildRightPanel() {
  const panel = document.createElement("aside");
  panel.className = "swp-right";
  panel.id = "swp-right";
  _renderRightPanel(panel);
  return panel;
}

function _renderRightPanel(panel) {
  if (!panel) return;
  panel.innerHTML = "";

  if (_state.role === "student") {
    _renderStudentRightPanel(panel);
  } else {
    _renderStaffRightPanel(panel);
  }
}

function _renderStudentRightPanel(panel) {
  const d = _state.demo;
  const student = d?.students[0];

  // Mood emoji quick access
  panel.innerHTML = `
    <div class="swp-right__section">
      <div class="swp-right__heading">💚 Wellbeing Tips</div>
      <div class="swp-ai-card">
        <div class="swp-ai-card__header">🤖 Daily Insight</div>
        <div class="swp-ai-card__text">Checking in regularly helps you and your support team understand your wellbeing journey. Even a quick check-in makes a difference.</div>
        <div class="swp-ai-card__disclaimer">Not a clinical tool. Based on your self-reported data only.</div>
      </div>
    </div>
    <div class="swp-right__section">
      <div class="swp-right__heading">🆘 Urgent Support</div>
      <div class="swp-card" style="border-color:var(--color-danger)">
        <div style="font-size:0.8rem;line-height:1.6;">
          <strong>Childline:</strong> 0800 1111<br>
          <strong>Samaritans:</strong> 116 123<br>
          <strong>Crisis Text Line:</strong> Text HELLO to 85258<br>
          <strong>School Pastoral:</strong> Ask reception
        </div>
      </div>
    </div>
    <div class="swp-right__section">
      <div class="swp-right__heading">🎯 My Goals</div>
      <div id="student-goals-mini"></div>
    </div>
  `;

  const goalsMini = panel.querySelector("#student-goals-mini");
  if (d && student) {
    const goals = d.goals.filter(g => g.studentId === student.id && g.status === "active").slice(0, 3);
    if (goals.length) {
      goals.forEach(g => {
        const div = document.createElement("div");
        div.style.cssText = "margin-bottom:0.75rem;";
        div.innerHTML = `
          <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.25rem;">${g.title}</div>
          <div class="swp-progress-bar"><div class="swp-progress-bar__fill" style="width:${g.progress}%;"></div></div>
          <div style="font-size:0.72rem;color:var(--color-muted);margin-top:0.2rem;">${g.progress}% complete</div>
        `;
        goalsMini.appendChild(div);
      });
    } else {
      goalsMini.innerHTML = `<div style="font-size:0.8rem;color:var(--color-muted);">No active goals yet</div>`;
    }
  }
}

function _renderStaffRightPanel(panel) {
  const d = _state.demo;
  if (!d) return;

  const overview = generateSchoolOverview(d.students, d.checkIns, d.interventions, d.supportRequests);
  const redStudents = d.students.filter(s => s.alertLevel === "red").slice(0, 5);
  const recentRequests = d.supportRequests.filter(r => r.status === "open").slice(0, 4);

  panel.innerHTML = `
    <div class="swp-right__section">
      <div class="swp-right__heading">🔴 Priority Alerts</div>
      <div id="swp-right-alerts"></div>
    </div>
    <div class="swp-right__section">
      <div class="swp-right__heading">💬 Open Requests</div>
      <div id="swp-right-requests"></div>
    </div>
    <div class="swp-right__section">
      <div class="swp-right__heading">🤖 AI Snapshot</div>
      <div class="swp-ai-card">
        <div class="swp-ai-card__header">🤖 School Summary</div>
        <div class="swp-ai-card__text">
          ${overview.redAlerts} students have red wellbeing indicators. 
          Average school wellbeing score is <strong>${overview.avgWellbeingScore}</strong>/100. 
          Check-in engagement: <strong>${overview.checkInEngagementRate}%</strong> this week.
        </div>
        <div class="swp-ai-card__disclaimer">Based on self-reported data only. Not a clinical assessment.</div>
      </div>
    </div>
  `;

  const alertsEl = panel.querySelector("#swp-right-alerts");
  if (redStudents.length) {
    redStudents.forEach(s => {
      const div = document.createElement("div");
      div.className = "swp-alert red";
      div.innerHTML = `<div class="swp-alert__dot"></div><div><div class="swp-alert__name">${s.fullName}</div><div class="swp-alert__reason">${s.yearGroupName} · Score: ${s.wellbeingScore.toFixed(0)}</div></div>`;
      div.addEventListener("click", () => { _state.selectedStudent = s; loadModule("Students"); });
      alertsEl.appendChild(div);
    });
  } else {
    alertsEl.innerHTML = `<div style="font-size:0.8rem;color:var(--color-muted)">No red alerts</div>`;
  }

  const reqsEl = panel.querySelector("#swp-right-requests");
  if (recentRequests.length) {
    recentRequests.forEach(r => {
      const div = document.createElement("div");
      div.style.cssText = "padding:0.625rem;border:1px solid var(--color-border);border-radius:8px;margin-bottom:0.5rem;font-size:0.8rem;cursor:pointer;";
      div.innerHTML = `<div style="font-weight:600;">${r.studentName}</div><div style="color:var(--color-muted);">${r.category} · <span class="badge ${r.urgency === 'urgent' ? 'red' : 'amber'}">${r.urgency}</span></div>`;
      div.addEventListener("click", () => loadModule("SupportRequests"));
      reqsEl.appendChild(div);
    });
  } else {
    reqsEl.innerHTML = `<div style="font-size:0.8rem;color:var(--color-muted)">No open requests</div>`;
  }
}

// ─────────────────────────────────────────────
// MODULE LOADER
// ─────────────────────────────────────────────

export function loadModule(moduleName) {
  _state.activeModule = moduleName;

  // Update sidebar active state
  document.querySelectorAll(".swp-nav__item").forEach(el => {
    el.classList.toggle("active", el.dataset.module === moduleName);
  });

  const main = document.getElementById("swp-main");
  if (!main) return;
  main.innerHTML = "";

  const renderers = {
    // Student modules
    StudentDashboard:    renderStudentDashboard,
    DailyCheckIn:        renderDailyCheckIn,
    Goals:               renderGoals,
    StudyPlanner:        renderStudyPlanner,
    Journal:             renderJournal,
    SupportRequests:     _state.role === "student" ? renderStudentSupportRequests : renderSupportRequests,
    Resources:           renderResources,
    Profile:             renderProfile,
    // Staff modules
    Overview:            renderOverview,
    Students:            renderStudents,
    Classes:             renderClasses,
    YearGroups:          renderYearGroups,
    Alerts:              renderAlerts,
    Interventions:       renderInterventions,
    Reports:             renderReports,
    AIAnalysis:          renderAIAnalysis,
    Safeguarding:        renderSafeguarding,
    Settings:            renderSettings
  };

  const renderer = renderers[moduleName];
  if (renderer) {
    renderer(main, _state.demo);
  } else {
    main.innerHTML = `<div class="swp-empty"><div class="swp-empty__icon">🚧</div><p>Module not available</p></div>`;
  }
}

// ─────────────────────────────────────────────
// ROLE SWITCHER
// ─────────────────────────────────────────────

function switchRole(newRole) {
  _state.role = newRole;
  _state.activeModule = null;
  _state.selectedStudent = null;

  document.querySelectorAll(".swp-role-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.role === newRole);
  });

  const badge = document.getElementById("swp-role-badge");
  if (badge) badge.textContent = _roleLabel(newRole);

  const sidebar = document.getElementById("swp-sidebar");
  if (sidebar) _renderSidebarNav(sidebar);

  const rightPanel = document.getElementById("swp-right");
  if (rightPanel) _renderRightPanel(rightPanel);

  const defaultModule = MODULE_ACCESS[newRole][0];
  loadModule(defaultModule);
}

// ─────────────────────────────────────────────
// ── STUDENT MODULE RENDERERS ──────────────────
// ─────────────────────────────────────────────

function renderStudentDashboard(el, d) {
  const student = d.students[0];
  const checkIns = d.checkIns.filter(c => c.studentId === student.id);
  const goals = d.goals.filter(g => g.studentId === student.id);
  const attendance = d.attendance.find(a => a.studentId === student.id);
  const recent = checkIns.slice(-5);

  const avgMood = recent.length ? (recent.reduce((s,c) => s + c.moodScore, 0) / recent.length).toFixed(1) : "N/A";
  const avgStress = recent.length ? (recent.reduce((s,c) => s + c.stressScore, 0) / recent.length).toFixed(1) : "N/A";
  const lastCI = checkIns[checkIns.length - 1];
  const activeGoals = goals.filter(g => g.status === "active");

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">👋 Hello, ${student.firstName}!</div>
      <div class="swp-page-subtitle">Here's your wellbeing overview</div></div>
      <button class="swp-btn primary" onclick="loadModule('DailyCheckIn')">✅ Daily Check-In</button>
    </div>
    <div class="swp-stats-grid">
      <div class="swp-stat-card ${lastCI ? (lastCI.moodScore <= 2 ? 'danger' : lastCI.moodScore >= 4 ? 'success' : '') : ''}">
        <div class="swp-stat-card__label">Today's Mood</div>
        <div class="swp-stat-card__value">${lastCI ? ["😔","😕","😐","🙂","😊"][lastCI.moodScore-1] : "—"}</div>
        <div class="swp-stat-card__sub">${lastCI ? ["Very Low","Low","Neutral","Good","Great"][lastCI.moodScore-1] : "No check-in yet"}</div>
      </div>
      <div class="swp-stat-card ${lastCI && lastCI.stressScore >= 4 ? 'danger' : lastCI && lastCI.stressScore <= 2 ? 'success' : ''}">
        <div class="swp-stat-card__label">Stress Level</div>
        <div class="swp-stat-card__value">${lastCI ? lastCI.stressScore : "—"}<span style="font-size:1rem;">/5</span></div>
        <div class="swp-stat-card__sub">${lastCI ? ["None","Low","Moderate","High","Very High"][lastCI.stressScore-1] : "No check-in yet"}</div>
      </div>
      <div class="swp-stat-card primary">
        <div class="swp-stat-card__label">Goals Progress</div>
        <div class="swp-stat-card__value">${activeGoals.length}</div>
        <div class="swp-stat-card__sub">Active goals</div>
      </div>
      <div class="swp-stat-card ${attendance && attendance.overallRate < 90 ? 'warning' : 'success'}">
        <div class="swp-stat-card__label">Attendance</div>
        <div class="swp-stat-card__value">${attendance ? attendance.overallRate.toFixed(0) : "—"}%</div>
        <div class="swp-stat-card__sub">${attendance && attendance.overallRate >= 90 ? "On track" : "Needs attention"}</div>
      </div>
    </div>

    <div class="swp-grid-2">
      <div class="swp-card">
        <div class="swp-card__title">📈 Mood This Week</div>
        ${_renderMiniChart(recent.map(c => c.moodScore), 5, "primary")}
      </div>
      <div class="swp-card">
        <div class="swp-card__title">📉 Stress This Week</div>
        ${_renderMiniChart(recent.map(c => c.stressScore), 5, "warning")}
      </div>
    </div>

    <div class="swp-card">
      <div class="swp-card__title">🎯 Active Goals</div>
      ${activeGoals.slice(0,3).map(g => `
        <div style="margin-bottom:0.875rem;">
          <div style="display:flex;justify-content:space-between;font-size:0.875rem;font-weight:500;margin-bottom:0.3rem;">
            <span>${g.title}</span><span style="color:var(--color-muted)">${g.progress}%</span>
          </div>
          <div class="swp-progress-bar"><div class="swp-progress-bar__fill" style="width:${g.progress}%"></div></div>
        </div>
      `).join("") || "<div style='color:var(--color-muted);font-size:0.875rem;'>No active goals. <a href='#' onclick='loadModule(\"Goals\")'>Set one now →</a></div>"}
    </div>

    <div class="swp-card">
      <div class="swp-card__title">📋 Recent Check-Ins</div>
      <div class="swp-table-wrap">
        <table class="swp-table">
          <thead><tr><th>Date</th><th>Mood</th><th>Stress</th><th>Note</th></tr></thead>
          <tbody>
            ${checkIns.slice(-5).reverse().map(c => `
              <tr>
                <td>${c.date}</td>
                <td>${["😔","😕","😐","🙂","😊"][c.moodScore-1]} ${c.moodLabel}</td>
                <td><span class="badge ${c.stressScore >= 4 ? "red" : c.stressScore <= 2 ? "green" : "amber"}">${c.stressLabel}</span></td>
                <td style="color:var(--color-muted);font-size:0.8rem;">${c.note || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="swp-ai-card">
      <div class="swp-ai-card__header">🤖 AI Wellbeing Insight</div>
      <div class="swp-ai-card__text">
        Your average mood over the last 5 check-ins is <strong>${avgMood}/5</strong> and average stress is <strong>${avgStress}/5</strong>.
        ${parseFloat(avgMood) >= 3.5 ? "You seem to be doing well overall — keep it up!" : "Your mood scores suggest things have been tough recently. Remember, it's okay to ask for support."}
        ${attendance && attendance.overallRate >= 95 ? " Your attendance is excellent." : ""}
      </div>
      <div class="swp-ai-card__disclaimer">Based on your self-reported data only. Not a clinical assessment.</div>
    </div>
  `;

  el.querySelector("[onclick=\"loadModule('DailyCheckIn')\"]")?.addEventListener("click", () => loadModule("DailyCheckIn"));
}

function renderDailyCheckIn(el, d) {
  const draft = _state.checkInDraft;
  const moodEmojis = ["😔","😕","😐","🙂","😊"];
  const stressEmojis = ["😌","🙂","😐","😟","😰"];
  const attendanceOptions = [
    "I attended all lessons","I missed one lesson","I struggled to attend",
    "I was absent for medical reasons","I arrived late to some lessons"
  ];

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">✅ Daily Check-In</div>
      <div class="swp-page-subtitle">Takes less than 2 minutes. How are you doing today?</div></div>
    </div>
    <div class="swp-card" style="max-width:600px;">
      <div class="swp-slider-wrap">
        <div class="swp-slider-label"><label class="swp-label">How are you feeling today?</label><span id="mood-val">${moodEmojis[draft.moodScore-1]}</span></div>
        <input type="range" class="swp-slider" id="mood-slider" min="1" max="5" value="${draft.moodScore}" style="--pct:${(draft.moodScore-1)*25}%">
        <div class="swp-slider-emojis"><span>😔</span><span>😕</span><span>😐</span><span>🙂</span><span>😊</span></div>
      </div>
      <div class="swp-slider-wrap">
        <div class="swp-slider-label"><label class="swp-label">How stressed are you feeling?</label><span id="stress-val">${stressEmojis[draft.stressScore-1]}</span></div>
        <input type="range" class="swp-slider" id="stress-slider" min="1" max="5" value="${draft.stressScore}" style="--pct:${(draft.stressScore-1)*25}%">
        <div class="swp-slider-emojis"><span>😌</span><span>🙂</span><span>😐</span><span>😟</span><span>😰</span></div>
      </div>
      <div class="swp-slider-wrap">
        <div class="swp-slider-label"><label class="swp-label">Energy level</label><span id="energy-val">${draft.energyScore}/5</span></div>
        <input type="range" class="swp-slider" id="energy-slider" min="1" max="5" value="${draft.energyScore}" style="--pct:${(draft.energyScore-1)*25}%">
      </div>
      <div class="swp-slider-wrap">
        <div class="swp-slider-label"><label class="swp-label">Motivation level</label><span id="motivation-val">${draft.motivationScore}/5</span></div>
        <input type="range" class="swp-slider" id="motivation-slider" min="1" max="5" value="${draft.motivationScore}" style="--pct:${(draft.motivationScore-1)*25}%">
      </div>
      <div class="swp-slider-wrap">
        <div class="swp-slider-label"><label class="swp-label">Confidence level</label><span id="confidence-val">${draft.confidenceScore}/5</span></div>
        <input type="range" class="swp-slider" id="confidence-slider" min="1" max="5" value="${draft.confidenceScore}" style="--pct:${(draft.confidenceScore-1)*25}%">
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Attendance reflection</label>
        <select class="swp-select" id="attendance-select">
          ${attendanceOptions.map(o => `<option value="${o}">${o}</option>`).join("")}
        </select>
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Anything you'd like to share? <span style="color:var(--color-muted);font-weight:400;">(optional)</span></label>
        <textarea class="swp-textarea" id="checkin-note" placeholder="This is private unless you choose to share it...">${draft.note}</textarea>
      </div>
      <div id="checkin-alert-msg"></div>
      <button class="swp-btn primary" id="submit-checkin" style="width:100%;">✅ Submit Check-In</button>
    </div>
  `;

  // Wire up sliders
  ["mood","stress","energy","motivation","confidence"].forEach(key => {
    const slider = el.querySelector(`#${key}-slider`);
    const label = el.querySelector(`#${key}-val`);
    slider?.addEventListener("input", e => {
      const val = parseInt(e.target.value);
      _state.checkInDraft[`${key}Score`] = val;
      e.target.style.setProperty("--pct", `${(val-1)*25}%`);
      if (key === "mood") label.textContent = moodEmojis[val-1];
      else if (key === "stress") label.textContent = stressEmojis[val-1];
      else label.textContent = `${val}/5`;
    });
  });

  el.querySelector("#submit-checkin")?.addEventListener("click", () => {
    const alertMsg = el.querySelector("#checkin-alert-msg");
    const mood = _state.checkInDraft.moodScore;
    const stress = _state.checkInDraft.stressScore;

    if (mood <= 2 || stress >= 4) {
      alertMsg.innerHTML = `<div class="swp-ai-card" style="margin-bottom:1rem;border-color:var(--color-warning);">
        <div class="swp-ai-card__header" style="color:var(--color-warning);">⚠️ Support Available</div>
        <div class="swp-ai-card__text">It looks like you may be having a tough time. Your pastoral team is here to help — your check-in has been noted and support resources are available in the Resources section.</div>
      </div>`;
    } else {
      alertMsg.innerHTML = `<div class="swp-ai-card" style="margin-bottom:1rem;">
        <div class="swp-ai-card__header">✅ Check-In Recorded</div>
        <div class="swp-ai-card__text">Thanks for checking in today! Your responses have been saved.</div>
      </div>`;
    }

    el.querySelector("#submit-checkin").textContent = "✅ Submitted!";
    el.querySelector("#submit-checkin").disabled = true;
  });
}

function renderGoals(el, d) {
  const student = d.students[0];
  const goals = d.goals.filter(g => g.studentId === student.id);
  const active = goals.filter(g => g.status === "active");
  const completed = goals.filter(g => g.status === "completed");

  const goalOptions = [
    "Improve sleep routine","Reduce screen time","Exercise more",
    "Talk to a friend","Complete homework on time","Practice mindfulness",
    "Read for 20 minutes daily","Eat healthier","Attend all lessons","Join a school club"
  ];

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🎯 My Goals</div>
      <div class="swp-page-subtitle">Track your personal wellbeing goals</div></div>
    </div>
    <div class="swp-stats-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="swp-stat-card primary"><div class="swp-stat-card__label">Active</div><div class="swp-stat-card__value">${active.length}</div></div>
      <div class="swp-stat-card success"><div class="swp-stat-card__label">Completed</div><div class="swp-stat-card__value">${completed.length}</div></div>
      <div class="swp-stat-card"><div class="swp-stat-card__label">Total</div><div class="swp-stat-card__value">${goals.length}</div></div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">➕ Set a New Goal</div>
      <div class="swp-form-group">
        <label class="swp-label">Choose a goal</label>
        <select class="swp-select" id="goal-select">
          ${goalOptions.map(o => `<option>${o}</option>`).join("")}
        </select>
      </div>
      <button class="swp-btn primary sm" id="add-goal-btn">Add Goal</button>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">🟢 Active Goals</div>
      ${active.map(g => `
        <div style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--color-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.375rem;">
            <span style="font-weight:600;font-size:0.875rem;">${g.title}</span>
            <span class="badge green">${g.progress}%</span>
          </div>
          <div class="swp-progress-bar"><div class="swp-progress-bar__fill" style="width:${g.progress}%"></div></div>
          <div style="font-size:0.75rem;color:var(--color-muted);margin-top:0.25rem;">Target: ${g.targetDate || "Ongoing"}</div>
        </div>
      `).join("") || "<div style='color:var(--color-muted);font-size:0.875rem;'>No active goals yet.</div>"}
    </div>
    <div class="swp-card">
      <div class="swp-card__title">✅ Completed Goals</div>
      ${completed.map(g => `
        <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;">
          <span>${g.title}</span><span class="badge green">Done ✓</span>
        </div>
      `).join("") || "<div style='color:var(--color-muted);font-size:0.875rem;'>No completed goals yet.</div>"}
    </div>
  `;

  el.querySelector("#add-goal-btn")?.addEventListener("click", () => {
    const select = el.querySelector("#goal-select");
    const title = select.value;
    const newGoal = { id: `G${Date.now()}`, studentId: student.id, title, progress: 0, status: "active", createdDate: new Date().toISOString().split("T")[0], targetDate: null };
    d.goals.push(newGoal);
    renderGoals(el, d);
  });
}

function renderStudyPlanner(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">📚 Study Planner</div>
      <div class="swp-page-subtitle">Manage your study sessions and habits</div></div>
    </div>
    <div class="swp-grid-2">
      <div class="swp-card">
        <div class="swp-card__title">📅 This Week</div>
        ${["Monday","Tuesday","Wednesday","Thursday","Friday"].map(day => `
          <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;">
            <span>${day}</span>
            <span style="color:var(--color-muted);">${["Maths revision","English essay","Science review","History notes","Free study"][["Monday","Tuesday","Wednesday","Thursday","Friday"].indexOf(day)]}</span>
          </div>
        `).join("")}
      </div>
      <div class="swp-card">
        <div class="swp-card__title">📊 Study Habits (Last 7 Days)</div>
        ${_renderMiniChart([3,4,2,5,3,4,3], 5, "primary")}
        <div style="font-size:0.75rem;color:var(--color-muted);margin-top:0.5rem;text-align:center;">Hours per day</div>
      </div>
    </div>
    <div class="swp-ai-card">
      <div class="swp-ai-card__header">🤖 Study Tips</div>
      <div class="swp-ai-card__text">
        Try the Pomodoro technique: 25 minutes focused study, 5 minutes break. Your most productive study window tends to be in the morning based on your energy check-ins.
      </div>
      <div class="swp-ai-card__disclaimer">Suggestions based on your self-reported data only.</div>
    </div>
  `;
}

function renderJournal(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">📓 My Journal</div>
      <div class="swp-page-subtitle">Your private space — only you can read this</div></div>
    </div>
    <div class="swp-card" style="max-width:600px;">
      <div class="swp-card__title">✏️ New Entry</div>
      <div class="swp-form-group">
        <label class="swp-label">How are you feeling today?</label>
        <textarea class="swp-textarea" id="journal-entry" placeholder="Write freely — this is just for you..." style="min-height:160px;"></textarea>
      </div>
      <button class="swp-btn primary" id="save-journal">Save Entry</button>
    </div>
    <div class="swp-card" style="max-width:600px;">
      <div class="swp-card__title">📚 Past Entries</div>
      <div style="text-align:center;padding:2rem;color:var(--color-muted);font-size:0.875rem;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">🔒</div>
        Your journal entries are stored privately on this device only.
      </div>
    </div>
  `;
  el.querySelector("#save-journal")?.addEventListener("click", () => {
    el.querySelector("#journal-entry").value = "";
    const btn = el.querySelector("#save-journal");
    btn.textContent = "✅ Saved!";
    setTimeout(() => btn.textContent = "Save Entry", 2000);
  });
}

function renderStudentSupportRequests(el, d) {
  const student = d.students[0];
  const myRequests = d.supportRequests.filter(r => r.studentId === student.id);
  const categories = ["Academic Support","Mental Health","Bullying","Family Issues","Exam Anxiety","Friendship Issues","Other"];

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">💬 Support Requests</div>
      <div class="swp-page-subtitle">Ask for help from your pastoral team</div></div>
    </div>
    <div class="swp-card" style="max-width:600px;">
      <div class="swp-card__title">🆕 Request Support</div>
      <div class="swp-form-group">
        <label class="swp-label">What do you need help with?</label>
        <select class="swp-select" id="support-cat">${categories.map(c => `<option>${c}</option>`).join("")}</select>
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Urgency</label>
        <select class="swp-select" id="support-urgency"><option>low</option><option>medium</option><option>high</option><option>urgent</option></select>
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Describe what's happening <span style="color:var(--color-muted);font-weight:400;">(optional)</span></label>
        <textarea class="swp-textarea" id="support-desc" placeholder="Share as much or as little as you're comfortable with..."></textarea>
      </div>
      <button class="swp-btn primary" id="submit-support">Send Request</button>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📋 My Requests</div>
      ${myRequests.length ? `
        <div class="swp-table-wrap"><table class="swp-table">
          <thead><tr><th>Category</th><th>Urgency</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>${myRequests.map(r => `<tr>
            <td>${r.category}</td>
            <td><span class="badge ${r.urgency === 'urgent' ? 'red' : r.urgency === 'high' ? 'amber' : 'gray'}">${r.urgency}</span></td>
            <td><span class="badge ${r.status === 'resolved' ? 'green' : r.status === 'in_progress' ? 'blue' : 'gray'}">${r.status}</span></td>
            <td>${r.createdDate}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<div style="color:var(--color-muted);font-size:0.875rem;">No requests yet.</div>`}
    </div>
  `;

  el.querySelector("#submit-support")?.addEventListener("click", () => {
    const cat = el.querySelector("#support-cat").value;
    const urgency = el.querySelector("#support-urgency").value;
    d.supportRequests.push({ id: `SR${Date.now()}`, studentId: student.id, studentName: student.fullName, category: cat, urgency, status: "open", createdDate: new Date().toISOString().split("T")[0] });
    renderStudentSupportRequests(el, d);
  });
}

function renderResources(el, d) {
  const categories = [
    { icon:"🧠", title:"Mental Health", items:["Understanding anxiety","Dealing with low mood","Mindfulness exercises","Sleep hygiene tips"] },
    { icon:"📚", title:"Academic", items:["Exam revision strategies","Managing academic pressure","Study skills guide","Asking for help"] },
    { icon:"👫", title:"Friendships", items:["Dealing with friendship issues","What is bullying?","Building healthy friendships","Online safety"] },
    { icon:"🏠", title:"Home & Family", items:["When home is difficult","Talking to parents","Family change support","Bereavement support"] },
    { icon:"💪", title:"Wellbeing", items:["Exercise and mood","Healthy eating","Breathing techniques","Building confidence"] },
    { icon:"🆘", title:"Crisis Support", items:["Childline: 0800 1111","Samaritans: 116 123","Crisis Text Line: 85258","Shout: Text SHOUT to 85258"] }
  ];

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🌐 Resources</div>
      <div class="swp-page-subtitle">Support, guides and wellbeing resources</div></div>
    </div>
    <div class="swp-grid-3">
      ${categories.map(c => `
        <div class="swp-card" style="cursor:pointer;" onclick="">
          <div style="font-size:2rem;margin-bottom:0.5rem;">${c.icon}</div>
          <div style="font-weight:700;margin-bottom:0.75rem;">${c.title}</div>
          ${c.items.map(i => `<div style="font-size:0.8rem;color:var(--color-muted);padding:0.2rem 0;border-bottom:1px solid var(--color-border);">${i}</div>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderProfile(el, d) {
  const student = d.students[0];
  const checkIns = d.checkIns.filter(c => c.studentId === student.id);
  const goals = d.goals.filter(g => g.studentId === student.id);

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">👤 My Profile</div></div>
    </div>
    <div class="swp-card" style="max-width:480px;">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--color-primary);color:white;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;">${student.firstName[0]}${student.lastName[0]}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700;">${student.fullName}</div>
          <div style="color:var(--color-muted);font-size:0.875rem;">${student.yearGroupName} · ${student.className}</div>
          <div style="color:var(--color-muted);font-size:0.8rem;">${student.email}</div>
        </div>
      </div>
      <div class="swp-stats-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--color-primary);">${checkIns.length}</div><div style="font-size:0.72rem;color:var(--color-muted);">Check-Ins</div></div>
        <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--color-success);">${goals.filter(g=>g.status==='completed').length}</div><div style="font-size:0.72rem;color:var(--color-muted);">Goals Done</div></div>
        <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--color-warning);">${student.attendanceRate.toFixed(0)}%</div><div style="font-size:0.72rem;color:var(--color-muted);">Attendance</div></div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// ── STAFF MODULE RENDERERS ────────────────────
// ─────────────────────────────────────────────

function renderOverview(el, d) {
  const overview = generateSchoolOverview(d.students, d.checkIns, d.interventions, d.supportRequests);
  const stressTrends = analyseStressTrends(d.checkIns, "week").slice(-8);

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">📊 School Wellbeing Overview</div>
      <div class="swp-page-subtitle">Live metrics · ${new Date().toLocaleDateString("en-GB", {weekday:"long",day:"numeric",month:"long"})}</div></div>
      <button class="swp-btn secondary sm" onclick="">📥 Export Report</button>
    </div>
    <div class="swp-stats-grid">
      <div class="swp-stat-card primary"><div class="swp-stat-card__label">Total Students</div><div class="swp-stat-card__value">${overview.totalStudents.toLocaleString()}</div><div class="swp-stat-card__sub">${d.classes.length} classes · ${d.yearGroups.length} year groups</div></div>
      <div class="swp-stat-card danger"><div class="swp-stat-card__label">Requiring Support</div><div class="swp-stat-card__value">${overview.studentsRequiringSupport}</div><div class="swp-stat-card__sub">${((overview.studentsRequiringSupport/overview.totalStudents)*100).toFixed(1)}% of students</div></div>
      <div class="swp-stat-card danger"><div class="swp-stat-card__label">🔴 Red Alerts</div><div class="swp-stat-card__value">${overview.redAlerts}</div><div class="swp-stat-card__sub">Immediate attention</div></div>
      <div class="swp-stat-card warning"><div class="swp-stat-card__label">🟡 Amber Alerts</div><div class="swp-stat-card__value">${overview.amberAlerts}</div><div class="swp-stat-card__sub">Monitoring required</div></div>
      <div class="swp-stat-card success"><div class="swp-stat-card__label">Avg Wellbeing</div><div class="swp-stat-card__value">${overview.avgWellbeingScore}</div><div class="swp-stat-card__sub">School score /100</div></div>
      <div class="swp-stat-card ${overview.avgAttendanceRate < 90 ? 'warning' : 'success'}"><div class="swp-stat-card__label">Avg Attendance</div><div class="swp-stat-card__value">${overview.avgAttendanceRate}%</div><div class="swp-stat-card__sub">${overview.persistentAbsenceCount} persistent absence</div></div>
      <div class="swp-stat-card primary"><div class="swp-stat-card__label">Engagement Rate</div><div class="swp-stat-card__value">${overview.checkInEngagementRate}%</div><div class="swp-stat-card__sub">${overview.checkInsLast7Days} check-ins this week</div></div>
      <div class="swp-stat-card warning"><div class="swp-stat-card__label">Open Requests</div><div class="swp-stat-card__value">${overview.openSupportRequests}</div><div class="swp-stat-card__sub">Awaiting action</div></div>
    </div>
    <div class="swp-grid-2">
      <div class="swp-card">
        <div class="swp-card__title">📊 Alert Breakdown</div>
        ${_renderAlertDonut(overview.redAlerts, overview.amberAlerts, overview.greenStudents)}
      </div>
      <div class="swp-card">
        <div class="swp-card__title">📈 Stress Trend (Weekly Avg)</div>
        ${_renderMiniChart(stressTrends.map(t => t.avgStress * 20), 100, "warning")}
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--color-muted);margin-top:0.375rem;">
          <span>${stressTrends[0]?.period || ""}</span><span>${stressTrends[stressTrends.length-1]?.period || ""}</span>
        </div>
      </div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">🎓 Wellbeing by Year Group</div>
      <div class="swp-table-wrap"><table class="swp-table">
        <thead><tr><th>Year Group</th><th>Students</th><th>Avg Wellbeing</th><th>Avg Attendance</th><th>Red Alerts</th><th>Amber Alerts</th><th>Status</th></tr></thead>
        <tbody>
          ${d.yearGroups.map(yg => {
            const s = d.students.filter(st => st.yearGroupId === yg.id);
            const avgW = (s.reduce((t,st) => t+st.wellbeingScore,0)/s.length).toFixed(1);
            const avgA = (s.reduce((t,st) => t+st.attendanceRate,0)/s.length).toFixed(1);
            const red = s.filter(st=>st.alertLevel==="red").length;
            const amber = s.filter(st=>st.alertLevel==="amber").length;
            return `<tr>
              <td><strong>${yg.name}</strong></td>
              <td>${s.length}</td>
              <td><span class="badge ${avgW>=70?"green":avgW>=55?"amber":"red"}">${avgW}</span></td>
              <td><span class="badge ${avgA>=95?"green":avgA>=90?"amber":"red"}">${avgA}%</span></td>
              <td style="color:var(--color-danger);font-weight:600;">${red}</td>
              <td style="color:var(--color-warning);font-weight:600;">${amber}</td>
              <td><span class="badge ${avgW>=70?"green":avgW>=55?"amber":"red"}">${avgW>=70?"Good":avgW>=55?"Monitor":"Concern"}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderStudents(el, d) {
  let filtered = d.students;
  const search = _state.searchQuery.toLowerCase();
  if (search) filtered = filtered.filter(s => s.fullName.toLowerCase().includes(search) || s.yearGroupName.toLowerCase().includes(search));

  const selected = _state.selectedStudent;

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">👥 Students</div>
      <div class="swp-page-subtitle">${d.students.length} students · ${d.students.filter(s=>s.alertLevel==="red").length} red · ${d.students.filter(s=>s.alertLevel==="amber").length} amber</div></div>
    </div>
    <div class="swp-filter-bar">
      <input class="swp-search" id="student-search" placeholder="Search students…" value="${_state.searchQuery}">
      <select class="swp-select" id="yg-filter" style="width:140px;">
        <option value="">All Year Groups</option>
        ${d.yearGroups.map(yg => `<option value="${yg.id}">${yg.name}</option>`).join("")}
      </select>
      <select class="swp-select" id="alert-filter" style="width:130px;">
        <option value="all">All Alerts</option>
        <option value="red">🔴 Red</option>
        <option value="amber">🟡 Amber</option>
        <option value="green">🟢 Green</option>
      </select>
    </div>
    <div style="display:${selected?'grid':'block'};grid-template-columns:1fr 380px;gap:1rem;">
      <div class="swp-table-wrap">
        <table class="swp-table">
          <thead><tr><th>Name</th><th>Year</th><th>Class</th><th>Alert</th><th>Wellbeing</th><th>Attendance</th><th>Last Check-In</th></tr></thead>
          <tbody id="student-tbody">
            ${filtered.slice(0,50).map(s => `
              <tr data-id="${s.id}" style="${selected?.id===s.id?'background:rgba(44,122,123,0.06);':''}">
                <td><strong>${s.fullName}</strong></td>
                <td>${s.yearGroupName}</td>
                <td>${s.className}</td>
                <td><span class="badge ${s.alertLevel}">${s.alertLevel==="red"?"🔴":s.alertLevel==="amber"?"🟡":"🟢"} ${s.alertLevel}</span></td>
                <td>${s.wellbeingScore.toFixed(0)}</td>
                <td><span class="badge ${s.attendanceRate>=95?"green":s.attendanceRate>=90?"amber":"red"}">${s.attendanceRate.toFixed(1)}%</span></td>
                <td>${s.lastCheckIn || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--color-muted);border-top:1px solid var(--color-border);">Showing ${Math.min(50,filtered.length)} of ${filtered.length} students</div>
      </div>
      ${selected ? _renderStudentDetailPanel(selected, d) : ""}
    </div>
  `;

  el.querySelector("#student-search")?.addEventListener("input", e => {
    _state.searchQuery = e.target.value;
    renderStudents(el, d);
  });

  el.querySelectorAll("#student-tbody tr").forEach(row => {
    row.addEventListener("click", () => {
      _state.selectedStudent = d.students.find(s => s.id === row.dataset.id);
      renderStudents(el, d);
    });
  });
}

function _renderStudentDetailPanel(student, d) {
  const checkIns = d.checkIns.filter(c => c.studentId === student.id).slice(-5);
  const attendance = d.attendance.find(a => a.studentId === student.id);
  const interventions = d.interventions.filter(i => i.studentId === student.id);
  const suggestions = suggestInterventions(student, checkIns, attendance);

  return `
    <div class="swp-card" style="height:fit-content;">
      <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
        <div style="display:flex;gap:0.75rem;align-items:center;">
          <div class="swp-student-card__avatar ${student.alertLevel}">${student.firstName[0]}${student.lastName[0]}</div>
          <div><div style="font-weight:700;">${student.fullName}</div>
          <div style="font-size:0.8rem;color:var(--color-muted);">${student.yearGroupName} · ${student.className}</div></div>
        </div>
        <button onclick="" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--color-muted);" id="close-detail">✕</button>
      </div>
      <div class="swp-stats-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div style="text-align:center;"><div style="font-size:1.25rem;font-weight:800;color:var(--color-${student.alertLevel==="red"?"danger":student.alertLevel==="amber"?"warning":"success"});">${student.wellbeingScore.toFixed(0)}</div><div style="font-size:0.7rem;color:var(--color-muted);">Wellbeing</div></div>
        <div style="text-align:center;"><div style="font-size:1.25rem;font-weight:800;">${attendance?.overallRate.toFixed(0)||"—"}%</div><div style="font-size:0.7rem;color:var(--color-muted);">Attendance</div></div>
        <div style="text-align:center;"><div style="font-size:1.25rem;font-weight:800;">${student.engagementScore.toFixed(0)}</div><div style="font-size:0.7rem;color:var(--color-muted);">Engagement</div></div>
      </div>
      ${student.senFlag ? `<div class="badge purple" style="margin:0.25rem 0;">SEN</div>` : ""}
      ${student.ppFlag ? `<div class="badge blue" style="margin:0.25rem;">PP</div>` : ""}
      <div style="margin-top:0.75rem;">
        <div style="font-size:0.75rem;font-weight:700;color:var(--color-muted);margin-bottom:0.5rem;">RECENT CHECK-INS</div>
        ${checkIns.map(c => `<div style="font-size:0.8rem;display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--color-border);">
          <span>${c.date}</span>
          <span>${["😔","😕","😐","🙂","😊"][c.moodScore-1]} <span class="badge ${c.stressScore>=4?"red":c.stressScore<=2?"green":"amber"}" style="font-size:0.65rem;">S:${c.stressScore}</span></span>
        </div>`).join("") || `<div style="font-size:0.8rem;color:var(--color-muted);">No check-ins</div>`}
      </div>
      ${suggestions.length ? `
        <div style="margin-top:0.75rem;">
          <div style="font-size:0.75rem;font-weight:700;color:var(--color-muted);margin-bottom:0.5rem;">SUGGESTED ACTIONS</div>
          ${suggestions.map(s => `<div class="swp-ai-card" style="padding:0.625rem;margin-bottom:0.5rem;">
            <div style="font-size:0.75rem;font-weight:600;">${s.type}</div>
            <div style="font-size:0.72rem;color:var(--color-muted);">${s.reason}</div>
          </div>`).join("")}
          <div style="font-size:0.7rem;color:var(--color-muted);font-style:italic;margin-top:0.5rem;">Suggestions based on data trends only. Not clinical advice.</div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderClasses(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🏫 Classes</div>
      <div class="swp-page-subtitle">${d.classes.length} classes across ${d.yearGroups.length} year groups</div></div>
    </div>
    <div class="swp-grid-3" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
      ${d.classes.map(cls => {
        const summary = generateClassSummary(cls, d.students, d.checkIns);
        const alertColor = summary.avgWellbeingScore >= 70 ? "green" : summary.avgWellbeingScore >= 55 ? "amber" : "red";
        return `<div class="swp-card" style="cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
            <div><div style="font-weight:700;">${cls.name}</div>
            <div style="font-size:0.8rem;color:var(--color-muted);">${cls.teacherName}</div></div>
            <span class="badge ${alertColor}">${summary.wellbeingRating}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;text-align:center;">
            <div><div style="font-weight:700;font-size:1.1rem;">${cls.studentCount}</div><div style="font-size:0.7rem;color:var(--color-muted);">Students</div></div>
            <div><div style="font-weight:700;font-size:1.1rem;color:var(--color-${alertColor==="red"?"danger":alertColor==="amber"?"warning":"success"});">${summary.avgWellbeingScore}</div><div style="font-size:0.7rem;color:var(--color-muted);">Wellbeing</div></div>
            <div><div style="font-weight:700;font-size:1.1rem;color:var(--color-danger);">${summary.alertBreakdown.red}</div><div style="font-size:0.7rem;color:var(--color-muted);">Red</div></div>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

function renderYearGroups(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🎓 Year Groups</div></div>
    </div>
    <div class="swp-tabs" id="yg-tabs">
      ${d.yearGroups.map((yg,i) => `<div class="swp-tab ${i===0?"active":""}" data-yg="${yg.id}">${yg.name}</div>`).join("")}
    </div>
    <div id="yg-content"></div>
  `;

  const renderYG = (ygId) => {
    const yg = d.yearGroups.find(y => y.id === ygId);
    const summary = generateYearGroupSummary(yg, d.students, d.checkIns, d.classes);
    const content = el.querySelector("#yg-content");
    content.innerHTML = `
      <div class="swp-stats-grid">
        <div class="swp-stat-card primary"><div class="swp-stat-card__label">Students</div><div class="swp-stat-card__value">${summary.totalStudents}</div></div>
        <div class="swp-stat-card danger"><div class="swp-stat-card__label">Needing Support</div><div class="swp-stat-card__value">${summary.studentsRequiringSupport}</div></div>
        <div class="swp-stat-card success"><div class="swp-stat-card__label">Avg Wellbeing</div><div class="swp-stat-card__value">${summary.avgWellbeingScore}</div></div>
        <div class="swp-stat-card warning"><div class="swp-stat-card__label">Avg Attendance</div><div class="swp-stat-card__value">${summary.avgAttendanceRate}%</div></div>
      </div>
      <div class="swp-card">
        <div class="swp-card__title">📊 Classes in ${yg.name}</div>
        <div class="swp-table-wrap"><table class="swp-table">
          <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Avg Wellbeing</th><th>Red</th><th>Amber</th><th>Status</th></tr></thead>
          <tbody>${summary.classSummaries.map(c => `<tr>
            <td><strong>${c.className}</strong></td>
            <td>${c.teacherName}</td>
            <td>${c.totalStudents}</td>
            <td><span class="badge ${c.avgWellbeingScore>=70?"green":c.avgWellbeingScore>=55?"amber":"red"}">${c.avgWellbeingScore}</span></td>
            <td style="color:var(--color-danger);font-weight:600;">${c.alertBreakdown.red}</td>
            <td style="color:var(--color-warning);font-weight:600;">${c.alertBreakdown.amber}</td>
            <td><span class="badge ${c.avgWellbeingScore>=70?"green":c.avgWellbeingScore>=55?"amber":"red"}">${c.wellbeingRating}</span></td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="swp-card">
        <div class="swp-card__title">⚠️ Year Group Concerns</div>
        ${summary.topConcerns.map(c => `<div style="padding:0.5rem 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;">• ${c}</div>`).join("")}
      </div>
    `;
  };

  el.querySelectorAll(".swp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      el.querySelectorAll(".swp-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderYG(tab.dataset.yg);
    });
  });

  renderYG(d.yearGroups[0].id);
}

function renderAlerts(el, d) {
  const redStudents   = d.students.filter(s => s.alertLevel === "red");
  const amberStudents = d.students.filter(s => s.alertLevel === "amber");

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🔔 Alerts</div>
      <div class="swp-page-subtitle">${redStudents.length} red · ${amberStudents.length} amber · requires triage</div></div>
    </div>
    <div class="swp-tabs" id="alert-tabs">
      <div class="swp-tab active" data-level="red">🔴 Red (${redStudents.length})</div>
      <div class="swp-tab" data-level="amber">🟡 Amber (${amberStudents.length})</div>
      <div class="swp-tab" data-level="all">All</div>
    </div>
    <div id="alert-content"></div>
  `;

  const renderAlertList = (level) => {
    const students = level === "all" ? d.students.filter(s => s.alertLevel !== "green")
      : d.students.filter(s => s.alertLevel === level);
    const content = el.querySelector("#alert-content");
    content.innerHTML = `
      <div class="swp-table-wrap">
        <table class="swp-table">
          <thead><tr><th>Student</th><th>Year</th><th>Alert Level</th><th>Wellbeing</th><th>Attendance</th><th>Last Check-In</th><th>Actions</th></tr></thead>
          <tbody>
            ${students.map(s => `<tr>
              <td><strong>${s.fullName}</strong></td>
              <td>${s.yearGroupName}</td>
              <td><span class="badge ${s.alertLevel}">${s.alertLevel === "red" ? "🔴" : "🟡"} ${s.alertLevel}</span></td>
              <td>${s.wellbeingScore.toFixed(0)}/100</td>
              <td><span class="badge ${s.attendanceRate>=90?"green":"red"}">${s.attendanceRate.toFixed(1)}%</span></td>
              <td>${s.lastCheckIn || "—"}</td>
              <td><button class="swp-btn primary sm">View</button> <button class="swp-btn secondary sm">Intervene</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  el.querySelectorAll(".swp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      el.querySelectorAll(".swp-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderAlertList(tab.dataset.level);
    });
  });

  renderAlertList("red");
}

function renderInterventions(el, d) {
  const report = generateInterventionReport({ interventions: d.interventions, students: d.students });

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🤝 Interventions</div>
      <div class="swp-page-subtitle">${report.totalInterventions} total · ${report.active} active · ${report.completionRate} completion rate</div></div>
      <button class="swp-btn primary sm">+ New Intervention</button>
    </div>
    <div class="swp-stats-grid">
      <div class="swp-stat-card primary"><div class="swp-stat-card__label">Total</div><div class="swp-stat-card__value">${report.totalInterventions}</div></div>
      <div class="swp-stat-card warning"><div class="swp-stat-card__label">Active</div><div class="swp-stat-card__value">${report.active}</div></div>
      <div class="swp-stat-card"><div class="swp-stat-card__label">Planned</div><div class="swp-stat-card__value">${report.planned}</div></div>
      <div class="swp-stat-card success"><div class="swp-stat-card__label">Completed</div><div class="swp-stat-card__value">${report.completed}</div></div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📋 Recent Interventions</div>
      <div class="swp-table-wrap"><table class="swp-table">
        <thead><tr><th>Student</th><th>Type</th><th>Priority</th><th>Status</th><th>Created</th><th>Outcome</th></tr></thead>
        <tbody>
          ${report.recentInterventions.map(i => `<tr>
            <td><strong>${i.studentName}</strong></td>
            <td style="font-size:0.8rem;">${i.type}</td>
            <td><span class="badge ${i.priority==="high"?"red":"amber"}">${i.priority}</span></td>
            <td><span class="badge ${i.status==="completed"?"green":i.status==="active"?"blue":"gray"}">${i.status}</span></td>
            <td>${i.createdDate}</td>
            <td style="font-size:0.8rem;color:var(--color-muted);">${i.outcome || "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📊 Intervention Types</div>
      <div class="swp-table-wrap"><table class="swp-table">
        <thead><tr><th>Type</th><th>Count</th></tr></thead>
        <tbody>${Object.entries(report.typeBreakdown).sort((a,b)=>b[1]-a[1]).map(([type,count]) =>
          `<tr><td>${type}</td><td><strong>${count}</strong></td></tr>`).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderSupportRequests(el, d) {
  const report = generateSupportRequestReport({ supportRequests: d.supportRequests });

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">💬 Support Requests</div>
      <div class="swp-page-subtitle">${report.open} open · ${report.urgentOpenCount} urgent · ${report.resolutionRate} resolved</div></div>
    </div>
    <div class="swp-stats-grid">
      <div class="swp-stat-card danger"><div class="swp-stat-card__label">Open</div><div class="swp-stat-card__value">${report.open}</div></div>
      <div class="swp-stat-card warning"><div class="swp-stat-card__label">In Progress</div><div class="swp-stat-card__value">${report.inProgress}</div></div>
      <div class="swp-stat-card success"><div class="swp-stat-card__label">Resolved</div><div class="swp-stat-card__value">${report.resolved}</div></div>
      <div class="swp-stat-card danger"><div class="swp-stat-card__label">Urgent Open</div><div class="swp-stat-card__value">${report.urgentOpenCount}</div></div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📋 Open Requests</div>
      <div class="swp-table-wrap"><table class="swp-table">
        <thead><tr><th>Student</th><th>Category</th><th>Urgency</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${d.supportRequests.filter(r=>r.status==="open").slice(0,20).map(r => `<tr>
            <td><strong>${r.studentName}</strong></td>
            <td>${r.category}</td>
            <td><span class="badge ${r.urgency==="urgent"?"red":r.urgency==="high"?"amber":"gray"}">${r.urgency}</span></td>
            <td><span class="badge gray">${r.status}</span></td>
            <td>${r.createdDate}</td>
            <td><button class="swp-btn primary sm">Assign</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderReports(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">📋 Reports</div>
      <div class="swp-page-subtitle">Generate and export wellbeing reports</div></div>
    </div>
    <div class="swp-grid-2" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      ${REPORT_CATALOGUE.map(r => `
        <div class="swp-card" style="cursor:pointer;" data-report="${r.id}">
          <div style="font-size:2rem;margin-bottom:0.5rem;">${r.icon}</div>
          <div style="font-weight:700;margin-bottom:0.375rem;">${r.name}</div>
          <div style="font-size:0.8rem;color:var(--color-muted);margin-bottom:0.875rem;">${r.description}</div>
          <div style="display:flex;gap:0.375rem;flex-wrap:wrap;">
            ${r.format.map(f => `<span class="badge blue">${f.toUpperCase()}</span>`).join("")}
            <span class="badge gray">${r.scope}</span>
          </div>
          <button class="swp-btn primary sm" style="margin-top:0.75rem;width:100%;" data-report="${r.id}">Generate Report</button>
        </div>
      `).join("")}
    </div>
    <div id="report-output"></div>
  `;

  el.querySelectorAll("[data-report]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const rType = e.currentTarget.dataset.report;
      _generateReportPreview(rType, d, el.querySelector("#report-output"));
    });
  });
}

function _generateReportPreview(type, d, container) {
  let report;
  try {
    if (type === "school_wellbeing") {
      report = generateSchoolWellbeingReport({ ...d, YEAR_GROUPS: d.yearGroups });
    } else if (type === "engagement") {
      report = generateEngagementReport(d);
    } else if (type === "intervention") {
      report = generateInterventionReport(d);
    } else if (type === "support_request") {
      report = generateSupportRequestReport(d);
    } else if (type === "attendance_correlation") {
      report = generateAttendanceCorrelationReport(d);
    } else {
      report = { reportTitle: "Report Generated", generatedAt: new Date().toISOString(), message: "Full data available" };
    }
  } catch(e) { report = { reportTitle: "Error", error: e.message }; }

  container.innerHTML = `
    <div class="swp-card" style="margin-top:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <div class="swp-card__title">📄 ${report.reportTitle}</div>
        <div style="display:flex;gap:0.5rem;">
          <button class="swp-btn secondary sm">📥 Export PDF</button>
          <button class="swp-btn secondary sm">📊 Export CSV</button>
        </div>
      </div>
      <div style="font-size:0.8rem;color:var(--color-muted);margin-bottom:1rem;">Generated: ${new Date(report.generatedAt).toLocaleString("en-GB")}</div>
      <pre style="background:var(--color-bg);padding:1rem;border-radius:8px;font-size:0.75rem;overflow:auto;max-height:400px;white-space:pre-wrap;">${JSON.stringify(report, null, 2)}</pre>
    </div>
  `;
}

function renderAIAnalysis(el, d) {
  const overview = generateSchoolOverview(d.students, d.checkIns, d.interventions, d.supportRequests);
  const stressTrends = analyseStressTrends(d.checkIns, "week").slice(-12);
  const attendanceCorr = correlateAttendanceWellbeing(d.students);

  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🤖 AI Wellbeing Analysis</div>
      <div class="swp-page-subtitle">Pattern analysis based on self-reported data and attendance records</div></div>
    </div>
    <div class="swp-ai-card" style="border-color:var(--color-warning);background:rgba(246,173,85,0.06);">
      <div class="swp-ai-card__header" style="color:var(--color-warning);">⚠️ Important Disclaimer</div>
      <div class="swp-ai-card__text">All insights below are based on trends in self-reported data and attendance records only. They do not constitute clinical assessments, diagnoses, or safeguarding referrals. Professional judgement must be applied at all times.</div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">🏫 School Wellbeing Summary</div>
      <div class="swp-ai-card">
        <div class="swp-ai-card__header">🤖 AI Summary</div>
        <div class="swp-ai-card__text">
          The school has <strong>${overview.totalStudents}</strong> students. <strong>${overview.redAlerts}</strong> students (${((overview.redAlerts/overview.totalStudents)*100).toFixed(1)}%) show red wellbeing indicators and <strong>${overview.amberAlerts}</strong> (${((overview.amberAlerts/overview.totalStudents)*100).toFixed(1)}%) amber. 
          The average wellbeing score across the school is <strong>${overview.avgWellbeingScore}/100</strong> — rated <strong>${overview.wellbeingRating}</strong>. 
          Check-in engagement is <strong>${overview.checkInEngagementRate}%</strong> for the past week. 
          ${overview.persistentAbsenceCount} students (${overview.persistentAbsenceRate}%) fall below the 90% attendance threshold.
        </div>
      </div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📉 Stress Trend Analysis</div>
      ${_renderMiniChart(stressTrends.map(t => t.avgStress * 20), 100, "warning")}
      <div style="margin-top:1rem;">
        <div class="swp-ai-card">
          <div class="swp-ai-card__header">🤖 Stress Insight</div>
          <div class="swp-ai-card__text">
            Average reported stress across the school is <strong>${(stressTrends.reduce((s,t)=>s+t.avgStress,0)/stressTrends.length).toFixed(2)}/5</strong> over the analysis period.
            ${stressTrends[stressTrends.length-1]?.avgStress > stressTrends[0]?.avgStress ? "There is an upward trend in stress levels — consider a school-wide wellbeing initiative." : "Stress levels appear stable or declining."}
          </div>
        </div>
      </div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📅 Attendance & Wellbeing Correlation</div>
      <div class="swp-table-wrap"><table class="swp-table">
        <thead><tr><th>Attendance Range</th><th>Students</th><th>Avg Wellbeing</th><th>Avg Engagement</th></tr></thead>
        <tbody>${attendanceCorr.map(c => `<tr>
          <td><strong>${c.attendanceRange}</strong></td>
          <td>${c.count}</td>
          <td>${c.avgWellbeing !== null ? `<span class="badge ${c.avgWellbeing>=70?"green":c.avgWellbeing>=55?"amber":"red"}">${c.avgWellbeing}</span>` : "—"}</td>
          <td>${c.avgEngagement !== null ? c.avgEngagement : "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <div class="swp-ai-card" style="margin-top:1rem;">
        <div class="swp-ai-card__header">🤖 Attendance Insight</div>
        <div class="swp-ai-card__text">Students with attendance below 80% show notably lower average wellbeing scores, suggesting a correlation between attendance and self-reported wellbeing. Early attendance interventions may support broader wellbeing outcomes.</div>
        <div class="swp-ai-card__disclaimer">Correlation does not imply causation. No causal claims are made.</div>
      </div>
    </div>
  `;
}

function renderSafeguarding(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">🔒 Safeguarding</div>
      <div class="swp-page-subtitle">Restricted to Safeguarding Officers and School Admin</div></div>
    </div>
    <div class="swp-card">
      <div class="swp-card__title">📋 Record a Concern</div>
      <div class="swp-form-group">
        <label class="swp-label">Student</label>
        <select class="swp-select"><option>Select student...</option>${d.students.slice(0,20).map(s=>`<option>${s.fullName}</option>`).join("")}</select>
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Nature of Concern</label>
        <select class="swp-select">
          <option>Emotional Wellbeing</option>
          <option>Physical Wellbeing</option>
          <option>Neglect</option>
          <option>Abuse - Suspected</option>
          <option>Online Safety</option>
          <option>Domestic Violence (exposure)</option>
          <option>Other</option>
        </select>
      </div>
      <div class="swp-form-group">
        <label class="swp-label">Details</label>
        <textarea class="swp-textarea" placeholder="Record factual observations only. Date, time, what was seen/heard..." style="min-height:120px;"></textarea>
      </div>
      <div style="display:flex;gap:0.75rem;">
        <button class="swp-btn primary">Record Concern</button>
        <button class="swp-btn danger">Escalate Immediately</button>
      </div>
    </div>
    <div class="swp-ai-card" style="border-color:var(--color-danger);background:rgba(229,62,62,0.04);">
      <div class="swp-ai-card__header" style="color:var(--color-danger);">🔒 Data Protection Notice</div>
      <div class="swp-ai-card__text">All records in this section are governed by statutory safeguarding guidance. Access is restricted to designated safeguarding leads and senior leadership. All entries are fully audited.</div>
    </div>
  `;
}

function renderSettings(el, d) {
  el.innerHTML = `
    <div class="swp-page-header">
      <div><div class="swp-page-title">⚙️ Settings</div></div>
    </div>
    <div class="swp-tabs">
      <div class="swp-tab active">🏫 School</div>
      <div class="swp-tab">🔔 Alerts</div>
      <div class="swp-tab">👥 Users</div>
      <div class="swp-tab">🎨 Branding</div>
    </div>
    <div class="swp-card" style="max-width:600px;">
      <div class="swp-card__title">🏫 School Settings</div>
      <div class="swp-form-group"><label class="swp-label">School Name</label><input class="swp-input" value="Westfield Academy"></div>
      <div class="swp-form-group"><label class="swp-label">URN</label><input class="swp-input" value="123456"></div>
      <div class="swp-form-group"><label class="swp-label">Phase</label><select class="swp-select"><option>Secondary</option><option>Primary</option><option>College</option><option>University</option><option>Multi Academy Trust</option></select></div>
      <div class="swp-form-group"><label class="swp-label">Designated Safeguarding Lead Email</label><input class="swp-input" type="email" value="dsl@school.edu"></div>
      <button class="swp-btn primary">Save Settings</button>
    </div>
  `;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _renderMiniChart(values, max, colorClass) {
  if (!values.length) return `<div class="swp-chart"><div style="color:var(--color-muted);font-size:0.8rem;margin:auto;">No data</div></div>`;
  const maxVal = max || Math.max(...values) || 1;
  return `<div class="swp-chart">${values.map(v => {
    const pct = Math.max(4, (v / maxVal) * 100);
    return `<div class="swp-bar ${colorClass}" style="height:${pct}%;" title="${v}"></div>`;
  }).join("")}</div>`;
}

function _renderAlertDonut(red, amber, green) {
  const total = red + amber + green || 1;
  const rPct = ((red/total)*100).toFixed(1);
  const aPct = ((amber/total)*100).toFixed(1);
  const gPct = ((green/total)*100).toFixed(1);
  return `
    <div style="display:flex;gap:1.5rem;align-items:center;">
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.25rem;"><span>🔴 Red</span><span>${red} (${rPct}%)</span></div>
        <div class="swp-progress-bar" style="margin-bottom:0.5rem;"><div class="swp-progress-bar__fill" style="width:${rPct}%;background:var(--color-danger);"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.25rem;"><span>🟡 Amber</span><span>${amber} (${aPct}%)</span></div>
        <div class="swp-progress-bar" style="margin-bottom:0.5rem;"><div class="swp-progress-bar__fill" style="width:${aPct}%;background:var(--color-warning);"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.25rem;"><span>🟢 Green</span><span>${green} (${gPct}%)</span></div>
        <div class="swp-progress-bar"><div class="swp-progress-bar__fill" style="width:${gPct}%;background:var(--color-success);"></div></div>
      </div>
    </div>
  `;
}

function _el(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function _roleLabel(role) {
  return {
    school_admin:         "School Admin",
    safeguarding_officer: "Safeguarding Officer",
    pastoral_lead:        "Pastoral Lead",
    teacher:              "Teacher",
    student:              "Student"
  }[role] || role;
}

function _moduleLabel(name) {
  return {
    StudentDashboard: "Dashboard", DailyCheckIn: "Daily Check-In",
    Goals: "Goals", StudyPlanner: "Study Planner", Journal: "Journal",
    SupportRequests: "Support", Resources: "Resources", Profile: "Profile",
    Overview: "Overview", Students: "Students", Classes: "Classes",
    YearGroups: "Year Groups", Alerts: "Alerts", Interventions: "Interventions",
    Reports: "Reports", AIAnalysis: "AI Analysis", Safeguarding: "Safeguarding",
    Settings: "Settings"
  }[name] || name;
}
