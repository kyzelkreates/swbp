// ═══════════════════════════════════════════════════════════════════════
// SWP — Student Welfare PWA
// ADDITIVE MODULE — does NOT modify swp-dashboard.js or any existing file
// Installs as separate student-facing PWA layer
// Storage: uses BCO localStorage adapter (same key namespace, swp_student_*)
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// STORAGE KEYS (BCO-compatible, prefixed)
// ─────────────────────────────────────────────

const KEYS = {
  PROFILE:     "swp_student_profile",
  ONBOARDING:  "swp_student_onboarding_complete",
  CHECKINS:    "swp_student_checkins",
  AI_INSIGHTS: "swp_student_ai_insights",
  ADMIN_FEED:  "swp_admin_ai_feed"
};

// ─────────────────────────────────────────────
// STORAGE HELPERS (wraps localStorage directly — BCO adapter compatible)
// ─────────────────────────────────────────────

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
}

function retrieve(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch(e) { return fallback; }
}

// ─────────────────────────────────────────────
// AI INSIGHT ENGINE (lightweight, additive)
// Generates insights from profile + check-in history
// Feeds into admin/safeguarding/teacher/pastoral dashboards
// ─────────────────────────────────────────────

export function runAIInsightLayer(profile, checkIns) {
  if (!profile || !checkIns?.length) return null;

  const recent = checkIns.slice(-5);
  const avgMood = recent.reduce((s, c) => s + c.moodScore, 0) / recent.length;
  const avgStress = recent.reduce((s, c) => s + c.stressScore, 0) / recent.length;
  const trend = checkIns.length >= 2
    ? (checkIns[checkIns.length - 1].moodScore - checkIns[checkIns.length - 2].moodScore > 0 ? "improving" : "stable")
    : "insufficient_data";

  const alerts = [];
  if (avgMood <= 2)   alerts.push({ level: "red",   type: "low_mood",    msg: `${profile.name} has reported low mood (avg ${avgMood.toFixed(1)}/5) over their last ${recent.length} check-ins.` });
  if (avgStress >= 4) alerts.push({ level: "red",   type: "high_stress", msg: `${profile.name} is reporting high stress levels (avg ${avgStress.toFixed(1)}/5).` });
  if (avgMood <= 2.5 && avgStress >= 3.5) alerts.push({ level: "amber", type: "combined_risk", msg: `${profile.name} shows combined low mood + elevated stress — consider pastoral check-in.` });
  if (profile.safeguardingFlag) alerts.push({ level: "amber", type: "safeguarding_disclosure", msg: `${profile.name} indicated a safeguarding concern during onboarding (self-disclosed).` });
  if (profile.supportNeed === "mental_health") alerts.push({ level: "amber", type: "support_need", msg: `${profile.name} indicated mental health support needs during onboarding.` });

  const recommendations = [];
  if (avgMood <= 2.5) recommendations.push("Consider a pastoral check-in conversation with this student.");
  if (avgStress >= 3.5) recommendations.push("Review academic workload or upcoming assessment pressure.");
  if (profile.preferredSupport === "pastoral") recommendations.push("Student prefers pastoral support — route requests to pastoral lead.");
  if (profile.preferredSupport === "teacher") recommendations.push("Student prefers to speak with their teacher — notify class teacher.");
  if (profile.safeguardingFlag) recommendations.push("Review safeguarding notes — student disclosed a concern during onboarding.");

  const insight = {
    studentName:     profile.name,
    yearGroup:       profile.yearGroup,
    generatedAt:     new Date().toISOString(),
    avgMood:         +avgMood.toFixed(2),
    avgStress:       +avgStress.toFixed(2),
    moodTrend:       trend,
    checkInCount:    checkIns.length,
    alerts,
    recommendations,
    summary: alerts.length
      ? `⚠️ ${alerts.length} alert(s) — ${alerts.map(a => a.type).join(", ")}`
      : `✅ No alerts — mood avg ${avgMood.toFixed(1)}/5, stress avg ${avgStress.toFixed(1)}/5`,
    aiDisclaimer: "Based on self-reported data only. Not a clinical assessment."
  };

  // Write to shared admin feed (additive — existing entries preserved)
  const feed = retrieve(KEYS.ADMIN_FEED, []);
  const idx = feed.findIndex(f => f.studentName === profile.name);
  if (idx >= 0) feed[idx] = insight; else feed.push(insight);
  store(KEYS.ADMIN_FEED, feed);

  // Store own insight
  store(KEYS.AI_INSIGHTS, insight);
  return insight;
}

// ─────────────────────────────────────────────
// PWA CSS (injected into document head)
// ─────────────────────────────────────────────

