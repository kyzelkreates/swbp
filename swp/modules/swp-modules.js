// SWP — Wellbeing Module Definitions
// Extends BCO Module Registry (Run 3) with education modules
// Each module maps to a BCO module schema

// ─────────────────────────────────────────────
// STUDENT-FACING MODULES
// ─────────────────────────────────────────────

export const STUDENT_MODULES = [
  {
    name: "StudentDashboard",
    version: "1.0",
    description: "Student personal wellbeing dashboard",
    entities: ["checkins", "goals", "support_requests"],
    actions: ["submit_checkin", "create_goal", "update_goal", "request_support"],
    rules: [],
    ui_blocks: [
      { type: "stat_card",  id: "today-mood",       label: "Today's Mood",        key: "moodScore" },
      { type: "stat_card",  id: "stress-score",     label: "Stress Level",        key: "stressScore" },
      { type: "progress",   id: "goals-progress",   label: "Goals Progress",      key: "goals" },
      { type: "chart_line", id: "mood-trend",       label: "Mood This Week",      key: "moodTrend" },
      { type: "chart_line", id: "stress-trend",     label: "Stress This Week",    key: "stressTrend" },
      { type: "list",       id: "recent-checkins",  label: "Recent Check-Ins",    key: "checkIns" },
      { type: "ai_insight", id: "wellbeing-ai",     label: "AI Wellbeing Insight",key: "aiInsight" },
      { type: "attendance", id: "attendance-refl",  label: "Attendance Reflection",key: "attendance" }
    ],
    config: { selfReportOnly: true, dataScope: "own_only" },
    permissions: {
      read:  ["student", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["student"],
      blockedActions: ["view_other_student", "export_data"]
    }
  },
  {
    name: "DailyCheckIn",
    version: "1.0",
    description: "Student daily wellbeing check-in form",
    entities: ["checkins"],
    actions: ["submit_checkin"],
    rules: [
      { trigger: "low_mood_detected",   action: "flag_for_pastoral_review" },
      { trigger: "high_stress_detected",action: "show_coping_resources" }
    ],
    ui_blocks: [
      { type: "slider",   id: "mood-slider",        label: "How are you feeling today?",    key: "moodScore",    min: 1, max: 5 },
      { type: "slider",   id: "stress-slider",      label: "How stressed are you feeling?", key: "stressScore",  min: 1, max: 5 },
      { type: "slider",   id: "energy-slider",      label: "Energy level",                  key: "energyScore",  min: 1, max: 5 },
      { type: "slider",   id: "motivation-slider",  label: "Motivation level",              key: "motivationScore", min: 1, max: 5 },
      { type: "slider",   id: "confidence-slider",  label: "Confidence level",              key: "confidenceScore", min: 1, max: 5 },
      { type: "select",   id: "attendance-reflect", label: "Attendance Reflection",         key: "attendanceReflection" },
      { type: "textarea", id: "note",               label: "Anything you'd like to share?", key: "note", optional: true }
    ],
    config: { frequency: "daily", reminderEnabled: true },
    permissions: {
      read:  ["student", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["student"],
      blockedActions: []
    }
  },
  {
    name: "Goals",
    version: "1.0",
    description: "Student wellbeing goals tracker",
    entities: ["goals"],
    actions: ["create_goal", "update_goal", "complete_goal"],
    rules: [],
    ui_blocks: [
      { type: "list",     id: "active-goals",    label: "Active Goals",    key: "activeGoals" },
      { type: "list",     id: "completed-goals", label: "Completed Goals", key: "completedGoals" },
      { type: "form",     id: "new-goal-form",   label: "Set a New Goal",  key: "newGoal" },
      { type: "progress", id: "goal-progress",   label: "Overall Progress",key: "overallProgress" }
    ],
    config: {},
    permissions: {
      read:  ["student", "pastoral_lead", "school_admin"],
      write: ["student"],
      blockedActions: []
    }
  },
  {
    name: "StudyPlanner",
    version: "1.0",
    description: "Student study habits and planner",
    entities: ["study_plans"],
    actions: ["create_study_block", "complete_study_block"],
    rules: [],
    ui_blocks: [
      { type: "calendar", id: "study-calendar",  label: "Study Schedule",     key: "studyBlocks" },
      { type: "list",     id: "upcoming-tasks",  label: "Upcoming Tasks",     key: "tasks" },
      { type: "chart_bar",id: "study-habits",    label: "Study Habits",       key: "habitData" },
      { type: "ai_insight",id: "study-ai",       label: "Study Tips",         key: "studyTips" }
    ],
    config: {},
    permissions: {
      read:  ["student", "pastoral_lead", "school_admin"],
      write: ["student"],
      blockedActions: []
    }
  },
  {
    name: "Journal",
    version: "1.0",
    description: "Private student wellbeing journal",
    entities: ["journal_entries"],
    actions: ["create_entry", "update_entry"],
    rules: [],
    ui_blocks: [
      { type: "list",     id: "journal-entries", label: "My Journal",     key: "entries" },
      { type: "form",     id: "new-entry",       label: "New Entry",      key: "newEntry" }
    ],
    config: { private: true, staffVisible: false },
    permissions: {
      read:  ["student"],   // journal is student-private
      write: ["student"],
      blockedActions: ["staff_read", "export_data"]
    }
  },
  {
    name: "Resources",
    version: "1.0",
    description: "Wellbeing resources and support links",
    entities: ["resources"],
    actions: ["view_resource", "bookmark_resource"],
    rules: [],
    ui_blocks: [
      { type: "grid",  id: "resource-categories", label: "Support Categories", key: "categories" },
      { type: "list",  id: "bookmarked",          label: "My Bookmarks",       key: "bookmarks" },
      { type: "card",  id: "crisis-support",      label: "Urgent Support",     key: "crisisLinks" }
    ],
    config: {},
    permissions: {
      read:  ["student", "teacher", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["school_admin", "pastoral_lead"],
      blockedActions: []
    }
  }
];

// ─────────────────────────────────────────────
// STAFF-FACING MODULES
// ─────────────────────────────────────────────

export const STAFF_MODULES = [
  {
    name: "Overview",
    version: "1.0",
    description: "School-level wellbeing overview dashboard",
    entities: ["students", "alerts", "interventions", "support_requests"],
    actions: ["refresh_data", "export_report"],
    rules: [],
    ui_blocks: [
      { type: "stat_card",  id: "total-students",     label: "Total Students",            key: "totalStudents" },
      { type: "stat_card",  id: "requiring-support",  label: "Requiring Support",          key: "studentsRequiringSupport" },
      { type: "stat_card",  id: "active-alerts",      label: "Active Alerts",              key: "activeAlerts" },
      { type: "stat_card",  id: "open-requests",      label: "Open Support Requests",      key: "openSupportRequests" },
      { type: "chart_donut",id: "alert-breakdown",    label: "Alert Breakdown",            key: "alertBreakdown" },
      { type: "chart_line", id: "wellbeing-trend",    label: "Wellbeing Trend",            key: "wellbeingTrend" },
      { type: "chart_bar",  id: "attendance-trend",   label: "Attendance Overview",        key: "attendanceTrend" },
      { type: "chart_bar",  id: "engagement-scores",  label: "Engagement Scores",          key: "engagementData" },
      { type: "ai_insight", id: "school-ai",          label: "AI School Overview",         key: "schoolAI" }
    ],
    config: {},
    permissions: {
      read:  ["teacher", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["school_admin"],
      blockedActions: []
    }
  },
  {
    name: "Students",
    version: "1.0",
    description: "Student wellbeing directory with filters",
    entities: ["students", "checkins", "attendance"],
    actions: ["view_student", "flag_student", "create_intervention"],
    rules: [],
    ui_blocks: [
      { type: "filter_bar", id: "student-filters", label: "Filter Students",    key: "filters" },
      { type: "table",      id: "student-table",   label: "Student Directory",  key: "students" },
      { type: "detail_panel",id: "student-detail", label: "Student Detail",     key: "selectedStudent" }
    ],
    config: { pagination: true, pageSize: 25, exportEnabled: true },
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "safeguarding_officer", "school_admin"],
      blockedActions: ["teacher_access_all"]
    }
  },
  {
    name: "Classes",
    version: "1.0",
    description: "Class-level wellbeing overview",
    entities: ["classes", "students", "checkins"],
    actions: ["view_class", "export_class_report"],
    rules: [],
    ui_blocks: [
      { type: "grid",      id: "class-cards",    label: "All Classes",       key: "classes" },
      { type: "table",     id: "class-students", label: "Class Students",    key: "classStudents" },
      { type: "chart_bar", id: "class-compare",  label: "Class Comparison",  key: "classComparison" }
    ],
    config: {},
    permissions: {
      read:  ["teacher", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "school_admin"],
      blockedActions: []
    }
  },
  {
    name: "YearGroups",
    version: "1.0",
    description: "Year group wellbeing breakdown",
    entities: ["year_groups", "students", "classes"],
    actions: ["view_year_group", "export_year_report"],
    rules: [],
    ui_blocks: [
      { type: "tabs",      id: "year-tabs",      label: "Year Groups",            key: "yearGroups" },
      { type: "stat_card", id: "yg-stats",       label: "Year Group Stats",       key: "ygStats" },
      { type: "chart_bar", id: "yg-wellbeing",   label: "Wellbeing by Year",      key: "ygWellbeing" },
      { type: "list",      id: "yg-concerns",    label: "Year Group Concerns",    key: "ygConcerns" }
    ],
    config: {},
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "school_admin"],
      blockedActions: []
    }
  },
  {
    name: "Alerts",
    version: "1.0",
    description: "Wellbeing alert management and triage",
    entities: ["alerts", "students"],
    actions: ["acknowledge_alert", "dismiss_alert", "escalate_alert", "create_intervention"],
    rules: [
      { trigger: "alert_created",   action: "notify_pastoral_lead" },
      { trigger: "red_alert",       action: "notify_safeguarding_officer" },
      { trigger: "alert_escalated", action: "notify_school_admin" }
    ],
    ui_blocks: [
      { type: "filter_bar", id: "alert-filters", label: "Filter Alerts",        key: "alertFilters" },
      { type: "alert_list", id: "red-alerts",    label: "🔴 Red Alerts",         key: "redAlerts",   severity: "red" },
      { type: "alert_list", id: "amber-alerts",  label: "🟡 Amber Alerts",       key: "amberAlerts", severity: "amber" },
      { type: "alert_list", id: "green-alerts",  label: "🟢 Monitoring",         key: "greenAlerts", severity: "green" },
      { type: "timeline",   id: "alert-history", label: "Alert History",         key: "alertHistory" }
    ],
    config: { autoRefresh: true, refreshInterval: 30 },
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "safeguarding_officer", "school_admin"],
      blockedActions: ["teacher_dismiss_red"]
    }
  },
  {
    name: "Interventions",
    version: "1.0",
    description: "Wellbeing intervention tracking and management",
    entities: ["interventions", "students"],
    actions: ["create_intervention", "update_intervention", "close_intervention"],
    rules: [],
    ui_blocks: [
      { type: "table",    id: "active-interventions",   label: "Active Interventions",    key: "activeInterventions" },
      { type: "table",    id: "planned-interventions",  label: "Planned Interventions",   key: "plannedInterventions" },
      { type: "form",     id: "new-intervention",       label: "New Intervention",        key: "newIntervention" },
      { type: "timeline", id: "intervention-history",   label: "Intervention History",    key: "interventionHistory" }
    ],
    config: {},
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "safeguarding_officer", "school_admin"],
      blockedActions: []
    }
  },
  {
    name: "SupportRequests",
    version: "1.0",
    description: "Student support request management",
    entities: ["support_requests"],
    actions: ["view_request", "assign_request", "resolve_request"],
    rules: [],
    ui_blocks: [
      { type: "table",  id: "open-requests",      label: "Open Requests",      key: "openRequests" },
      { type: "table",  id: "in-progress",        label: "In Progress",        key: "inProgressRequests" },
      { type: "table",  id: "resolved-requests",  label: "Resolved",           key: "resolvedRequests" },
      { type: "detail", id: "request-detail",     label: "Request Detail",     key: "selectedRequest" }
    ],
    config: {},
    permissions: {
      read:  ["teacher", "pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "safeguarding_officer", "school_admin"],
      blockedActions: []
    }
  },
  {
    name: "Reports",
    version: "1.0",
    description: "Wellbeing reports generation and export",
    entities: ["reports"],
    actions: ["generate_report", "export_pdf", "export_csv"],
    rules: [],
    ui_blocks: [
      { type: "report_list",   id: "available-reports", label: "Available Reports",   key: "reportTypes" },
      { type: "report_builder",id: "report-builder",    label: "Report Builder",      key: "reportConfig" },
      { type: "report_preview",id: "report-preview",    label: "Report Preview",      key: "reportData" }
    ],
    config: { exportFormats: ["pdf", "csv", "excel"] },
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["pastoral_lead", "safeguarding_officer", "school_admin"],
      blockedActions: []
    }
  },
  {
    name: "AIAnalysis",
    version: "1.0",
    description: "AI-generated wellbeing insights and recommendations",
    entities: ["students", "checkins", "interventions"],
    actions: ["run_analysis", "export_analysis"],
    rules: [],
    ui_blocks: [
      { type: "ai_summary",    id: "school-summary",    label: "School Wellbeing Summary",    key: "schoolSummary" },
      { type: "ai_summary",    id: "stress-analysis",   label: "Stress Trend Analysis",       key: "stressTrends" },
      { type: "ai_summary",    id: "attendance-corr",   label: "Attendance Correlations",     key: "attendanceCorr" },
      { type: "ai_summary",    id: "engagement-trends", label: "Engagement Analysis",         key: "engagementTrends" },
      { type: "ai_recommend",  id: "interventions-ai",  label: "Suggested Interventions",     key: "interventionSuggestions" },
      { type: "disclaimer",    id: "ai-disclaimer",     label: "Important Note",              key: "disclaimer" }
    ],
    config: {
      disclaimer: "AI insights are based on trends in self-reported and attendance data only. They are not clinical assessments and should not replace professional judgement."
    },
    permissions: {
      read:  ["pastoral_lead", "safeguarding_officer", "school_admin"],
      write: ["school_admin"],
      blockedActions: []
    }
  },
  {
    name: "Safeguarding",
    version: "1.0",
    description: "Safeguarding records and case management",
    entities: ["safeguarding_cases"],
    actions: ["create_case", "update_case", "escalate_case", "archive_case"],
    rules: [
      { trigger: "case_created",   action: "notify_designated_officer" },
      { trigger: "case_escalated", action: "notify_school_admin" }
    ],
    ui_blocks: [
      { type: "table",   id: "active-cases",     label: "Active Cases",        key: "activeCases" },
      { type: "form",    id: "new-case",         label: "Record New Concern",  key: "newCase" },
      { type: "timeline",id: "case-timeline",    label: "Case Timeline",       key: "caseTimeline" }
    ],
    config: { sensitiveData: true, auditAll: true },
    permissions: {
      read:  ["safeguarding_officer", "school_admin"],
      write: ["safeguarding_officer", "school_admin"],
      blockedActions: ["teacher_access", "student_access", "pastoral_read"]
    }
  },
  {
    name: "Settings",
    version: "1.0",
    description: "Platform configuration and school settings",
    entities: ["settings"],
    actions: ["update_settings", "manage_users", "configure_alerts"],
    rules: [],
    ui_blocks: [
      { type: "form", id: "school-settings",    label: "School Settings",      key: "schoolSettings" },
      { type: "form", id: "alert-thresholds",   label: "Alert Thresholds",     key: "alertThresholds" },
      { type: "table",id: "user-management",    label: "User Management",      key: "users" },
      { type: "form", id: "branding-settings",  label: "Branding",             key: "branding" }
    ],
    config: {},
    permissions: {
      read:  ["school_admin"],
      write: ["school_admin"],
      blockedActions: []
    }
  }
];

export const ALL_MODULES = [...STUDENT_MODULES, ...STAFF_MODULES];
