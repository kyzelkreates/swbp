// SWP — Brand Configuration
// Extends BCO Brand Engine (Run 4)
// Applies student wellbeing platform visual identity

export const SWP_BRAND = {
  app_name:      "WellTrack",
  tagline:       "Student Wellbeing, Supported",
  logo_url:      null,
  primary_color: "#2C7A7B",    // teal — calm, educational
  secondary_color: "#276749",  // forest green
  accent_color:  "#F6AD55",    // amber — warm
  danger_color:  "#E53E3E",    // red alerts
  warning_color: "#D69E2E",    // amber alerts
  success_color: "#38A169",    // green/positive
  bg_color:      "#F7FAFC",    // light background — approachable
  surface_color: "#FFFFFF",    // white cards
  border_color:  "#E2E8F0",
  text_color:    "#1A202C",
  muted_color:   "#718096",
  font_family:   "'Inter', 'Segoe UI', system-ui, sans-serif",
  border_radius: "12px",
  shadow:        "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
  layout:        "three-panel",
  favicon_emoji: "💚",
  // Alert colours
  alert: {
    red:   { bg: "#FFF5F5", border: "#FC8181", text: "#C53030", badge: "#E53E3E" },
    amber: { bg: "#FFFAF0", border: "#F6AD55", text: "#B7791F", badge: "#D69E2E" },
    green: { bg: "#F0FFF4", border: "#68D391", text: "#276749", badge: "#38A169" }
  },
  // Navigation icons per module
  icons: {
    StudentDashboard:   "🏠",
    DailyCheckIn:       "✅",
    Goals:              "🎯",
    StudyPlanner:       "📚",
    Journal:            "📓",
    SupportRequests:    "💬",
    Resources:          "🌐",
    Profile:            "👤",
    Overview:           "📊",
    Students:           "👥",
    Classes:            "🏫",
    YearGroups:         "🎓",
    Alerts:             "🔔",
    Interventions:      "🤝",
    Reports:            "📋",
    AIAnalysis:         "🤖",
    Safeguarding:       "🔒",
    Settings:           "⚙️"
  }
};

/**
 * applySWPBranding()
 * Injects SWP CSS custom properties into document root.
 * Reuses BCO brand engine pattern.
 */
export function applySWPBranding() {
  const root = document.documentElement;
  root.style.setProperty("--color-primary",    SWP_BRAND.primary_color);
  root.style.setProperty("--color-secondary",  SWP_BRAND.secondary_color);
  root.style.setProperty("--color-accent",     SWP_BRAND.accent_color);
  root.style.setProperty("--color-danger",     SWP_BRAND.danger_color);
  root.style.setProperty("--color-warning",    SWP_BRAND.warning_color);
  root.style.setProperty("--color-success",    SWP_BRAND.success_color);
  root.style.setProperty("--color-bg",         SWP_BRAND.bg_color);
  root.style.setProperty("--color-surface",    SWP_BRAND.surface_color);
  root.style.setProperty("--color-border",     SWP_BRAND.border_color);
  root.style.setProperty("--color-text",       SWP_BRAND.text_color);
  root.style.setProperty("--color-muted",      SWP_BRAND.muted_color);
  root.style.setProperty("--font-base",        SWP_BRAND.font_family);
  root.style.setProperty("--radius",           SWP_BRAND.border_radius);
  root.style.setProperty("--shadow",           SWP_BRAND.shadow);
  document.title = SWP_BRAND.app_name;
  const favicon = document.querySelector("link[rel='icon']") || document.createElement("link");
  favicon.rel = "icon";
  favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${SWP_BRAND.favicon_emoji}</text></svg>`;
  document.head.appendChild(favicon);
}

export function getSWPIcon(moduleName) {
  return SWP_BRAND.icons[moduleName] || "📌";
}