const PWA_CSS = `
  :root {
    --pwa-primary: #2C7A7B;
    --pwa-secondary: #38A169;
    --pwa-warning: #D69E2E;
    --pwa-danger: #E53E3E;
    --pwa-bg: #F7FAFC;
    --pwa-card: #FFFFFF;
    --pwa-text: #1A202C;
    --pwa-muted: #718096;
    --pwa-border: #E2E8F0;
    --pwa-radius: 12px;
  }
  #swp-pwa-root * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; }
  #swp-pwa-root { min-height: 100vh; background: var(--pwa-bg); color: var(--pwa-text); }

  .pwa-screen { display: none; flex-direction: column; min-height: 100vh; }
  .pwa-screen.active { display: flex; }

  /* ONBOARDING */
  .pwa-onboard-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; }
  .pwa-onboard-card { background: var(--pwa-card); border-radius: var(--pwa-radius); padding: 2rem; width: 100%; max-width: 480px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .pwa-step-indicator { display: flex; gap: 0.375rem; justify-content: center; margin-bottom: 1.75rem; }
  .pwa-step-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pwa-border); transition: background 0.2s; }
  .pwa-step-dot.active { background: var(--pwa-primary); }
  .pwa-step-dot.done   { background: var(--pwa-secondary); }
  .pwa-step-title { font-size: 1.3rem; font-weight: 800; margin-bottom: 0.375rem; }
  .pwa-step-sub   { font-size: 0.875rem; color: var(--pwa-muted); margin-bottom: 1.5rem; line-height: 1.5; }
  .pwa-label  { display: block; font-size: 0.8rem; font-weight: 600; color: var(--pwa-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
  .pwa-input, .pwa-select, .pwa-textarea {
    width: 100%; padding: 0.7rem 0.875rem; border: 1.5px solid var(--pwa-border);
    border-radius: 8px; font-size: 0.925rem; background: var(--pwa-bg);
    color: var(--pwa-text); outline: none; transition: border 0.15s;
  }
  .pwa-input:focus, .pwa-select:focus, .pwa-textarea:focus { border-color: var(--pwa-primary); }
  .pwa-textarea { min-height: 90px; resize: vertical; }
  .pwa-form-group { margin-bottom: 1.1rem; }
  .pwa-optional { color: var(--pwa-muted); font-weight: 400; font-size: 0.8rem; }
  .pwa-mood-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem; }
  .pwa-mood-btn {
    flex: 1; min-width: 52px; padding: 0.6rem 0.3rem; border: 2px solid var(--pwa-border);
    border-radius: 8px; background: white; cursor: pointer; font-size: 1.4rem;
    text-align: center; transition: all 0.15s;
  }
  .pwa-mood-btn.selected { border-color: var(--pwa-primary); background: rgba(44,122,123,0.08); transform: scale(1.08); }
  .pwa-mood-label { font-size: 0.6rem; color: var(--pwa-muted); display: block; margin-top: 0.15rem; }
  .pwa-support-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .pwa-support-btn {
    padding: 0.75rem; border: 2px solid var(--pwa-border); border-radius: 8px;
    background: white; cursor: pointer; text-align: center; font-size: 0.825rem; transition: all 0.15s;
  }
  .pwa-support-btn.selected { border-color: var(--pwa-primary); background: rgba(44,122,123,0.08); }
  .pwa-support-icon { font-size: 1.5rem; display: block; margin-bottom: 0.25rem; }
  .pwa-nav-row { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  .pwa-btn {
    flex: 1; padding: 0.75rem 1.25rem; border: none; border-radius: 8px;
    font-size: 0.925rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .pwa-btn.primary { background: var(--pwa-primary); color: white; }
  .pwa-btn.primary:hover { background: #276A6B; }
  .pwa-btn.secondary { background: var(--pwa-border); color: var(--pwa-text); }
  .pwa-btn.skip { background: none; color: var(--pwa-muted); flex: 0; padding: 0.75rem; font-size: 0.8rem; }
  .pwa-error { color: var(--pwa-danger); font-size: 0.8rem; margin-top: 0.375rem; display: none; }
  .pwa-error.show { display: block; }
  .pwa-safe-box {
    background: rgba(229,62,62,0.05); border: 1.5px solid rgba(229,62,62,0.2);
    border-radius: 8px; padding: 0.875rem; margin-bottom: 1rem;
    font-size: 0.82rem; color: var(--pwa-text); line-height: 1.5;
  }
  .pwa-safe-box strong { color: var(--pwa-danger); }
  .pwa-progress-bar { height: 4px; background: var(--pwa-border); border-radius: 99px; margin-bottom: 1.5rem; }
  .pwa-progress-fill { height: 100%; background: var(--pwa-primary); border-radius: 99px; transition: width 0.3s; }

  /* DASHBOARD */
  .pwa-dash-header {
    background: var(--pwa-primary); color: white;
    padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem;
  }
  .pwa-dash-header__avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,255,255,0.25); display: flex; align-items: center;
    justify-content: center; font-size: 1.1rem; font-weight: 700;
  }
  .pwa-dash-header__name { font-weight: 700; font-size: 1rem; }
  .pwa-dash-header__sub  { font-size: 0.78rem; opacity: 0.8; }
  .pwa-dash-body { flex: 1; padding: 1.25rem; overflow-y: auto; }
  .pwa-dash-card {
    background: var(--pwa-card); border-radius: var(--pwa-radius);
    padding: 1.1rem; margin-bottom: 1rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .pwa-dash-card__title { font-size: 0.875rem; font-weight: 700; margin-bottom: 0.875rem; }
  .pwa-metric-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.625rem; margin-bottom: 1rem; }
  .pwa-metric { background: var(--pwa-card); border-radius: 10px; padding: 0.875rem 0.625rem; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .pwa-metric__val { font-size: 1.5rem; font-weight: 800; color: var(--pwa-primary); }
  .pwa-metric__lbl { font-size: 0.68rem; color: var(--pwa-muted); margin-top: 0.15rem; }
  .pwa-quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; margin-bottom: 1rem; }
  .pwa-action-btn {
    background: var(--pwa-card); border: 1.5px solid var(--pwa-border);
    border-radius: var(--pwa-radius); padding: 1rem; text-align: center;
    cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .pwa-action-btn:hover { border-color: var(--pwa-primary); background: rgba(44,122,123,0.04); }
  .pwa-action-icon { font-size: 1.75rem; display: block; margin-bottom: 0.375rem; }
  .pwa-action-label { font-size: 0.78rem; font-weight: 600; }
  .pwa-ai-insight {
    background: linear-gradient(135deg, rgba(44,122,123,0.06), rgba(56,161,105,0.06));
    border: 1.5px solid rgba(44,122,123,0.2); border-radius: var(--pwa-radius);
    padding: 1rem; margin-bottom: 1rem;
  }
  .pwa-ai-header { font-size: 0.8rem; font-weight: 700; color: var(--pwa-primary); margin-bottom: 0.375rem; }
  .pwa-ai-text   { font-size: 0.82rem; color: var(--pwa-text); line-height: 1.5; margin-bottom: 0.375rem; }
  .pwa-ai-disclaimer { font-size: 0.7rem; color: var(--pwa-muted); font-style: italic; }

  /* CHECKIN PANEL */
  .pwa-checkin-slider-wrap { margin-bottom: 1.25rem; }
  .pwa-slider-label { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.4rem; }
  .pwa-slider { width: 100%; -webkit-appearance: none; height: 6px; border-radius: 3px; background: var(--pwa-border); outline: none; }
  .pwa-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--pwa-primary); cursor: pointer; }
  .pwa-emoji-row { display: flex; justify-content: space-between; font-size: 1rem; margin-top: 0.25rem; }

  /* INSTALL BANNER */
  .pwa-install-banner {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 9000;
    background: var(--pwa-primary); color: white;
    padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.15);
    transform: translateY(0); transition: transform 0.3s;
  }
  .pwa-install-banner.hidden { transform: translateY(100%); }
  .pwa-install-banner__text { flex: 1; font-size: 0.875rem; }
  .pwa-install-banner__text strong { display: block; font-size: 0.95rem; }
  .pwa-install-banner__btn {
    background: white; color: var(--pwa-primary); border: none;
    border-radius: 8px; padding: 0.5rem 1rem; font-weight: 700;
    font-size: 0.875rem; cursor: pointer; white-space: nowrap;
  }
  .pwa-install-banner__dismiss { background: none; border: none; color: white; opacity: 0.7; cursor: pointer; font-size: 1.2rem; }
`;

