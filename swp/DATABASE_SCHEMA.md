# SWP — Database Schema
## Student Wellbeing Platform — Full Entity Definitions

---

## Core Entities

### 1. Student
| Field | Type | Notes |
|---|---|---|
| id | string | S0001–S1000 |
| firstName | string | |
| lastName | string | |
| fullName | string | |
| email | string | student@school.edu |
| yearGroupId | string | FK → YearGroup |
| yearGroupName | string | |
| classId | string | FK → Class |
| className | string | |
| dob | date | |
| wellbeingScore | float | 0–100, composite |
| alertLevel | enum | red \| amber \| green |
| trend | enum | improving \| stable \| declining |
| attendanceRate | float | 0–100% |
| engagementScore | float | 0–100 |
| supportFlag | boolean | |
| senFlag | boolean | Special Educational Needs |
| ppFlag | boolean | Pupil Premium |
| lastCheckIn | date | |
| registeredDate | date | |

### 2. Teacher
| Field | Type | Notes |
|---|---|---|
| id | string | T001–T040 |
| name | string | |
| email | string | |
| subject | string | |
| role | enum | Teacher \| Pastoral Lead \| Head of Year \| SENCO \| Safeguarding Officer |
| yearGroup | string | FK → YearGroup |
| classes | string[] | FK[] → Class |
| joinedDate | date | |

### 3. YearGroup
| Field | Type | Notes |
|---|---|---|
| id | string | yg-7 to yg-11 |
| name | string | Year 7 – Year 11 |
| ageRange | string | 11-12, 12-13, etc. |
| studentCount | int | |

### 4. Class
| Field | Type | Notes |
|---|---|---|
| id | string | C001–C030 |
| name | string | Year 7 Alpha, etc. |
| yearGroupId | string | FK → YearGroup |
| teacherId | string | FK → Teacher |
| teacherName | string | |
| studentCount | int | |
| subject | string | |

### 5. CheckIn
| Field | Type | Notes |
|---|---|---|
| id | string | CI000001+ |
| studentId | string | FK → Student |
| studentName | string | |
| classId | string | FK → Class |
| yearGroupId | string | FK → YearGroup |
| date | date | |
| timestamp | datetime | |
| moodScore | int | 1–5 |
| moodLabel | string | Very Low – Great |
| stressScore | int | 1–5 |
| stressLabel | string | None – Very High |
| energyScore | int | 1–5 |
| motivationScore | int | 1–5 |
| confidenceScore | int | 1–5 |
| attendanceReflection | string | Self-reported |
| note | string? | Optional, private |
| flags | string[] | low_mood, high_stress |

### 6. SupportRequest
| Field | Type | Notes |
|---|---|---|
| id | string | SR0001+ |
| studentId | string | FK → Student |
| studentName | string | |
| classId | string | FK → Class |
| yearGroupId | string | FK → YearGroup |
| category | enum | Academic Support, Mental Health, Bullying, etc. |
| urgency | enum | low \| medium \| high \| urgent |
| status | enum | open \| in_progress \| resolved |
| description | string | |
| createdDate | date | |
| resolvedDate | date? | |
| assignedTo | string? | FK → Teacher |

### 7. Intervention
| Field | Type | Notes |
|---|---|---|
| id | string | INT0001+ |
| studentId | string | FK → Student |
| studentName | string | |
| yearGroupId | string | FK → YearGroup |
| type | enum | Wellbeing Check-In Meeting, Pastoral Support Plan, Referral to CAMHS, etc. |
| status | enum | planned \| active \| completed |
| priority | enum | low \| medium \| high |
| outcome | string? | |
| createdDate | date | |
| reviewDate | date | |
| assignedTo | string | FK → Teacher |

### 8. AttendanceRecord
| Field | Type | Notes |
|---|---|---|
| studentId | string | FK → Student |
| studentName | string | |
| yearGroupId | string | FK → YearGroup |
| classId | string | FK → Class |
| overallRate | float | 0–100% |
| authorisedAbsence | float | days |
| unauthorisedAbsence | float | days |
| termAttendance | object | { autumn, spring, summer } |
| persistentlyAbsent | boolean | < 90% |
| recentTrend | enum | improving \| stable \| declining |

### 9. WellbeingGoal
| Field | Type | Notes |
|---|---|---|
| id | string | G00001+ |
| studentId | string | FK → Student |
| title | string | |
| progress | int | 0–100% |
| status | enum | active \| completed \| paused |
| createdDate | date | |
| targetDate | date? | |

### 10. JournalEntry
| Field | Type | Notes |
|---|---|---|
| id | string | |
| studentId | string | FK → Student |
| content | string | Private — staff cannot access |
| createdDate | datetime | |
| Private | boolean | Always true |

### 11. SafeguardingCase *(Restricted)*
| Field | Type | Notes |
|---|---|---|
| id | string | |
| studentId | string | FK → Student |
| natureOfConcern | enum | See KCSIE categories |
| details | string | Factual observations only |
| recordedBy | string | FK → Teacher (DSL only) |
| dateRecorded | datetime | |
| status | enum | open \| escalated \| closed |
| auditLog | object[] | Full audit trail |

### 12. Resource
| Field | Type | Notes |
|---|---|---|
| id | string | |
| title | string | |
| category | string | Mental Health, Academic, etc. |
| type | enum | article \| video \| link \| contact |
| url | string? | |
| createdBy | string | |
| visibleTo | string[] | Roles |

---

## Alert Logic

```
Student wellbeingScore < 45  → RED alert
Student wellbeingScore < 65  → AMBER alert
Student wellbeingScore ≥ 65  → GREEN

Additional triggers:
  moodScore avg (last 5) ≤ 2  → +flag: low_mood
  stressScore avg (last 5) ≥ 4 → +flag: high_stress  
  attendanceRate < 90%        → +flag: attendance_concern
  No check-in in 7+ days      → +flag: engagement_concern
  3+ support requests          → +flag: repeat_support
```

---

## Role Hierarchy

| Role | BCO Equivalent | Scope |
|---|---|---|
| school_admin | super_admin | Full platform access |
| safeguarding_officer | tenant_admin | All students, safeguarding records |
| pastoral_lead | operator | Year group + class level |
| teacher | operator | Own classes only |
| student | viewer | Own data only |

---

## Report Types

1. Student Wellbeing Report — per student
2. Class Wellbeing Report — per class
3. Year Group Wellbeing Report — per year group
4. Attendance Correlation Report — school-wide
5. Intervention Report — all interventions
6. Support Request Report — request tracking
7. Engagement Report — platform usage
8. School Wellbeing Report — governors/leadership
