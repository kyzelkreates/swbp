// SWP — AI Wellbeing Analysis Engine
// Extends BCO AI Insight Engine (Run 5) for education/wellbeing use case
// NO clinical claims. NO diagnosis. Trend + pattern analysis only.
// Rule: read-only. Nothing dispatched. Output is suggestions only.

import { detectPatterns } from "../../bco-base/bco/ai/patterns.js";
import { calculateRiskScore } from "../../bco-base/bco/ai/risk.js";
import { generateRecommendations } from "../../bco-base/bco/ai/recommendations.js";

// ─────────────────────────────────────────────
// WELLBEING RISK THRESHOLDS (education-tuned)
// ─────────────────────────────────────────────

export const WELLBEING_THRESHOLDS = {
  MOOD_LOW:           2,   // <= 2 triggers concern
  STRESS_HIGH:        4,   // >= 4 triggers concern
  ATTENDANCE_CONCERN: 90,  // < 90% is persistent absence threshold
  ENGAGEMENT_LOW:     50,  // < 50 is low engagement
  WELLBEING_RED:      45,  // overall score < 45 → red alert
  WELLBEING_AMBER:    65,  // overall score < 65 → amber alert
  CHECKIN_GAP_DAYS:   7    // no check-in in 7 days → flag
};

// ─────────────────────────────────────────────
// ALERT LEVEL CALCULATOR
// ─────────────────────────────────────────────

/**
 * calculateAlertLevel(student, checkIns, attendance)
 * Returns: { level: "green"|"amber"|"red", reasons: string[], score: number }
 * No diagnosis. No clinical language.
 */
export function calculateAlertLevel(student, recentCheckIns = [], attendance = null) {
  const reasons = [];
  let riskPoints = 0;

  // Wellbeing score
  if (student.wellbeingScore < WELLBEING_THRESHOLDS.WELLBEING_RED) {
    riskPoints += 40;
    reasons.push("Wellbeing score indicates support may be needed");
  } else if (student.wellbeingScore < WELLBEING_THRESHOLDS.WELLBEING_AMBER) {
    riskPoints += 20;
    reasons.push("Wellbeing score is below average");
  }

  // Mood trend from recent check-ins
  if (recentCheckIns.length > 0) {
    const avgMood = recentCheckIns.reduce((s, c) => s + c.moodScore, 0) / recentCheckIns.length;
    if (avgMood <= WELLBEING_THRESHOLDS.MOOD_LOW) {
      riskPoints += 25;
      reasons.push("Recent mood check-ins show consistently low scores");
    }

    const avgStress = recentCheckIns.reduce((s, c) => s + c.stressScore, 0) / recentCheckIns.length;
    if (avgStress >= WELLBEING_THRESHOLDS.STRESS_HIGH) {
      riskPoints += 20;
      reasons.push("Student has reported high stress levels recently");
    }
  }

  // Attendance
  if (attendance && attendance.overallRate < WELLBEING_THRESHOLDS.ATTENDANCE_CONCERN) {
    riskPoints += 20;
    reasons.push(`Attendance is ${attendance.overallRate.toFixed(1)}% (below 90% threshold)`);
  }

  // Engagement
  if (student.engagementScore < WELLBEING_THRESHOLDS.ENGAGEMENT_LOW) {
    riskPoints += 15;
    reasons.push("Engagement score is low");
  }

  // Check-in gap
  if (student.lastCheckIn) {
    const daysSince = Math.floor((Date.now() - new Date(student.lastCheckIn)) / 86400000);
    if (daysSince > WELLBEING_THRESHOLDS.CHECKIN_GAP_DAYS) {
      riskPoints += 10;
      reasons.push(`No check-in recorded for ${daysSince} days`);
    }
  }

  const level = riskPoints >= 50 ? "red" : riskPoints >= 25 ? "amber" : "green";

  return { level, reasons, score: Math.min(riskPoints, 100) };
}

// ─────────────────────────────────────────────
// STUDENT SUMMARY (AI-generated, no diagnosis)
// ─────────────────────────────────────────────

/**
 * generateStudentSummary(student, checkIns, attendance, goals)
 * Returns a structured wellbeing summary for staff review.
 */
