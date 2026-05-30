// SWP — Report Engine
// Extends BCO reporting architecture
// Generates all 8 report types as structured data objects
// Designed for export to PDF / CSV / Excel

import {
  generateStudentSummary,
  generateClassSummary,
  generateYearGroupSummary,
  generateSchoolOverview,
  correlateAttendanceWellbeing,
  analyseStressTrends
} from "../ai/wellbeing-analysis.js";

// ─────────────────────────────────────────────
// REPORT CATALOGUE
// ─────────────────────────────────────────────

export const REPORT_TYPES = {
  STUDENT_WELLBEING:    "student_wellbeing",
  CLASS_WELLBEING:      "class_wellbeing",
  YEAR_GROUP_WELLBEING: "year_group_wellbeing",
  ATTENDANCE_CORR:      "attendance_correlation",
  INTERVENTION:         "intervention",
  SUPPORT_REQUEST:      "support_request",
  ENGAGEMENT:           "engagement",
  SCHOOL_WELLBEING:     "school_wellbeing"
};

export const REPORT_CATALOGUE = [
  {
    id:          REPORT_TYPES.STUDENT_WELLBEING,
    name:        "Student Wellbeing Report",
    description: "Individual student wellbeing overview including mood, stress, attendance and goals",
    scope:       "student",
    format:      ["pdf", "csv"],
    icon:        "👤"
  },
  {
    id:          REPORT_TYPES.CLASS_WELLBEING,
    name:        "Class Wellbeing Report",
    description: "Class-level wellbeing metrics, alert breakdown and check-in engagement",
    scope:       "class",
    format:      ["pdf", "csv", "excel"],
    icon:        "🏫"
  },
  {
    id:          REPORT_TYPES.YEAR_GROUP_WELLBEING,
    name:        "Year Group Wellbeing Report",
    description: "Year group analysis with class comparisons and trend data",
    scope:       "year_group",
    format:      ["pdf", "csv", "excel"],
    icon:        "📊"
  },
  {
    id:          REPORT_TYPES.ATTENDANCE_CORR,
    name:        "Attendance Correlation Report",
    description: "Explores the relationship between attendance patterns and wellbeing outcomes",
    scope:       "school",
    format:      ["pdf", "csv"],
    icon:        "📅"
  },
  {
    id:          REPORT_TYPES.INTERVENTION,
    name:        "Intervention Report",
    description: "Active, planned and completed interventions with outcomes",
    scope:       "school",
    format:      ["pdf", "csv", "excel"],
    icon:        "🤝"
  },
  {
    id:          REPORT_TYPES.SUPPORT_REQUEST,
    name:        "Support Request Report",
    description: "Volume, category breakdown and resolution times for support requests",
    scope:       "school",
    format:      ["pdf", "csv"],
    icon:        "💬"
  },
  {
    id:          REPORT_TYPES.ENGAGEMENT,
    name:        "Engagement Report",
    description: "Platform engagement rates — check-in frequency, goal completion and resource use",
    scope:       "school",
    format:      ["pdf", "csv", "excel"],
    icon:        "📈"
  },
  {
    id:          REPORT_TYPES.SCHOOL_WELLBEING,
    name:        "School Wellbeing Report",
    description: "Comprehensive school-wide wellbeing report suitable for governors and leadership",
    scope:       "school",
    format:      ["pdf"],
    icon:        "🏛️"
  }
];

// ─────────────────────────────────────────────
// REPORT GENERATORS
// ─────────────────────────────────────────────

/**
 * generateStudentReport(studentId, data)
 * Full wellbeing report for a single student.
 */