// ─────────────────────────────────────────────
// ONBOARDING STEPS
// ─────────────────────────────────────────────

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to WellTrack 💚",
    sub: "This is your personal wellbeing space. Everything you share is private and supports your care at school.",
    required: false
  },
  {
    id: "name_year",
    title: "Let's get you set up",
    sub: "Just a few quick questions so we can personalise your experience.",
    required: true,
    fields: ["name", "yearGroup"]
  },
  {
    id: "wellbeing",
    title: "How are you feeling right now?",
    sub: "Pick the emoji that best matches your mood today.",
    required: false,
    fields: ["mood"]
  },
  {
    id: "support_needs",
    title: "Learning & support",
    sub: "This helps your school ensure you get the right support. All fields are optional.",
    required: false,
    fields: ["learningSupport", "preferredSupport"]
  },
  {
    id: "safeguarding",
    title: "Are you safe?",
    sub: "You don't have to share anything you're not comfortable with. This is optional and confidential.",
    required: false,
    fields: ["safeguardingFlag"]
  },
  {
    id: "complete",
    title: "All set! 🎉",
    sub: "Your profile has been created. Let's take you to your wellbeing dashboard.",
    required: false
  }
];

// ─────────────────────────────────────────────
// PWA STATE
// ─────────────────────────────────────────────

let _pwaState = {
  step: 0,
  profile: {
    name: "", yearGroup: "", mood: 3,
    learningSupport: [], preferredSupport: "teacher",
    safeguardingFlag: false, safeguardingNote: ""
  },
  checkIns: [],
  insight: null,
  activeView: "dashboard" // dashboard | checkin | support | resources
};

// ─────────────────────────────────────────────
// INIT — entry point
// ─────────────────────────────────────────────

export function initStudentPWA(mountEl) {
  // Inject CSS
  if (!document.getElementById("swp-pwa-css")) {
    const style = document.createElement("style");
    style.id = "swp-pwa-css";
    style.textContent = PWA_CSS;
    document.head.appendChild(style);
  }

  mountEl.innerHTML = `<div id="swp-pwa-root"></div>`;
  const root = mountEl.querySelector("#swp-pwa-root");

  // Load persisted data
  const savedProfile   = retrieve(KEYS.PROFILE);
  const onboardingDone = retrieve(KEYS.ONBOARDING, false);
  _pwaState.checkIns   = retrieve(KEYS.CHECKINS, []);

  if (onboardingDone && savedProfile) {
    _pwaState.profile = savedProfile;
    _pwaState.insight = runAIInsightLayer(savedProfile, _pwaState.checkIns);
    _renderDashboard(root);
  } else {
    _renderOnboarding(root);
  }

  _setupInstallBanner();
}

// ─────────────────────────────────────────────
// ONBOARDING RENDERER
// ─────────────────────────────────────────────

