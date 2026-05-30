// SWP — Demo Data Generator
// Generates 1000 students, 40 teachers, 5 year groups, 30 classes
// + historical check-ins, interventions, support requests, attendance data
// Uses deterministic seeded random for reproducible demos

// ─────────────────────────────────────────────
// SEED UTILITIES
// ─────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rand = seededRandom(20240901);

function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max, dp = 1) { return parseFloat((rand() * (max - min) + min).toFixed(dp)); }
function randChoice(arr) { return arr[Math.floor(rand() * arr.length)]; }
function randDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rand() * daysAgo));
  return d.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────
// NAMES
// ─────────────────────────────────────────────

const FIRST_NAMES = [
  "Oliver","Amelia","Harry","Isla","George","Ava","Noah","Emily","Charlie","Isabella",
  "Jack","Mia","Freddie","Poppy","Alfie","Ella","Oscar","Lily","Leo","Sophia",
  "Archie","Grace","James","Evie","William","Ruby","Henry","Sophie","Thomas","Jessica",
  "Muhammad","Freya","Sebastian","Olivia","Ethan","Charlotte","Alexander","Hannah","Elijah","Lucy",
  "Jake","Chloe","Lucas","Zoe","Ryan","Emma","Luca","Daisy","Dylan","Alice",
  "Kai","Fatima","Ravi","Priya","Jamal","Aisha","Chen","Mei","Arjun","Ananya",
  "Liam","Molly","Callum","Millie","Cameron","Amber","Rhys","Lexi","Cian","Niamh",
  "Aaron","Jess","Tyler","Layla","Jayden","Eva","Ethan","Rosa","Nathan","Caitlin",
  "Jordan","Abby","Sam","Bethany","Kieran","Elena","Declan","Maya","Finn","Ellie"
];

const LAST_NAMES = [
  "Smith","Jones","Williams","Taylor","Brown","Davies","Evans","Wilson","Thomas","Roberts",
  "Johnson","Lewis","Walker","Robinson","Wood","Thompson","White","Watson","Jackson","Harris",
  "Martin","Patel","Khan","Ahmed","Hussain","Ali","Rahman","Begum","Shah","Islam",
  "Murphy","Kelly","O'Brien","Sullivan","Walsh","Clarke","Byrne","Collins","Campbell","Stewart",
  "Mitchell","Carter","Edwards","Turner","Wright","Green","Adams","Hall","Hill","Moore",
  "Young","Allen","King","Scott","Baker","Nelson","Carter","Bell","Phillips","Morris"
];

function makeName() {
  return { first: randChoice(FIRST_NAMES), last: randChoice(LAST_NAMES) };
}

// ─────────────────────────────────────────────
// YEAR GROUPS
// ─────────────────────────────────────────────

export const YEAR_GROUPS = [
  { id: "yg-7",  name: "Year 7",  ageRange: "11-12", studentCount: 200 },
  { id: "yg-8",  name: "Year 8",  ageRange: "12-13", studentCount: 200 },
  { id: "yg-9",  name: "Year 9",  ageRange: "13-14", studentCount: 200 },
  { id: "yg-10", name: "Year 10", ageRange: "14-15", studentCount: 200 },
  { id: "yg-11", name: "Year 11", ageRange: "15-16", studentCount: 200 }
];

// ─────────────────────────────────────────────
// TEACHERS (40)
// ─────────────────────────────────────────────

const SUBJECTS = [
  "English","Mathematics","Science","History","Geography","Art","Music","PE",
  "ICT","French","Spanish","Drama","PSHE","Religious Studies","Design & Technology"
];
const ROLES_EDU = ["Teacher","Pastoral Lead","Head of Year","SENCO","Safeguarding Officer"];

export function generateTeachers() {
  const teachers = [];
  for (let i = 0; i < 40; i++) {
    const { first, last } = makeName();
    teachers.push({
      id:       `T${String(i + 1).padStart(3, "0")}`,
      name:     `${first} ${last}`,
      email:    `${first.toLowerCase()}.${last.toLowerCase()}@school.edu`,
      subject:  randChoice(SUBJECTS),
      role:     i < 5 ? randChoice(["Pastoral Lead","Head of Year","Safeguarding Officer"]) : "Teacher",
      yearGroup: randChoice(YEAR_GROUPS).id,
      classes:  [],
      joinedDate: randDate(1000)
    });
  }
  return teachers;
}

// ─────────────────────────────────────────────
// CLASSES (30)
// ─────────────────────────────────────────────

