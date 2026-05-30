// SWP — Student Wellbeing Platform
// Permission system extending BCO Auth (Run 6)
// Five education roles mapped to BCO role hierarchy

import { ROLES as BCO_ROLES } from "../../bco-base/bco/auth/permissions.js";

// ─────────────────────────────────────────────
// EDUCATION ROLE DEFINITIONS
// Maps to BCO role hierarchy
// ─────────────────────────────────────────────

export const SWP_ROLES = {
  SCHOOL_ADMIN:        "school_admin",        // → super_admin
  SAFEGUARDING_OFFICER:"safeguarding_officer", // → tenant_admin
  PASTORAL_LEAD:       "pastoral_lead",        // → operator (elevated)
  TEACHER:             "teacher",              // → operator
  STUDENT:             "student"               // → viewer (own data only)
};

// Map SWP roles to BCO roles for reuse of core permission logic
export const ROLE_MAP = {
  school_admin:         BCO_ROLES.SUPER_ADMIN,
  safeguarding_officer: BCO_ROLES.TENANT_ADMIN,
  pastoral_lead:        BCO_ROLES.OPERATOR,
  teacher:              BCO_ROLES.OPERATOR,
  student:              BCO_ROLES.VIEWER
};

// ─────────────────────────────────────────────
// EDUCATION PERMISSION MAP
// ─────────────────────────────────────────────

const SWP_PERMISSIONS = {
  school_admin: [
    "*"  // full access
  ],
  safeguarding_officer: [
    "read_all_students", "read_alerts", "manage_alerts",
    "read_reports", "create_reports", "read_interventions",
    "manage_interventions", "read_support_requests",
    "read_safeguarding_data", "export_data", "manage_users"
  ],
  pastoral_lead: [
    "read_students", "read_alerts", "dismiss_alert",
    "read_interventions", "create_intervention",
    "read_support_requests", "manage_support_requests",
    "read_reports", "read_class_data", "read_year_group_data"
  ],
  teacher: [
    "read_class_students", "read_class_alerts",
    "read_class_wellbeing", "create_support_request",
    "read_class_reports", "read_interventions"
  ],
  student: [
    "read_own_profile", "create_checkin", "read_own_checkins",
    "create_support_request", "read_own_support_requests",
    "read_own_goals", "create_goal", "update_own_goal",
    "read_resources", "create_journal_entry", "read_own_journal"
  ]
};

// ─────────────────────────────────────────────
// CORE PERMISSION CHECK
// ─────────────────────────────────────────────

export function checkSWPPermission(role, action) {
  const perms = SWP_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes("*") || perms.includes(action);
}

export function assertSWPPermission(role, action, context = "") {
  if (!checkSWPPermission(role, action)) {
    throw new Error(`[SWP Auth] Role "${role}" denied action "${action}"${context ? ` (${context})` : ""}.`);
  }
}

export function getSWPPermissions(role) {
  return SWP_PERMISSIONS[role] || [];
}

// ─────────────────────────────────────────────
// MODULE VISIBILITY BY ROLE
// ─────────────────────────────────────────────

export const MODULE_ACCESS = {
  school_admin:        [
    "Overview", "Students", "Classes", "YearGroups",
    "Alerts", "Interventions", "Reports", "AIAnalysis",
    "SupportRequests", "Settings", "Safeguarding"
  ],
  safeguarding_officer:[
    "Overview", "Students", "Alerts", "Interventions",
    "Reports", "AIAnalysis", "SupportRequests", "Safeguarding"
  ],
  pastoral_lead:       [
    "Overview", "Students", "Classes", "YearGroups",
    "Alerts", "Interventions", "Reports", "SupportRequests"
  ],
  teacher:             [
    "Overview", "Classes", "Alerts", "SupportRequests", "Reports"
  ],
  student:             [
    "StudentDashboard", "DailyCheckIn", "Goals",
    "StudyPlanner", "Journal", "SupportRequests", "Resources", "Profile"
  ]
};

export function getVisibleModulesForRole(role) {
  return MODULE_ACCESS[role] || [];
}