function _renderOnboarding(root) {
  root.innerHTML = `
    <div class="pwa-screen active" id="pwa-onboard-screen">
      <div class="pwa-onboard-wrap">
        <div class="pwa-onboard-card">
          <div class="pwa-progress-bar"><div class="pwa-progress-fill" id="pwa-progress" style="width:${((_pwaState.step+1)/STEPS.length)*100}%"></div></div>
          <div class="pwa-step-indicator" id="pwa-step-dots">
            ${STEPS.map((_,i) => `<div class="pwa-step-dot ${i === _pwaState.step ? "active" : i < _pwaState.step ? "done" : ""}"></div>`).join("")}
          </div>
          <div id="pwa-step-content"></div>
        </div>
      </div>
    </div>
  `;
  _renderStep(root);
}

function _renderStep(root) {
  const step = STEPS[_pwaState.step];
  const content = root.querySelector("#pwa-step-content");

  // Update progress
  const prog = root.querySelector("#pwa-progress");
  if (prog) prog.style.width = `${((_pwaState.step + 1) / STEPS.length) * 100}%`;
  root.querySelectorAll(".pwa-step-dot").forEach((dot, i) => {
    dot.className = "pwa-step-dot" + (i === _pwaState.step ? " active" : i < _pwaState.step ? " done" : "");
  });

  const isFirst = _pwaState.step === 0;
  const isLast  = _pwaState.step === STEPS.length - 1;
  const p = _pwaState.profile;

  let stepHTML = `<div class="pwa-step-title">${step.title}</div><div class="pwa-step-sub">${step.sub}</div>`;

  // --- STEP CONTENT ---
  if (step.id === "welcome") {
    stepHTML += `
      <div style="text-align:center;padding:1rem 0;">
        <div style="font-size:4rem;margin-bottom:1rem;">💚</div>
        <div style="font-size:0.875rem;color:var(--pwa-muted);line-height:1.6;">
          WellTrack helps your school support your wellbeing.<br>
          Check in daily, set goals, and get the right support when you need it.
        </div>
      </div>
    `;
  } else if (step.id === "name_year") {
    stepHTML += `
      <div class="pwa-form-group">
        <label class="pwa-label">Your first name</label>
        <input class="pwa-input" id="pwa-name" type="text" placeholder="e.g. Jamie" value="${p.name}" autocomplete="given-name">
        <div class="pwa-error" id="pwa-name-err">Please enter your name to continue.</div>
      </div>
      <div class="pwa-form-group">
        <label class="pwa-label">Year group <span class="pwa-optional">(optional)</span></label>
        <select class="pwa-select" id="pwa-year">
          <option value="">Prefer not to say</option>
          <option value="Year 7"  ${p.yearGroup==="Year 7" ?"selected":""}>Year 7</option>
          <option value="Year 8"  ${p.yearGroup==="Year 8" ?"selected":""}>Year 8</option>
          <option value="Year 9"  ${p.yearGroup==="Year 9" ?"selected":""}>Year 9</option>
          <option value="Year 10" ${p.yearGroup==="Year 10"?"selected":""}>Year 10</option>
          <option value="Year 11" ${p.yearGroup==="Year 11"?"selected":""}>Year 11</option>
          <option value="Year 12" ${p.yearGroup==="Year 12"?"selected":""}>Year 12</option>
          <option value="Year 13" ${p.yearGroup==="Year 13"?"selected":""}>Year 13</option>
        </select>
      </div>
    `;
  } else if (step.id === "wellbeing") {
    const moods = [
      { score: 1, emoji: "😔", label: "Very Low" },
      { score: 2, emoji: "😕", label: "Low" },
      { score: 3, emoji: "😐", label: "Okay" },
      { score: 4, emoji: "🙂", label: "Good" },
      { score: 5, emoji: "😊", label: "Great" }
    ];
    stepHTML += `
      <div class="pwa-form-group">
        <label class="pwa-label">How are you feeling?</label>
        <div class="pwa-mood-grid" id="pwa-mood-grid">
          ${moods.map(m => `
            <button class="pwa-mood-btn ${p.mood === m.score ? "selected" : ""}" data-score="${m.score}">
              ${m.emoji}<span class="pwa-mood-label">${m.label}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  } else if (step.id === "support_needs") {
    const supports = [
      { id: "teacher",  icon: "📚", label: "My Teacher" },
      { id: "pastoral", icon: "🤝", label: "Pastoral Team" },
      { id: "ai",       icon: "🤖", label: "AI Guidance" },
      { id: "peer",     icon: "👫", label: "Peer Support" }
    ];
    stepHTML += `
      <div class="pwa-form-group">
        <label class="pwa-label">Do you have any learning support needs? <span class="pwa-optional">(optional)</span></label>
        <select class="pwa-select" id="pwa-learning-support">
          <option value="">None / Prefer not to say</option>
          <option value="dyslexia"       ${p.learningSupport.includes("dyslexia")?"selected":""}>Dyslexia</option>
          <option value="adhd"           ${p.learningSupport.includes("adhd")?"selected":""}>ADHD</option>
          <option value="autism"         ${p.learningSupport.includes("autism")?"selected":""}>Autism</option>
          <option value="mental_health"  ${p.learningSupport.includes("mental_health")?"selected":""}>Mental Health</option>
          <option value="physical"       ${p.learningSupport.includes("physical")?"selected":""}>Physical / Medical</option>
          <option value="esl"            ${p.learningSupport.includes("esl")?"selected":""}>English as Second Language</option>
          <option value="other"          ${p.learningSupport.includes("other")?"selected":""}>Other</option>
        </select>
      </div>
      <div class="pwa-form-group">
        <label class="pwa-label">Who would you prefer to talk to for support? <span class="pwa-optional">(optional)</span></label>
        <div class="pwa-support-grid" id="pwa-support-grid">
          ${supports.map(s => `
            <button class="pwa-support-btn ${p.preferredSupport === s.id ? "selected" : ""}" data-id="${s.id}">
              <span class="pwa-support-icon">${s.icon}</span>${s.label}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  } else if (step.id === "safeguarding") {
    stepHTML += `
      <div class="pwa-safe-box">
        <strong>🔒 This is confidential.</strong> If you share something here, it will only be seen by your school's designated safeguarding lead — no one else. You don't have to share anything you're not ready to.
      </div>
      <div class="pwa-form-group">
        <label class="pwa-label">Are you worried about your safety or wellbeing right now? <span class="pwa-optional">(optional)</span></label>
        <div style="display:flex;gap:0.625rem;margin-top:0.25rem;">
          <button class="pwa-support-btn ${!p.safeguardingFlag?"selected":""}" id="pwa-safe-no"  style="flex:1;">✅ I'm okay</button>
          <button class="pwa-support-btn ${p.safeguardingFlag?"selected":""}"  id="pwa-safe-yes" style="flex:1;">⚠️ I have a concern</button>
        </div>
      </div>
      <div id="pwa-safe-note-wrap" style="display:${p.safeguardingFlag?"block":"none"};">
        <div class="pwa-form-group">
          <label class="pwa-label">Would you like to tell us more? <span class="pwa-optional">(optional)</span></label>
          <textarea class="pwa-textarea" id="pwa-safe-note" placeholder="Share as little or as much as you're comfortable with...">${p.safeguardingNote||""}</textarea>
        </div>
      </div>
      <div style="font-size:0.75rem;color:var(--pwa-muted);margin-top:0.5rem;">
        🆘 If you are in immediate danger, call <strong>999</strong>. Childline: <strong>0800 1111</strong>
      </div>
    `;
  } else if (step.id === "complete") {
    stepHTML += `
      <div style="text-align:center;padding:0.5rem 0 1rem;">
        <div style="font-size:3.5rem;margin-bottom:0.875rem;">🎉</div>
        <div style="font-size:0.925rem;color:var(--pwa-muted);line-height:1.6;">
          Welcome, <strong>${p.name || "there"}</strong>!<br>
          Your wellbeing profile is ready. You can check in daily, set goals, and request support whenever you need it.
        </div>
      </div>
    `;
  }

  // --- NAV BUTTONS ---
  const showSkip = !step.required && step.id !== "welcome" && step.id !== "complete";
  stepHTML += `
    <div class="pwa-nav-row">
      ${!isFirst ? `<button class="pwa-btn secondary" id="pwa-back">← Back</button>` : ""}
      ${showSkip ? `<button class="pwa-btn skip" id="pwa-skip">Skip</button>` : ""}
      <button class="pwa-btn primary" id="pwa-next" style="flex:2;">
        ${isLast ? "🚀 Go to Dashboard" : step.id === "welcome" ? "Get Started →" : "Continue →"}
      </button>
    </div>
    <div id="pwa-step-err" class="pwa-error"></div>
  `;

  content.innerHTML = stepHTML;

  // Wire up step-specific interactions
  if (step.id === "wellbeing") {
    content.querySelectorAll(".pwa-mood-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        content.querySelectorAll(".pwa-mood-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        _pwaState.profile.mood = parseInt(btn.dataset.score);
      });
    });
  }

  if (step.id === "support_needs") {
    content.querySelectorAll(".pwa-support-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        content.querySelectorAll(".pwa-support-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        _pwaState.profile.preferredSupport = btn.dataset.id;
      });
    });
  }

  if (step.id === "safeguarding") {
    content.querySelector("#pwa-safe-no")?.addEventListener("click", () => {
      content.querySelectorAll(".pwa-support-btn").forEach(b => b.classList.remove("selected"));
      content.querySelector("#pwa-safe-no").classList.add("selected");
      _pwaState.profile.safeguardingFlag = false;
      content.querySelector("#pwa-safe-note-wrap").style.display = "none";
    });
    content.querySelector("#pwa-safe-yes")?.addEventListener("click", () => {
      content.querySelectorAll(".pwa-support-btn").forEach(b => b.classList.remove("selected"));
      content.querySelector("#pwa-safe-yes").classList.add("selected");
      _pwaState.profile.safeguardingFlag = true;
      content.querySelector("#pwa-safe-note-wrap").style.display = "block";
    });
  }

  // Back
  content.querySelector("#pwa-back")?.addEventListener("click", () => {
    _pwaState.step = Math.max(0, _pwaState.step - 1);
    _renderStep(root);
  });

  // Skip
  content.querySelector("#pwa-skip")?.addEventListener("click", () => {
    _pwaState.step = Math.min(STEPS.length - 1, _pwaState.step + 1);
    _renderStep(root);
  });

  // Next / Complete
  content.querySelector("#pwa-next")?.addEventListener("click", () => {
    // Collect current step data
    if (step.id === "name_year") {
      const nameInput = content.querySelector("#pwa-name");
      const nameErr   = content.querySelector("#pwa-name-err");
      if (!nameInput.value.trim()) {
        nameErr.classList.add("show");
        nameInput.focus();
        return;
      }
      nameErr.classList.remove("show");
      _pwaState.profile.name      = nameInput.value.trim();
      _pwaState.profile.yearGroup = content.querySelector("#pwa-year")?.value || "";
    }
    if (step.id === "support_needs") {
      const ls = content.querySelector("#pwa-learning-support")?.value;
      _pwaState.profile.learningSupport = ls ? [ls] : [];
    }
    if (step.id === "safeguarding") {
      _pwaState.profile.safeguardingNote = content.querySelector("#pwa-safe-note")?.value || "";
    }

    if (isLast) {
      // Persist profile & mark onboarding done
      store(KEYS.PROFILE,    _pwaState.profile);
      store(KEYS.ONBOARDING, true);
      _pwaState.insight = runAIInsightLayer(_pwaState.profile, _pwaState.checkIns);
      _renderDashboard(root);
    } else {
      _pwaState.step++;
      _renderStep(root);
    }
  });
}