export function generateStudentSummary(student, checkIns = [], attendance = null, goals = []) {
  const alertResult = calculateAlertLevel(student, checkIns.slice(-5), attendance);

  const recentCheckIns = checkIns.slice(-10);
  const avgMood = recentCheckIns.length
    ? (recentCheckIns.reduce((s, c) => s + c.moodScore, 0) / recentCheckIns.length).toFixed(1)
    : "N/A";
  const avgStress = recentCheckIns.length
    ? (recentCheckIns.reduce((s, c) => s + c.stressScore, 0) / recentCheckIns.length).toFixed(1)
    : "N/A";

  const moodTrend = _calcTrend(recentCheckIns.map(c => c.moodScore));
  const stressTrend = _calcTrend(recentCheckIns.map(c => c.stressScore));

  const activeGoals = goals.filter(g => g.status === "active").length;
  const completedGoals = goals.filter(g => g.status === "completed").length;

  return {
    studentId:        student.id,
    studentName:      student.fullName,
    yearGroup:        student.yearGroupName,
    class:            student.className,
    alertLevel:       alertResult.level,
    alertReasons:     alertResult.reasons,
    wellbeingScore:   student.wellbeingScore,
    attendanceRate:   attendance?.overallRate ?? student.attendanceRate,
    engagementScore:  student.engagementScore,
    recentMoodAvg:    avgMood,
    recentStressAvg:  avgStress,
    moodTrend,
    stressTrend,
    checkInCount:     checkIns.length,
    lastCheckIn:      student.lastCheckIn,
    activeGoals,
    completedGoals,
    senFlag:          student.senFlag,
    ppFlag:           student.ppFlag,
    recommendedActions: _buildStudentRecommendations(alertResult, student, attendance),
    disclaimer: "This summary is based on self-reported data and attendance records. It is not a clinical assessment.",
    generatedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// CLASS SUMMARY
// ─────────────────────────────────────────────

/**
 * generateClassSummary(classId, students, checkIns)
 * Returns a class-level wellbeing overview.
 */
export function generateClassSummary(cls, students, checkIns) {
  const classStudents = students.filter(s => s.classId === cls.id);
  const classCheckIns = checkIns.filter(c => c.classId === cls.id);

  const redCount   = classStudents.filter(s => s.alertLevel === "red").length;
  const amberCount = classStudents.filter(s => s.alertLevel === "amber").length;
  const greenCount = classStudents.filter(s => s.alertLevel === "green").length;

  const avgWellbeing = _avg(classStudents.map(s => s.wellbeingScore));
  const avgAttendance = _avg(classStudents.map(s => s.attendanceRate));
  const avgEngagement = _avg(classStudents.map(s => s.engagementScore));

  const recentCI = classCheckIns.slice(-50);
  const avgMood  = recentCI.length ? _avg(recentCI.map(c => c.moodScore)) : null;
  const avgStress = recentCI.length ? _avg(recentCI.map(c => c.stressScore)) : null;

  return {
    classId:          cls.id,
    className:        cls.name,
    yearGroupId:      cls.yearGroupId,
    teacherName:      cls.teacherName,
    totalStudents:    classStudents.length,
    alertBreakdown:   { red: redCount, amber: amberCount, green: greenCount },
    studentsRequiringSupport: redCount + amberCount,
    avgWellbeingScore:  +avgWellbeing.toFixed(1),
    avgAttendanceRate:  +avgAttendance.toFixed(1),
    avgEngagementScore: +avgEngagement.toFixed(1),
    avgMoodScore:       avgMood !== null ? +avgMood.toFixed(1) : null,
    avgStressScore:     avgStress !== null ? +avgStress.toFixed(1) : null,
    totalCheckIns:     classCheckIns.length,
    wellbeingRating:   avgWellbeing >= 70 ? "Good" : avgWellbeing >= 55 ? "Requires Attention" : "Needs Support",
    generatedAt:       new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// YEAR GROUP SUMMARY
// ─────────────────────────────────────────────

export function generateYearGroupSummary(yearGroup, students, checkIns, classes) {
  const ygStudents = students.filter(s => s.yearGroupId === yearGroup.id);
  const ygCheckIns = checkIns.filter(c => c.yearGroupId === yearGroup.id);
  const ygClasses  = classes.filter(c => c.yearGroupId === yearGroup.id);

  const classSummaries = ygClasses.map(c => generateClassSummary(c, ygStudents, ygCheckIns));

  const redCount   = ygStudents.filter(s => s.alertLevel === "red").length;
  const amberCount = ygStudents.filter(s => s.alertLevel === "amber").length;
  const greenCount = ygStudents.filter(s => s.alertLevel === "green").length;

  const avgWellbeing  = _avg(ygStudents.map(s => s.wellbeingScore));
  const avgAttendance = _avg(ygStudents.map(s => s.attendanceRate));

  return {
    yearGroupId:      yearGroup.id,
    yearGroupName:    yearGroup.name,
    totalStudents:    ygStudents.length,
    totalClasses:     ygClasses.length,
    alertBreakdown:   { red: redCount, amber: amberCount, green: greenCount },
    studentsRequiringSupport: redCount + amberCount,
    avgWellbeingScore: +avgWellbeing.toFixed(1),
    avgAttendanceRate: +avgAttendance.toFixed(1),
    classSummaries,
    wellbeingTrend:   _calcTrendLabel(ygStudents.map(s => s.wellbeingScore)),
    topConcerns:      _identifyTopConcerns(ygStudents, ygCheckIns),
    generatedAt:      new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// SCHOOL OVERVIEW METRICS
// ─────────────────────────────────────────────

export function generateSchoolOverview(students, checkIns, interventions, supportRequests) {
  const totalStudents         = students.length;
  const studentsRequiringSupport = students.filter(s => s.alertLevel !== "green").length;
  const redAlerts             = students.filter(s => s.alertLevel === "red").length;
  const amberAlerts           = students.filter(s => s.alertLevel === "amber").length;
  const activeInterventions   = interventions.filter(i => i.status === "active").length;
  const openSupportReqs       = supportRequests.filter(r => r.status === "open").length;

  const avgWellbeing  = _avg(students.map(s => s.wellbeingScore));
  const avgAttendance = _avg(students.map(s => s.attendanceRate));
  const avgEngagement = _avg(students.map(s => s.engagementScore));

  const persistentAbsence = students.filter(s => s.attendanceRate < 90).length;

  const checkInLast7 = checkIns.filter(c => {
    return (Date.now() - new Date(c.date)) < 7 * 86400000;
  }).length;

  return {
    totalStudents,
    studentsRequiringSupport,
    activeAlerts:          redAlerts + amberAlerts,
    redAlerts,
    amberAlerts,
    greenStudents:         totalStudents - studentsRequiringSupport,
    activeInterventions,
    openSupportRequests:   openSupportReqs,
    avgWellbeingScore:     +avgWellbeing.toFixed(1),
    avgAttendanceRate:     +avgAttendance.toFixed(1),
    avgEngagementScore:    +avgEngagement.toFixed(1),
    persistentAbsenceCount: persistentAbsence,
    persistentAbsenceRate: +((persistentAbsence / totalStudents) * 100).toFixed(1),
    checkInsLast7Days:     checkInLast7,
    checkInEngagementRate: +((checkInLast7 / totalStudents) * 100).toFixed(1),
    wellbeingRating:       avgWellbeing >= 70 ? "Good" : avgWellbeing >= 55 ? "Requires Attention" : "Needs Improvement",
    generatedAt:           new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// STRESS TREND ANALYSIS
// ─────────────────────────────────────────────

export function analyseStressTrends(checkIns, groupBy = "week") {
  const groups = {};

  checkIns.forEach((ci) => {
    const d = new Date(ci.date);
    const key = groupBy === "week"
      ? `${d.getFullYear()}-W${_weekNumber(d)}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (!groups[key]) groups[key] = { stressScores: [], moodScores: [], count: 0 };
    groups[key].stressScores.push(ci.stressScore);
    groups[key].moodScores.push(ci.moodScore);
    groups[key].count++;
  });

  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([period, data]) => ({
    period,
    avgStress:     +_avg(data.stressScores).toFixed(2),
    avgMood:       +_avg(data.moodScores).toFixed(2),
    sampleSize:    data.count,
    highStressCount: data.stressScores.filter(s => s >= 4).length
  }));
}

// ─────────────────────────────────────────────
// ATTENDANCE CORRELATION
// ─────────────────────────────────────────────

export function correlateAttendanceWellbeing(students) {
  const buckets = {
    "90-100%": { wellbeing: [], mood: [], engagement: [] },
    "80-89%":  { wellbeing: [], mood: [], engagement: [] },
    "70-79%":  { wellbeing: [], mood: [], engagement: [] },
    "<70%":    { wellbeing: [], mood: [], engagement: [] }
  };

  students.forEach((s) => {
    const r = s.attendanceRate;
    const bucket = r >= 90 ? "90-100%" : r >= 80 ? "80-89%" : r >= 70 ? "70-79%" : "<70%";
    buckets[bucket].wellbeing.push(s.wellbeingScore);
    buckets[bucket].engagement.push(s.engagementScore);
  });

  return Object.entries(buckets).map(([range, data]) => ({
    attendanceRange: range,
    count:          data.wellbeing.length,
    avgWellbeing:   data.wellbeing.length ? +_avg(data.wellbeing).toFixed(1) : null,
    avgEngagement:  data.engagement.length ? +_avg(data.engagement).toFixed(1) : null
  }));
}

// ─────────────────────────────────────────────
// INTERVENTION SUGGESTIONS
// ─────────────────────────────────────────────

export function suggestInterventions(student, checkIns = [], attendance = null) {
  const alertResult = calculateAlertLevel(student, checkIns.slice(-5), attendance);
  const suggestions = [];

  if (alertResult.level === "red") {
    suggestions.push({
      priority: "high",
      type: "Wellbeing Check-In Meeting",
      reason: "Student wellbeing indicators require immediate pastoral attention",
      urgency: "This week"
    });
  }

  if (attendance?.overallRate < 85) {
    suggestions.push({
      priority: "high",
      type: "Attendance Improvement Plan",
      reason: "Attendance below 85% — early intervention recommended",
      urgency: "This week"
    });
  }

  if (alertResult.level !== "green" && !student.senFlag) {
    suggestions.push({
      priority: "medium",
      type: "Pastoral Support Plan",
      reason: "Amber/red wellbeing indicators suggest structured support may help",
      urgency: "Within 2 weeks"
    });
  }

  if (checkIns.length > 0) {
    const avgStress = _avg(checkIns.slice(-5).map(c => c.stressScore));
    if (avgStress >= 4) {
      suggestions.push({
        priority: "medium",
        type: "Stress Management Resources",
        reason: "Consistently high stress scores in recent check-ins",
        urgency: "This week"
      });
    }
  }

  return suggestions;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function _calcTrend(scores) {
  if (scores.length < 2) return "stable";
  const half = Math.floor(scores.length / 2);
  const firstHalf = _avg(scores.slice(0, half));
  const secondHalf = _avg(scores.slice(half));
  const diff = secondHalf - firstHalf;
  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}

function _calcTrendLabel(scores) {
  const trend = _calcTrend(scores);
  return trend === "improving" ? "↑ Improving" :
         trend === "declining" ? "↓ Declining" : "→ Stable";
}

function _weekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function _buildStudentRecommendations(alertResult, student, attendance) {
  const recs = [];
  if (alertResult.level === "red") {
    recs.push("Schedule a wellbeing conversation with pastoral staff");
    recs.push("Review recent check-ins and support request history");
  }
  if (alertResult.level === "amber") {
    recs.push("Monitor student closely over the next two weeks");
    recs.push("Consider a check-in with form tutor");
  }
  if (attendance?.overallRate < 90) {
    recs.push("Initiate attendance support conversation");
  }
  if (!recs.length) {
    recs.push("Continue regular check-ins");
    recs.push("Student appears to be doing well");
  }
  return recs;
}

function _identifyTopConcerns(students, checkIns) {
  const concerns = [];
  const lowMood = students.filter(s => s.wellbeingScore < 50).length;
  const lowAttendance = students.filter(s => s.attendanceRate < 90).length;
  const lowEngagement = students.filter(s => s.engagementScore < 50).length;

  if (lowMood > students.length * 0.1) concerns.push(`${lowMood} students with low wellbeing scores`);
  if (lowAttendance > students.length * 0.1) concerns.push(`${lowAttendance} students with attendance below 90%`);
  if (lowEngagement > students.length * 0.1) concerns.push(`${lowEngagement} students with low engagement`);
  if (!concerns.length) concerns.push("No significant concerns identified at year group level");

  return concerns;
}
