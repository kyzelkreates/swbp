// BCO Brand Engine — Run 4
// White-label configuration system.
// All visual identity is driven from a single config object.
// No hardcoded styles anywhere in the product layer.

// ─────────────────────────────────────────────
// BRAND CONFIG SCHEMA
// ─────────────────────────────────────────────

/**
 * Default brand config.
 * Override via setBrandConfig() or load from SSOT.
 *
 * @typedef {Object} BrandConfig
 * @property {string} app_name
 * @property {string} tagline
 * @property {string} primary_color    - CSS hex/hsl/rgb
 * @property {string} secondary_color
 * @property {string} accent_color
 * @property {string} font             - Google Fonts name or system font
 * @property {"default"|"compact"|"wide"} layout_style
 * @property {"neutral"|"professional"|"friendly"|"clinical"} tone
 * @property {string} logo_url         - optional
 * @property {string} favicon_url      - optional
 */
const DEFAULT_BRAND = {
  app_name:        "BCO",
  tagline:         "Your modular control OS",
  primary_color:   "#2563eb",
  secondary_color: "#1e1b4b",
  accent_color:    "#7c3aed",
  font:            "Inter",
  layout_style:    "default",
  tone:            "professional",
  logo_url:        null,
  favicon_url:     null
};

let _activeBrand = { ...DEFAULT_BRAND };

// ─────────────────────────────────────────────
// BRAND GETTERS / SETTERS
// ─────────────────────────────────────────────

export function getBrandConfig() {
  return { ..._activeBrand };
}

export function setBrandConfig(config) {
  _activeBrand = { ...DEFAULT_BRAND, ...config };
  applyBranding(_activeBrand);
}

// ─────────────────────────────────────────────
// APPLY BRANDING TO DOM
// ─────────────────────────────────────────────

/**
 * applyBranding(config)
 * Injects CSS variables, font, title, favicon into the document.
 * Safe to call multiple times (idempotent).
 */
export function applyBranding(config = _activeBrand) {
  const root = document.documentElement;

  // Page identity
  document.title = config.app_name;
  if (config.favicon_url) _setFavicon(config.favicon_url);

  // CSS custom properties
  root.style.setProperty("--color-primary",   config.primary_color);
  root.style.setProperty("--color-secondary", config.secondary_color);
  root.style.setProperty("--color-accent",    config.accent_color);
  root.style.setProperty("--font-base",       `"${config.font}", system-ui, sans-serif`);

  // Layout class on body
  document.body.dataset.layout = config.layout_style;
  document.body.dataset.tone   = config.tone;

  // Font loading (Google Fonts)
  applyFont(config.font);

  console.log(`[BCO Brand] Applied: ${config.app_name} (${config.layout_style})`);
}

// ─────────────────────────────────────────────
// FONT LOADER
// ─────────────────────────────────────────────

const _loadedFonts = new Set();

export function applyFont(fontName) {
  if (!fontName || _loadedFonts.has(fontName)) return;

  const systemFonts = ["system-ui", "sans-serif", "serif", "monospace", "Arial", "Georgia"];
  if (systemFonts.includes(fontName)) {
    _loadedFonts.add(fontName);
    return;
  }

  const link = document.createElement("link");
  link.rel  = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
  _loadedFonts.add(fontName);
}

// ─────────────────────────────────────────────
// LAYOUT ENGINE
// ─────────────────────────────────────────────

/**
 * applyLayout(style)
 * Sets body data attribute consumed by CSS layout classes.
 * Layouts: "default" | "compact" | "wide"
 */
export function applyLayout(style = "default") {
  document.body.dataset.layout = style;
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _setFavicon(url) {
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}