// ─────────────────────────────────────────────
// STUDENT WELFARE DASHBOARD
// ─────────────────────────────────────────────

function _renderDashboard(root) {
  const p  = _pwaState.profile;
  const ci = _pwaState.checkIns;
  const insight = _pwaState.insight;
  const recentCI = ci.slice(-1)[0];
  const avgMood  = ci.length ? (ci.slice(-5).reduce((s,c) => s + c.moodScore, 0) / Math.min(5, ci.length)).toFixed(1) : "—";

  root.innerHTML = `
    <div class="pwa-screen active" id="pwa-dash-screen">
      <div class="pwa-dash-header">
        <div class="pwa-dash-header__avatar">${p.name?.[0]?.toUpperCase() || "S"}</div>
        <div>
          <div class="pwa-dash-header__name">Hi ${p.name || "there"} 👋</div>
          <div class="pwa-dash-header__sub">${p.yearGroup || "Student"} · WellTrack</div>
        </div>
        <div style="margin-left:auto;font-size:0.75rem;opacity:0.8;">${new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>
      </div>

      <div class="pwa-dash-body" id="pwa-dash-body">
        <div class="pwa-metric-row">
          <div class="pwa-metric">
            <div class="pwa-metric__val">${recentCI ? ["😔","😕","😐","🙂","😊"][recentCI.moodScore-1] : "—"}</div>
            <div class="pwa-metric__lbl">Today's Mood</div>
          </div>
          <div class="pwa-metric">
            <div class="pwa-metric__val" style="font-size:1.2rem;">${avgMood}</div>
            <div class="pwa-metric__lbl">Avg Mood (5d)</div>
          </div>
          <div class="pwa-metric">
            <div class="pwa-metric__val">${ci.length}</div>
            <div class="pwa-metric__lbl">Check-Ins</div>
          </div>
        </div>

        ${insight ? `
          <div class="pwa-ai-insight">
            <div class="pwa-ai-header">🤖 Your Wellbeing Insight</div>
            <div class="pwa-ai-text">${insight.summary}</div>
            ${insight.recommendations.length ? `<div class="pwa-ai-text" style="margin-top:0.375rem;">💡 ${insight.recommendations[0]}</div>` : ""}
            <div class="pwa-ai-disclaimer">${insight.aiDisclaimer}</div>
          </div>
        ` : `
          <div class="pwa-ai-insight">
            <div class="pwa-ai-header">🤖 Wellbeing Insight</div>
            <div class="pwa-ai-text">Complete a daily check-in to start receiving personalised insights.</div>
          </div>
        `}

        <div class="pwa-quick-actions">
          <div class="pwa-action-btn" id="pwa-do-checkin">
            <span class="pwa-action-icon">✅</span>
            <span class="pwa-action-label">Daily Check-In</span>
          </div>
          <div class="pwa-action-btn" id="pwa-do-support">
            <span class="pwa-action-icon">💬</span>
            <span class="pwa-action-label">Request Support</span>
          </div>
          <div class="pwa-action-btn" id="pwa-do-resources">
            <span class="pwa-action-icon">🌐</span>
            <span class="pwa-action-label">Resources</span>
          </div>
          <div class="pwa-action-btn" id="pwa-do-profile">
            <span class="pwa-action-icon">👤</span>
            <span class="pwa-action-label">My Profile</span>
          </div>
        </div>

        <div class="pwa-dash-card" id="pwa-panel-content">
          <div class="pwa-dash-card__title">📋 Recent Activity</div>
          ${ci.length ? ci.slice(-3).reverse().map(c => `
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--pwa-border);font-size:0.825rem;">
              <span>${c.date}</span>
              <span>${["😔","😕","😐","🙂","😊"][c.moodScore-1]} Mood: ${c.moodScore}/5 · Stress: ${c.stressScore}/5</span>
            </div>
          `).join("") : `<div style="font-size:0.825rem;color:var(--pwa-muted);">No check-ins yet — complete your first one above!</div>`}
        </div>

        ${p.safeguardingFlag ? `
          <div style="background:rgba(229,62,62,0.06);border:1.5px solid rgba(229,62,62,0.2);border-radius:var(--pwa-radius);padding:0.875rem;font-size:0.82rem;line-height:1.5;">
            <strong style="color:var(--pwa-danger);">🔒 Safeguarding Note</strong><br>
            Your safeguarding concern has been noted. A member of staff will follow up with you. If you need immediate help, contact Childline on <strong>0800 1111</strong>.
          </div>
        ` : ""}
      </div>
    </div>
  `;

  // Wire quick action buttons
  root.querySelector("#pwa-do-checkin")?.addEventListener("click", () => _renderCheckIn(root));
  root.querySelector("#pwa-do-support")?.addEventListener("click", () => _renderSupportRequest(root));
  root.querySelector("#pwa-do-resources")?.addEventListener("click", () => _renderResourcesPanel(root));
  root.querySelector("#pwa-do-profile")?.addEventListener("click", () => _renderProfilePanel(root));
}