export function generateStudentReport(studentId, { students, checkIns, attendance, goals, interventions, supportRequests }) {
  const student    = students.find(s => s.id === studentId);
  if (!student) throw new Error(`Student ${studentId} not found`);

  const stuCheckIns      = checkIns.filter(c => c.studentId === studentId);
  const stuAttendance    = attendance.find(a => a.studentId === studentId);
  const stuGoals         = goals.filter(g => g.studentId === studentId);
  const stuInterventions = interventions.filter(i => i.studentId === studentId);
  const stuSupportReqs   = supportRequests.filter(r => r.studentId === studentId);

  const summary = generateStudentSummary(student, stuCheckIns, stuAttendance, stuGoals);

  return {
    reportType:    REPORT_TYPES.STUDENT_WELLBEING,
    reportTitle:   `Student Wellbeing Report — ${student.fullName}`,
    generatedAt:   new Date().toISOString(),
    generatedBy:   "SWP Report Engine",
    student: {
      id:          student.id,
      name:        student.fullName,
      yearGroup:   student.yearGroupName,
      class:       student.className,
      email:       student.email
    },
    summary,
    checkInHistory: stuCheckIns.sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20),
    attendance:    stuAttendance,
    goals:         stuGoals,
    interventions: stuInterventions,
    supportRequests: stuSupportReqs,
    disclaimer:    "This report contains self-reported wellbeing data. It is not a clinical assessment."
  };
}

/**
 * generateClassReport(classId, data)
 * Class wellbeing report.
 */
export function generateClassReport(classId, { classes, students, checkIns, attendance }) {
  const cls = classes.find(c => c.id === classId);
  if (!cls) throw new Error(`Class ${classId} not found`);

  const summary = generateClassSummary(cls, students, checkIns);

  const classStudents = students.filter(s => s.classId === classId);
  const classAttendance = attendance.filter(a => a.classId === classId);

  // Per-student quick view
  const studentRows = classStudents.map(s => {
    const stuCI = checkIns.filter(c => c.studentId === s.id).slice(-5);
    const avgMood = stuCI.length
      ? (stuCI.reduce((t, c) => t + c.moodScore, 0) / stuCI.length).toFixed(1)
      : "N/A";
    return {
      id:           s.id,
      name:         s.fullName,
      alertLevel:   s.alertLevel,
      wellbeing:    s.wellbeingScore.toFixed(1),
      attendance:   s.attendanceRate.toFixed(1),
      engagement:   s.engagementScore.toFixed(1),
      avgMood,
      lastCheckIn:  s.lastCheckIn
    };
  }).sort((a,b) => a.alertLevel === "red" ? -1 : b.alertLevel === "red" ? 1 : 0);

  return {
    reportType:    REPORT_TYPES.CLASS_WELLBEING,
    reportTitle:   `Class Wellbeing Report — ${cls.name}`,
    generatedAt:   new Date().toISOString(),
    class:         cls,
    summary,
    studentRows,
    attendanceSummary: {
      avgRate: (classAttendance.reduce((s,a) => s + a.overallRate, 0) / (classAttendance.length || 1)).toFixed(1),
      persistentAbsence: classAttendance.filter(a => a.persistentlyAbsent).length
    },
    disclaimer: "This report is based on self-reported and recorded data. Not for clinical use."
  };
}

/**
 * generateYearGroupReport(yearGroupId, data)
 */
export function generateYearGroupReport(yearGroupId, { YEAR_GROUPS, classes, students, checkIns, attendance }) {
  const yg = YEAR_GROUPS.find(y => y.id === yearGroupId);
  if (!yg) throw new Error(`Year group ${yearGroupId} not found`);

  const summary = generateYearGroupSummary(yg, students, checkIns, classes);

  return {
    reportType:  REPORT_TYPES.YEAR_GROUP_WELLBEING,
    reportTitle: `Year Group Wellbeing Report — ${yg.name}`,
    generatedAt: new Date().toISOString(),
    yearGroup:   yg,
    summary,
    disclaimer:  "Based on self-reported and recorded data. Not for clinical use."
  };
}

/**
 * generateAttendanceCorrelationReport(data)
 */