export function generateClasses(teachers) {
  const classes = [];
  const classNames = ["Alpha","Beta","Gamma","Delta","Epsilon","Zeta"];
  let classIdx = 0;

  YEAR_GROUPS.forEach((yg) => {
    const count = 6; // 6 classes per year = 30 total
    for (let i = 0; i < count; i++) {
      const teacher = teachers[classIdx % teachers.length];
      const cls = {
        id:        `C${String(classIdx + 1).padStart(3, "0")}`,
        name:      `${yg.name} ${classNames[i]}`,
        yearGroupId: yg.id,
        teacherId:   teacher.id,
        teacherName: teacher.name,
        studentCount: 0,
        subject:     teacher.subject
      };
      classes.push(cls);
      teacher.classes.push(cls.id);
      classIdx++;
    }
  });
  return classes;
}

// ─────────────────────────────────────────────
// STUDENTS (1000)
// ─────────────────────────────────────────────

export function generateStudents(classes) {
  const students = [];
  let studentIdx = 0;

  classes.forEach((cls) => {
    const classSize = 33; // ~1000 total across 30 classes
    for (let i = 0; i < classSize && studentIdx < 1000; i++) {
      const { first, last } = makeName();
      const yg = YEAR_GROUPS.find(y => y.id === cls.yearGroupId);
      const baseWellbeing = randFloat(40, 95);
      const trend = randChoice(["improving","stable","declining","stable","stable"]);

      students.push({
        id:            `S${String(studentIdx + 1).padStart(4, "0")}`,
        firstName:     first,
        lastName:      last,
        fullName:      `${first} ${last}`,
        email:         `${first.toLowerCase()}.${last.toLowerCase()}@student.school.edu`,
        yearGroupId:   cls.yearGroupId,
        yearGroupName: yg?.name || "Unknown",
        classId:       cls.id,
        className:     cls.name,
        dob:           randDate(2000),
        wellbeingScore: baseWellbeing,
        trend,
        alertLevel:    baseWellbeing < 45 ? "red" : baseWellbeing < 65 ? "amber" : "green",
        attendanceRate: randFloat(72, 100),
        engagementScore: randFloat(35, 100),
        supportFlag:   baseWellbeing < 55,
        senFlag:       rand() < 0.12,
        ppFlag:        rand() < 0.18,
        lastCheckIn:   randDate(14),
        registeredDate: randDate(365)
      });
      cls.studentCount++;
      studentIdx++;
    }
  });

  return students;
}

// ─────────────────────────────────────────────
// CHECK-INS (Historical — ~10 per student over 90 days)
// ─────────────────────────────────────────────

const MOOD_LABELS = ["Very Low","Low","Neutral","Good","Great"];
const STRESS_LABELS = ["None","Low","Moderate","High","Very High"];

export function generateCheckIns(students) {
  const checkIns = [];
  let id = 1;

  students.forEach((student) => {
    const count = randInt(5, 15);
    for (let i = 0; i < count; i++) {
      const moodScore  = randInt(1, 5);
      const stressScore = randInt(1, 5);
      const daysAgo = Math.floor(i * (90 / count));
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      checkIns.push({
        id:             `CI${String(id++).padStart(6, "0")}`,
        studentId:      student.id,
        studentName:    student.fullName,
        classId:        student.classId,
        yearGroupId:    student.yearGroupId,
        date:           date.toISOString().split("T")[0],
        timestamp:      date.toISOString(),
        moodScore,
        moodLabel:      MOOD_LABELS[moodScore - 1],
        stressScore,
        stressLabel:    STRESS_LABELS[stressScore - 1],
        energyScore:    randInt(1, 5),
        motivationScore: randInt(1, 5),
        confidenceScore: randInt(1, 5),
        attendanceReflection: randChoice([
          "I attended all lessons","I missed one lesson","I struggled to attend","I was absent for medical reasons","I arrived late to some lessons"
        ]),
        note:           rand() < 0.3 ? randChoice([
          "Feeling overwhelmed with coursework",
          "Had a great day today",
          "Struggling with friendships",
          "Excited about upcoming project",
          "Worried about exams",
          "Feeling much better this week",
          "Having trouble sleeping",
          "Really enjoyed today's lesson"
        ]) : null,
        flags: moodScore <= 2 && stressScore >= 4 ? ["low_mood","high_stress"] :
               moodScore <= 2 ? ["low_mood"] :
               stressScore >= 4 ? ["high_stress"] : []
      });
    }
  });

  return checkIns;
}

// ─────────────────────────────────────────────
// SUPPORT REQUESTS
// ─────────────────────────────────────────────

const SUPPORT_CATEGORIES = [
  "Academic Support","Mental Health","Bullying","Family Issues",
  "Attendance","Financial Support","Friendship Issues","Exam Anxiety",
  "Learning Difficulties","Bereavement"
];