// ─────────────────────────────────────────────
// INLINE CHECK-IN PANEL (replaces pwa-panel-content)
// ─────────────────────────────────────────────

function _renderCheckIn(root) {
  const panel = root.querySelector("#pwa-panel-content");
  if (!panel) return;

  let draft = { moodScore: 3, stressScore: 3, energyScore: 3 };
  const moodEmojis   = ["😔","😕","😐","🙂","😊"];
  const stressEmojis = ["😌","🙂","😐","😟","😰"];

  panel.innerHTML = `
    <div class="pwa-dash-card__title">✅ Daily Check-In</div>
    <div class="pwa-checkin-slider-wrap">
      <div class="pwa-slider-label"><span>Mood</span><span id="ci-mood-val">${moodEmojis[draft.moodScore-1]}</span></div>
      <input type="range" class="pwa-slider" id="ci-mood" min="1" max="5" value="${draft.moodScore}">
      <div class="pwa-emoji-row"><span>😔</span><span>😕</span><span>😐</span><span>🙂</span><span>😊</span></div>
    </div>
    <div class="pwa-checkin-slider-wrap">
      <div class="pwa-slider-label"><span>Stress</span><span id="ci-stress-val">${stressEmojis[draft.stressScore-1]}</span></div>
      <input type="range" class="pwa-slider" id="ci-stress" min="1" max="5" value="${draft.stressScore}">
      <div class="pwa-emoji-row"><span>😌</span><span>🙂</span><span>😐</span><span>😟</span><span>😰</span></div>
    </div>
    <div class="pwa-checkin-slider-wrap">
      <div class="pwa-slider-label"><span>Energy</span><span id="ci-energy-val">${draft.energyScore}/5</span></div>
      <input type="range" class="pwa-slider" id="ci-energy" min="1" max="5" value="${draft.energyScore}">
    </div>
    <div class="pwa-form-group" style="margin-top:0.75rem;">
      <label class="pwa-label">Anything to share? <span class="pwa-optional">(optional, private)</span></label>
      <textarea class="pwa-textarea" id="ci-note" placeholder="How's your day going..."></textarea>
    </div>
    <div id="ci-msg"></div>
    <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
      <button class="pwa-btn secondary" id="ci-cancel">Cancel</button>
      <button class="pwa-btn primary" id="ci-submit" style="flex:2;">Submit Check-In ✅</button>
    </div>
  `;

  panel.querySelector("#ci-mood")?.addEventListener("input", e => {
    draft.moodScore = parseInt(e.target.value);
    panel.querySelector("#ci-mood-val").textContent = moodEmojis[draft.moodScore - 1];
  });
  panel.querySelector("#ci-stress")?.addEventListener("input", e => {
    draft.stressScore = parseInt(e.target.value);
    panel.querySelector("#ci-stress-val").textContent = stressEmojis[draft.stressScore - 1];
  });
  panel.querySelector("#ci-energy")?.addEventListener("input", e => {
    draft.energyScore = parseInt(e.target.value);
    panel.querySelector("#ci-energy-val").textContent = `${draft.energyScore}/5`;
  });
  panel.querySelector("#ci-cancel")?.addEventListener("click", () => _renderDashboard(root));
  panel.querySelector("#ci-submit")?.addEventListener("click", () => {
    const note = panel.querySelector("#ci-note")?.value || "";
    const entry = {
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      moodScore: draft.moodScore,
      stressScore: draft.stressScore,
      energyScore: draft.energyScore,
      note
    };
    _pwaState.checkIns.push(entry);
    store(KEYS.CHECKINS, _pwaState.checkIns);
    _pwaState.insight = runAIInsightLayer(_pwaState.profile, _pwaState.checkIns);
    panel.querySelector("#ci-msg").innerHTML = `<div style="background:rgba(56,161,105,0.1);border:1.5px solid var(--pwa-secondary);border-radius:8px;padding:0.75rem;font-size:0.82rem;color:var(--pwa-secondary);font-weight:600;margin-bottom:0.5rem;">✅ Check-in saved! Returning to dashboard...</div>`;
    setTimeout(() => _renderDashboard(root), 1400);
  });
}

