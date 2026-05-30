# WellTrack — Student Wellbeing Platform
## Deployment Instructions

---

## Architecture Overview

```
WellTrack (SWP)
├── Built on: BCO Core v1.0 (Runs 1–10)
├── Entry:    index.html
├── Platform: Static ES Modules (no bundler required)
└── Deploy:   Vercel / Netlify / GitHub Pages / Any static host
```

---

## File Structure

```
/
├── index.html                    ← App entry point (CONVERTED from BCO)
├── vercel.json                   ← Deployment config
├── package.json                  ← Project metadata
├── DEPLOYMENT.md                 ← This file
│
├── bco/                          ← BCO Core (PRESERVED — DO NOT MODIFY)
│   ├── core/                     ← Storage, Events, Rules, Actions
│   ├── ai/                       ← Insight Engine, Risk, Patterns, Forecast
│   ├── auth/                     ← Permissions (reused)
│   ├── ui/                       ← Dashboard Engine, Widgets (reused)
│   ├── brand/                    ← Brand Engine (reused)
│   ├── governance/               ← Audit, Compliance, Snapshot
│   └── index.js                  ← BCO public API
│
└── swp/                          ← SWP Conversion Layer (NEW)
    ├── auth/
    │   └── swp-permissions.js    ← Education role system
    ├── ai/
    │   └── wellbeing-analysis.js ← Wellbeing AI engine
    ├── data/
    │   └── demo-data.js          ← 1000 students demo generator
    ├── modules/
    │   └── swp-modules.js        ← All education module definitions
    ├── reports/
    │   └── report-engine.js      ← 8 report types
    ├── ui/
    │   ├── swp-brand.js          ← WellTrack branding
    │   ├── swp-dashboard.css     ← Light educational theme
    │   └── swp-dashboard.js      ← Full dashboard engine
    ├── pwa/
    │   └── swp-manifest.json     ← PWA manifest
    └── DATABASE_SCHEMA.md        ← Full entity schema
```

---

## Quick Start (Local)

```bash
# Option 1: Python (no install)
python3 -m http.server 8080
# Open: http://localhost:8080

# Option 2: Node
npx serve .
# Open: http://localhost:3000

# Option 3: VS Code
# Install Live Server extension → right-click index.html → Open with Live Server
```

> ⚠️ Must be served over HTTP — ES modules don't work from file:// URLs.

---

## Vercel Deployment

The included `vercel.json` is already configured. Simply:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or connect GitHub repo to Vercel dashboard for auto-deploy
```

The `vercel.json` rewrites all routes to `index.html` for SPA behaviour.

---

## Netlify Deployment

```bash
# Drag the project folder to netlify.com/drop
# OR:
npm i -g netlify-cli
netlify deploy --prod --dir .
```

Create `_redirects` file:
```
/* /index.html 200
```

---

## GitHub Pages

```bash
git add .
git commit -m "SWP: Student Wellbeing Platform"
git push

# In GitHub repo settings → Pages → Deploy from main branch
```

---

## Multi Academy Trust / Self-Hosted

For school network deployment:

1. Copy entire folder to web server root
2. Serve over HTTPS (required for PWA features)
3. Configure DNS for your school domain
4. Optional: Set up nginx/Apache to serve `index.html` for all routes

Nginx config:
```nginx
server {
    listen 443 ssl;
    server_name welltrack.yourschool.edu;
    root /var/www/welltrack;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

---

## Architecture Reuse Map

| BCO System | SWP Usage |
|---|---|
| Storage Engine (SSOT) | Demo data + state management |
| Event System | Check-in submissions, alert generation |
| Rule Engine | Alert thresholds, support flags |
| Dashboard Engine | Three-panel layout (extended) |
| AI Insight Engine | Wellbeing pattern analysis |
| Risk Scoring | Alert level calculation (Green/Amber/Red) |
| Pattern Detection | Mood/stress trend analysis |
| Recommendations | Intervention suggestions |
| Auth/Permissions | Role-based access (5 education roles) |
| Brand Engine | WellTrack light theme |
| Governance/Audit | Safeguarding record audit trails |
| PWA | Manifest + offline capability |

---

## Demo Data Summary

| Entity | Count |
|---|---|
| Students | 1,000 |
| Teachers | 40 |
| Year Groups | 5 (Y7–Y11) |
| Classes | 30 |
| Check-Ins | ~8,000–12,000 |
| Support Requests | ~700–900 |
| Interventions | ~500–700 |
| Attendance Records | 1,000 |
| Goals | ~600–800 |

---

## AI Disclaimer

All AI analysis in WellTrack:
- Is based on self-reported data and attendance records only
- Makes NO clinical assessments or diagnoses
- Makes NO safeguarding decisions
- Is intended to support — not replace — professional pastoral judgement
- Complies with ICO guidance on AI in education

---

## Customisation

To white-label for your school/MAT:

1. Edit `swp/ui/swp-brand.js`:
   - Change `app_name`, colours, logo_url
2. Edit `swp/pwa/swp-manifest.json`:
   - Update name, theme_color
3. Update `index.html` title tag

---

## Roadmap (Next Runs)

- [ ] Backend API (Node.js/Supabase)
- [ ] Real authentication (SSO/Microsoft Entra)
- [ ] MIS integration (SIMS, Arbor, Bromcom)
- [ ] Email/SMS notifications for alerts
- [ ] Parent portal view
- [ ] Mobile app (React Native)
- [ ] Data export compliance (GDPR)

---

Built on **BCO Core v1.0** — Brandable Control OS
Converted to **WellTrack** — Student Wellbeing Platform