export function generateSupportRequests(students) {
  const requests = [];
  let id = 1;

  students.filter(s => rand() < 0.25).forEach((student) => {
    const count = randInt(1, 4);
    for (let i = 0; i < count; i++) {
      const status = randChoice(["open","in_progress","resolved","resolved","resolved"]);
      requests.push({
        id:          `SR${String(id++).padStart(4, "0")}`,
        studentId:   student.id,
        studentName: student.fullName,
        classId:     student.classId,
        yearGroupId: student.yearGroupId,
        category:    randChoice(SUPPORT_CATEGORIES),
        urgency:     randChoice(["low","medium","high","urgent"]),
        status,
        description: "Student has requested support via the wellbeing platform.",
        createdDate: randDate(60),
        resolvedDate: status === "resolved" ? randDate(30) : null,
        assignedTo:  status !== "open" ? `T${String(randInt(1,40)).padStart(3,"0")}` : null
      });
    }
  });

  return requests;
}

// ─────────────────────────────────────────────
// INTERVENTIONS
// ─────────────────────────────────────────────

const INTERVENTION_TYPES = [
  "Wellbeing Check-In Meeting","Pastoral Support Plan","Referral to CAMHS",
  "Parent/Guardian Meeting","Academic Support Plan","Peer Mentoring",
  "Counselling Referral","Attendance Improvement Plan","Safeguarding Referral",
  "External Agency Referral"
];

export function generateInterventions(students) {
  const interventions = [];
  let id = 1;

  students.filter(s => s.alertLevel !== "green" || rand() < 0.08).forEach((student) => {
    const count = randInt(1, 3);
    for (let i = 0; i < count; i++) {
      interventions.push({
        id:           `INT${String(id++).padStart(4, "0")}`,
        studentId:    student.id,
        studentName:  student.fullName,
        yearGroupId:  student.yearGroupId,
        type:         randChoice(INTERVENTION_TYPES),
        status:       randChoice(["planned","active","completed","completed","completed"]),
        priority:     student.alertLevel === "red" ? "high" : "medium",
        outcome:      rand() < 0.6 ? randChoice([
          "Student responded well","Further support needed","Referred to external services",
          "Situation resolved","Ongoing monitoring required"
        ]) : null,
        createdDate:  randDate(90),
        reviewDate:   randDate(30),
        assignedTo:   `T${String(randInt(1,40)).padStart(3,"0")}`
      });
    }
  });

  return interventions;
}

// ─────────────────────────────────────────────
// ATTENDANCE DATA
// ─────────────────────────────────────────────

export function generateAttendanceData(students) {
  return students.map((student) => ({
    studentId:        student.id,
    studentName:      student.fullName,
    yearGroupId:      student.yearGroupId,
    classId:          student.classId,
    overallRate:      student.attendanceRate,
    authorisedAbsence: randFloat(0, student.attendanceRate < 85 ? 12 : 5),
    unauthorisedAbsence: randFloat(0, student.attendanceRate < 85 ? 8 : 2),
    termAttendance: {
      autumn: randFloat(75, 100),
      spring: randFloat(75, 100),
      summer: randFloat(75, 100)
    },
    persistentlyAbsent: student.attendanceRate < 90,
    recentTrend: student.trend
  }));
}

// ─────────────────────────────────────────────
// WELLBEING GOALS
// ─────────────────────────────────────────────

const GOAL_TYPES = [
  "Improve sleep routine","Reduce screen time","Exercise more",
  "Talk to a friend","Complete homework on time","Practice mindfulness",
  "Read for 20 minutes daily","Eat healthier","Attend all lessons",
  "Join a school club","Practice breathing exercises","Keep a gratitude journal"
];

export function generateGoals(students) {
  const goals = [];
  let id = 1;

  students.filter(() => rand() < 0.6).forEach((student) => {
    const count = randInt(1, 3);
    for (let i = 0; i < count; i++) {
      goals.push({
        id:         `G${String(id++).padStart(5, "0")}`,
        studentId:  student.id,
        title:      randChoice(GOAL_TYPES),
        progress:   randInt(0, 100),
        status:     randChoice(["active","completed","paused","active","active"]),
        createdDate: randDate(30),
        targetDate:  randDate(-14) // future
      });
    }
  });

  return goals;
}

// ─────────────────────────────────────────────
// MASTER GENERATOR
// ─────────────────────────────────────────────

export function generateAllDemoData() {
  const teachers    = generateTeachers();
  const classes     = generateClasses(teachers);
  const students    = generateStudents(classes);
  const checkIns    = generateCheckIns(students);
  const supportReqs = generateSupportRequests(students);
  const interventions = generateInterventions(students);
  const attendance  = generateAttendanceData(students);
  const goals       = generateGoals(students);

  return {
    yearGroups: YEAR_GROUPS,
    teachers,
    classes,
    students,
    checkIns,
    supportRequests: supportReqs,
    interventions,
    attendance,
    goals,
    meta: {
      generatedAt:     new Date().toISOString(),
      totalStudents:   students.length,
      totalTeachers:   teachers.length,
      totalClasses:    classes.length,
      totalYearGroups: YEAR_GROUPS.length,
      totalCheckIns:   checkIns.length,
      totalSupportReqs: supportReqs.length,
      totalInterventions: interventions.length
    }
  };
}