function _renderSupportRequest(root) {
  const panel = root.querySelector("#pwa-panel-content");
  if (!panel) return;
  const categories = ["Academic Support","Mental Health","Bullying","Family Issues","Exam Anxiety","Friendship Issues","Safeguarding Concern","Other"];

  panel.innerHTML = `
    <div class="pwa-dash-card__title">💬 Request Support</div>
    <div class="pwa-form-group">
      <label class="pwa-label">What do you need help with?</label>
      <select class="pwa-select" id="sr-cat">${categories.map(c=>`<option>${c}</option>`).join("")}</select>
    </div>
    <div class="pwa-form-group">
      <label class="pwa-label">Details <span class="pwa-optional">(optional)</span></label>
      <textarea class="pwa-textarea" id="sr-detail" placeholder="Share as much or as little as you like..."></textarea>
    </div>
    <div id="sr-msg"></div>
    <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
      <button class="pwa-btn secondary" id="sr-cancel">Cancel</button>
      <button class="pwa-btn primary" id="sr-submit" style="flex:2;">Send Request 💬</button>
    </div>
  `;
  panel.querySelector("#sr-cancel")?.addEventListener("click", () => _renderDashboard(root));
  panel.querySelector("#sr-submit")?.addEventListener("click", () => {
    const requests = retrieve("swp_student_support_requests", []);
    requests.push({ id: `SR${Date.now()}`, studentName: _pwaState.profile.name, category: panel.querySelector("#sr-cat").value, detail: panel.querySelector("#sr-detail").value, date: new Date().toISOString(), status: "open" });
    store("swp_student_support_requests", requests);
    panel.querySelector("#sr-msg").innerHTML = `<div style="background:rgba(56,161,105,0.1);border:1.5px solid var(--pwa-secondary);border-radius:8px;padding:0.75rem;font-size:0.82rem;color:var(--pwa-secondary);font-weight:600;margin-bottom:0.5rem;">✅ Request sent to your pastoral team.</div>`;
    setTimeout(() => _renderDashboard(root), 1400);
  });
}