export function generateAttendanceCorrelationReport({ students, checkIns }) {
  const correlations = correlateAttendanceWellbeing(students);
  const stressTrends = analyseStressTrends(checkIns);

  const persistentAbsent = students.filter(s => s.attendanceRate < 90);
  const paAlerts = persistentAbsent.filter(s => s.alertLevel !== "green").length;

  return {
    reportType:   REPORT_TYPES.ATTENDANCE_CORR,
    reportTitle:  "Attendance Correlation Report",
    generatedAt:  new Date().toISOString(),
    totalStudents: students.length,
    persistentAbsenceCount: persistentAbsent.length,
    persistentAbsenceRate: ((persistentAbsent.length / students.length) * 100).toFixed(1),
    paWithWellbeingConcerns: paAlerts,
    correlations,
    stressTrends,
    keyFinding: persistentAbsent.length > 0
      ? `${paAlerts} of ${persistentAbsent.length} students with attendance below 90% also have amber or red wellbeing indicators.`
      : "No significant attendance concerns at this time.",
    disclaimer: "Correlation data is observational only. No causal claims are made."
  };
}

/**
 * generateInterventionReport(data)
 */
export function generateInterventionReport({ interventions, students }) {
  const active    = interventions.filter(i => i.status === "active");
  const planned   = interventions.filter(i => i.status === "planned");
  const completed = interventions.filter(i => i.status === "completed");

  const typeBreakdown = interventions.reduce((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {});

  const completionRate = interventions.length
    ? ((completed.length / interventions.length) * 100).toFixed(1)
    : 0;

  return {
    reportType:      REPORT_TYPES.INTERVENTION,
    reportTitle:     "Intervention Report",
    generatedAt:     new Date().toISOString(),
    totalInterventions: interventions.length,
    active:          active.length,
    planned:         planned.length,
    completed:       completed.length,
    completionRate:  `${completionRate}%`,
    typeBreakdown,
    recentInterventions: interventions
      .sort((a,b) => b.createdDate.localeCompare(a.createdDate))
      .slice(0, 20)
      .map(i => ({
        id:          i.id,
        studentName: i.studentName,
        type:        i.type,
        status:      i.status,
        priority:    i.priority,
        createdDate: i.createdDate,
        outcome:     i.outcome
      }))
  };
}

/**
 * generateSupportRequestReport(data)
 */
export function generateSupportRequestReport({ supportRequests }) {
  const open       = supportRequests.filter(r => r.status === "open");
  const inProgress = supportRequests.filter(r => r.status === "in_progress");
  const resolved   = supportRequests.filter(r => r.status === "resolved");

  const categoryBreakdown = supportRequests.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  const urgencyBreakdown = supportRequests.reduce((acc, r) => {
    acc[r.urgency] = (acc[r.urgency] || 0) + 1;
    return acc;
  }, {});

  return {
    reportType:     REPORT_TYPES.SUPPORT_REQUEST,
    reportTitle:    "Support Request Report",
    generatedAt:    new Date().toISOString(),
    total:          supportRequests.length,
    open:           open.length,
    inProgress:     inProgress.length,
    resolved:       resolved.length,
    resolutionRate: supportRequests.length
      ? ((resolved.length / supportRequests.length) * 100).toFixed(1) + "%"
      : "N/A",
    categoryBreakdown,
    urgencyBreakdown,
    urgentOpenCount: open.filter(r => r.urgency === "urgent").length
  };
}

/**
 * generateEngagementReport(data)
 */
export function generateEngagementReport({ students, checkIns, goals }) {
  const totalStudents = students.length;
  const studentsWithCheckIns = new Set(checkIns.map(c => c.studentId)).size;
  const studentsWithGoals = new Set(goals.map(g => g.studentId)).size;
  const completedGoals = goals.filter(g => g.status === "completed").length;

  const checkInsLast7 = checkIns.filter(c => {
    return (Date.now() - new Date(c.date)) < 7 * 86400000;
  }).length;

  const engagementByYearGroup = {};
  students.forEach(s => {
    if (!engagementByYearGroup[s.yearGroupName]) {
      engagementByYearGroup[s.yearGroupName] = { scores: [], checkInCount: 0 };
    }
    engagementByYearGroup[s.yearGroupName].scores.push(s.engagementScore);
  });
  checkIns.forEach(c => {
    const student = students.find(s => s.id === c.studentId);
    if (student && engagementByYearGroup[student.yearGroupName]) {
      engagementByYearGroup[student.yearGroupName].checkInCount++;
    }
  });

  return {
    reportType:        REPORT_TYPES.ENGAGEMENT,
    reportTitle:       "Platform Engagement Report",
    generatedAt:       new Date().toISOString(),
    totalStudents,
    studentsWithCheckIns,
    checkInEngagementRate: ((studentsWithCheckIns / totalStudents) * 100).toFixed(1) + "%",
    studentsWithGoals,
    goalEngagementRate: ((studentsWithGoals / totalStudents) * 100).toFixed(1) + "%",
    completedGoals,
    totalCheckIns:     checkIns.length,
    checkInsLast7Days: checkInsLast7,
    avgCheckInsPerStudent: (checkIns.length / (totalStudents || 1)).toFixed(1),
    yearGroupEngagement: Object.entries(engagementByYearGroup).map(([yg, data]) => ({
      yearGroup:  yg,
      avgEngagement: (data.scores.reduce((s, x) => s + x, 0) / (data.scores.length || 1)).toFixed(1),
      checkInCount: data.checkInCount
    }))
  };
}

/**
 * generateSchoolWellbeingReport(data)
 * Comprehensive school-wide report for governors/leadership.
 */
export function generateSchoolWellbeingReport(data) {
  const { students, checkIns, interventions, supportRequests, classes, YEAR_GROUPS } = data;

  const overview    = generateSchoolOverview(students, checkIns, interventions, supportRequests);
  const engagement  = generateEngagementReport(data);
  const attendance  = generateAttendanceCorrelationReport(data);
  const interventionRpt = generateInterventionReport(data);
  const supportRpt  = generateSupportRequestReport(data);

  const ygSummaries = YEAR_GROUPS.map(yg =>
    generateYearGroupSummary(yg, students, checkIns, classes)
  );

  return {
    reportType:   REPORT_TYPES.SCHOOL_WELLBEING,
    reportTitle:  "School Wellbeing Report",
    subtitle:     `Academic Year — Generated ${new Date().toLocaleDateString("en-GB")}`,
    generatedAt:  new Date().toISOString(),
    overview,
    yearGroupSummaries: ygSummaries,
    engagementHighlights: {
      checkInRate:   engagement.checkInEngagementRate,
      goalRate:      engagement.goalEngagementRate,
      weeklyCheckIns: engagement.checkInsLast7Days
    },
    attendanceHighlights: {
      persistentAbsenceRate: attendance.persistentAbsenceRate + "%",
      paWithWellbeingConcerns: attendance.paWithWellbeingConcerns
    },
    interventionHighlights: {
      active:         interventionRpt.active,
      completionRate: interventionRpt.completionRate
    },
    supportHighlights: {
      open:           supportRpt.open,
      urgentOpen:     supportRpt.urgentOpenCount,
      resolutionRate: supportRpt.resolutionRate
    },
    disclaimer: "This report contains self-reported wellbeing data and attendance records. It is prepared for school leadership and governors. It does not constitute a clinical or safeguarding assessment.",
    recommendedActions: _buildSchoolRecommendations(overview)
  };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _buildSchoolRecommendations(overview) {
  const recs = [];

  if (overview.avgWellbeingScore < 55) {
    recs.push({ priority: "high", action: "Commission a whole-school wellbeing review" });
  }
  if (overview.persistentAbsenceRate > 10) {
    recs.push({ priority: "high", action: "Review and strengthen attendance support strategies" });
  }
  if (overview.redAlerts > overview.totalStudents * 0.05) {
    recs.push({ priority: "high", action: "Increase pastoral staffing capacity or referral pathways" });
  }
  if (overview.checkInEngagementRate < 50) {
    recs.push({ priority: "medium", action: "Run a campaign to increase daily check-in engagement" });
  }
  if (overview.openSupportRequests > 20) {
    recs.push({ priority: "medium", action: "Review support request workflow and response times" });
  }

  if (!recs.length) {
    recs.push({ priority: "low", action: "Continue monitoring. School wellbeing indicators are positive." });
  }

  return recs;
}