function _renderResourcesPanel(root) {
  const panel = root.querySelector("#pwa-panel-content");
  if (!panel) return;
  const resources = [
    { icon:"🧠", title:"Mental Health", items:["Understanding anxiety","Dealing with low mood","Mindfulness exercises","Sleep hygiene tips"] },
    { icon:"📚", title:"Academic",      items:["Exam revision tips","Managing pressure","Study skills","Asking for help"] },
    { icon:"👫", title:"Friendships",   items:["Dealing with friendship issues","What is bullying?","Online safety"] },
    { icon:"🆘", title:"Crisis Lines",  items:["Childline: 0800 1111","Samaritans: 116 123","Crisis Text: 85258","Shout: text SHOUT to 85258"] }
  ];
  panel.innerHTML = `
    <div class="pwa-dash-card__title">🌐 Resources & Support</div>
    ${resources.map(r => `
      <div style="margin-bottom:0.875rem;">
        <div style="font-weight:700;margin-bottom:0.375rem;">${r.icon} ${r.title}</div>
        ${r.items.map(i => `<div style="font-size:0.8rem;color:var(--pwa-muted);padding:0.2rem 0;border-bottom:1px solid var(--pwa-border);">${i}</div>`).join("")}
      </div>
    `).join("")}
    <button class="pwa-btn secondary" id="res-back" style="margin-top:0.75rem;">← Back</button>
  `;
  panel.querySelector("#res-back")?.addEventListener("click", () => _renderDashboard(root));
}

function _renderProfilePanel(root) {
  const panel = root.querySelector("#pwa-panel-content");
  const p = _pwaState.profile;
  if (!panel) return;
  panel.innerHTML = `
    <div class="pwa-dash-card__title">👤 My Profile</div>
    <div style="font-size:0.875rem;">
      <div style="padding:0.4rem 0;border-bottom:1px solid var(--pwa-border);"><strong>Name:</strong> ${p.name}</div>
      <div style="padding:0.4rem 0;border-bottom:1px solid var(--pwa-border);"><strong>Year Group:</strong> ${p.yearGroup || "Not set"}</div>
      <div style="padding:0.4rem 0;border-bottom:1px solid var(--pwa-border);"><strong>Preferred Support:</strong> ${p.preferredSupport}</div>
      <div style="padding:0.4rem 0;border-bottom:1px solid var(--pwa-border);"><strong>Total Check-Ins:</strong> ${_pwaState.checkIns.length}</div>
    </div>
    <button class="pwa-btn secondary" id="prof-back" style="margin-top:0.875rem;width:100%;">← Back</button>
    <button class="pwa-btn secondary" id="prof-reset" style="margin-top:0.5rem;width:100%;color:var(--pwa-danger);">Reset & restart onboarding</button>
  `;
  panel.querySelector("#prof-back")?.addEventListener("click", () => _renderDashboard(root));
  panel.querySelector("#prof-reset")?.addEventListener("click", () => {
    if (confirm("This will clear your profile and restart onboarding. Are you sure?")) {
      localStorage.removeItem(KEYS.PROFILE);
      localStorage.removeItem(KEYS.ONBOARDING);
      localStorage.removeItem(KEYS.CHECKINS);
      localStorage.removeItem(KEYS.AI_INSIGHTS);
      _pwaState = { step: 0, profile: { name:"", yearGroup:"", mood:3, learningSupport:[], preferredSupport:"teacher", safeguardingFlag:false, safeguardingNote:"" }, checkIns: [], insight: null };
      _renderOnboarding(root);
    }
  });
}

// ─────────────────────────────────────────────
// PWA INSTALL BANNER
// ─────────────────────────────────────────────

function _setupInstallBanner() {
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const banner = document.createElement("div");
    banner.className = "pwa-install-banner";
    banner.id = "pwa-install-banner";
    banner.innerHTML = `
      <span style="font-size:1.5rem;">💚</span>
      <div class="pwa-install-banner__text">
        <strong>Install WellTrack</strong>
        Add to your home screen for quick access
      </div>
      <button class="pwa-install-banner__btn" id="pwa-install-btn">Install</button>
      <button class="pwa-install-banner__dismiss" id="pwa-install-dismiss">✕</button>
    `;
    document.body.appendChild(banner);

    document.getElementById("pwa-install-btn")?.addEventListener("click", async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") banner.remove();
      deferredPrompt = null;
    });
    document.getElementById("pwa-install-dismiss")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      setTimeout(() => banner.remove(), 400);
    });
  });
}
