"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeDecimals } from "@/lib/serialize";
import { countScheduledLessons } from "@/lib/attendance-payment";

export interface ReportFilters {
  from: Date;
  to: Date;
  groupId?: string;
  studentId?: string;
}

export interface StudentBreakdown {
  id: string;
  fullName: string;
  groupId: string;
  groupName: string;
  /** The student's own flat monthly tuition — the "umumiy tushadigan summa" (gross revenue) side. */
  monthlyPrice: number;
  /** The teacher's own per-attended-lesson earning share for this student's group. */
  lessonRate: number;
  present: number;
  late: number;
  excusedAbsent: number;
  unexcusedAbsent: number;
  /** Actual teacher earning within the report's own (arbitrary) from/to filter — backs the detail table and the export. */
  earnedInRange: number;
  lostToCutoff: number;
  /** How many real lesson occurrences this student's group's weekly schedule produces in the current calendar month. */
  scheduledLessonsThisMonth: number;
  /** lessonRate * scheduledLessonsThisMonth — the ceiling the teacher could earn from this student THIS month if every lesson were attended. Never based on the student's tuition price. */
  expectedThisMonth: number;
  /** Actual teacher earning, cumulative from the 1st of the current month through today (or the filter's `to` if that's earlier) — grows day by day as attendance is marked. */
  earnedMonthToDate: number;
}

export interface GroupBreakdown {
  id: string;
  name: string;
  studentCount: number;
  grossRevenue: number;
  earnedInRange: number;
  lostToCutoff: number;
  expectedThisMonth: number;
  earnedMonthToDate: number;
}

export interface ReportAnalytics {
  from: Date;
  to: Date;
  totalStudents: number;
  /** "Umumiy tushadigan summa" — total flat tuition revenue the in-scope active students represent. Never used as an earnings ceiling. */
  totalGrossRevenue: number;
  /** "Oylik kutilayotgan summa" — the teacher's own earning ceiling for the current calendar month, computed from each group's real weekly schedule and the teacher's per-lesson rate. */
  totalExpectedThisMonth: number;
  /** The teacher's actual cumulative earning from the start of the current calendar month up to today, across every in-scope group — grows progressively as attendance is recorded. */
  totalEarnedMonthToDate: number;
  /** Actual teacher earning within the report's own (arbitrary) from/to filter — what the detail table/export below reflects. */
  totalEarnedInRange: number;
  totalLostToCutoff: number;
  present: number;
  late: number;
  excusedAbsent: number;
  unexcusedAbsent: number;
  groups: GroupBreakdown[];
  students: StudentBreakdown[];
}

/**
 * The unified financial + attendance view behind the Hisobot page.
 *
 * Three financial figures are deliberately kept distinct because they answer
 * three different questions and must never be conflated (this used to be a
 * real bug: the "monthly expected" figure was showing the student's flat
 * tuition price instead of the teacher's own earning ceiling):
 *
 *   1. totalGrossRevenue    — how much tuition the students themselves owe
 *                              in total. Has nothing to do with the teacher's
 *                              own payout.
 *   2. totalExpectedThisMonth — the teacher's own earning CEILING for the
 *                              current calendar month: per-lesson rate times
 *                              the group's real weekly schedule (e.g. a
 *                              3x/week group has a different ceiling than a
 *                              2x/week one at the same rate), assuming every
 *                              student attends every lesson.
 *   3. totalEarnedMonthToDate — what the teacher has ACTUALLY earned so far,
 *                              progressively from the 1st of this month
 *                              through today, based on real recorded
 *                              attendance.
 *
 * Alongside these, totalEarnedInRange/totalLostToCutoff still reflect the
 * teacher's own arbitrary from/to filter (which may span any period, not
 * just "this month") — that pair backs the detail table and the PDF/Excel
 * export, exactly as before.
 */
export async function getReportAnalytics(filters: ReportFilters): Promise<ReportAnalytics> {
  const session = await requireSession();

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: { defaultLessonRate: true },
  });
  const myDefaultRate = Number(me.defaultLessonRate);

  const studentWhere: Record<string, unknown> = {
    userId: session.sub,
    deletedAt: null,
    status: "ACTIVE",
  };
  if (filters.groupId) studentWhere.groupId = filters.groupId;
  if (filters.studentId) studentWhere.id = filters.studentId;

  const students = await prisma.student.findMany({
    where: studentWhere,
    include: {
      group: { include: { scheduleSlots: true } },
      attendances: {
        where: { lessonSession: { date: { gte: filters.from, lte: filters.to } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  // "Month to date" never looks past today even if the report's own from/to
  // filter extends further — this is what makes it a genuinely progressive,
  // day-by-day-growing number instead of a static range total.
  const monthToDateEnd = now < monthEnd ? now : monthEnd;

  // A second, independent attendance fetch scoped to month-to-date: the
  // teacher's ad-hoc from/to filter (used for the range table/export) and
  // "this calendar month so far" only sometimes coincide (they do by
  // default, since the Hisobot page's default range IS month-start-to-today,
  // but a teacher can pick any other range for the table below).
  const monthEarnedByStudent = new Map<string, number>();
  if (students.length > 0) {
    const monthAttendances = await prisma.attendance.findMany({
      where: {
        studentId: { in: students.map((s) => s.id) },
        lessonSession: { date: { gte: monthStart, lte: monthToDateEnd } },
      },
      select: { studentId: true, teacherEarningAmount: true },
    });
    for (const a of monthAttendances) {
      monthEarnedByStudent.set(
        a.studentId,
        (monthEarnedByStudent.get(a.studentId) ?? 0) + Number(a.teacherEarningAmount),
      );
    }
  }

  const studentBreakdowns: StudentBreakdown[] = students.map((s) => {
    let present = 0;
    let late = 0;
    let excusedAbsent = 0;
    let unexcusedAbsent = 0;
    let earnedInRange = 0;
    let lostToCutoff = 0;

    // The teacher's own per-lesson rate for THIS student's group — needed
    // inside the loop below because "Yo'qotilgan" must be the teacher's own
    // forfeited earning (e.g. 18 500 so'm x 3 missed lessons), never the
    // student's tuition-based lessonValueSnapshot. That was the exact same
    // class of bug as the old "Oylik kutilayotgan" mixup: a cutoff-zeroed
    // miss's teacherEarningAmount is 0 (that's what "forfeited" means), so
    // recovering what it WOULD have paid requires the group's own rate, not
    // a value read off the zeroed record itself.
    const lessonRate = Number(s.group.teacherLessonRateOverride ?? myDefaultRate);

    for (const a of s.attendances) {
      if (a.status === "PRESENT") present += 1;
      else if (a.status === "LATE") late += 1;
      else if (a.status === "EXCUSED_ABSENT") excusedAbsent += 1;
      else if (a.status === "UNEXCUSED_ABSENT") unexcusedAbsent += 1;

      earnedInRange += Number(a.teacherEarningAmount);
      if (
        (a.status === "EXCUSED_ABSENT" || a.status === "UNEXCUSED_ABSENT") &&
        Number(a.teacherEarningAmount) === 0
      ) {
        lostToCutoff += lessonRate;
      }
    }

    const scheduledLessonsThisMonth = countScheduledLessons(
      s.group.scheduleSlots,
      s.group.startDate,
      monthStart,
      monthEnd,
    );
    const expectedThisMonth = lessonRate * scheduledLessonsThisMonth;
    const earnedMonthToDate = monthEarnedByStudent.get(s.id) ?? 0;

    return {
      id: s.id,
      fullName: `${s.lastName} ${s.firstName}`,
      groupId: s.groupId,
      groupName: s.group.name,
      monthlyPrice: Number(s.group.monthlyPrice),
      lessonRate,
      present,
      late,
      excusedAbsent,
      unexcusedAbsent,
      earnedInRange,
      lostToCutoff,
      scheduledLessonsThisMonth,
      expectedThisMonth,
      earnedMonthToDate,
    };
  });

  const groupMap = new Map<string, GroupBreakdown>();
  for (const s of studentBreakdowns) {
    const existing = groupMap.get(s.groupId);
    if (existing) {
      existing.studentCount += 1;
      existing.grossRevenue += s.monthlyPrice;
      existing.earnedInRange += s.earnedInRange;
      existing.lostToCutoff += s.lostToCutoff;
      existing.expectedThisMonth += s.expectedThisMonth;
      existing.earnedMonthToDate += s.earnedMonthToDate;
    } else {
      groupMap.set(s.groupId, {
        id: s.groupId,
        name: s.groupName,
        studentCount: 1,
        grossRevenue: s.monthlyPrice,
        earnedInRange: s.earnedInRange,
        lostToCutoff: s.lostToCutoff,
        expectedThisMonth: s.expectedThisMonth,
        earnedMonthToDate: s.earnedMonthToDate,
      });
    }
  }

  const totals = studentBreakdowns.reduce(
    (acc, s) => {
      acc.totalGrossRevenue += s.monthlyPrice;
      acc.totalEarnedInRange += s.earnedInRange;
      acc.totalLostToCutoff += s.lostToCutoff;
      acc.totalExpectedThisMonth += s.expectedThisMonth;
      acc.totalEarnedMonthToDate += s.earnedMonthToDate;
      acc.present += s.present;
      acc.late += s.late;
      acc.excusedAbsent += s.excusedAbsent;
      acc.unexcusedAbsent += s.unexcusedAbsent;
      return acc;
    },
    {
      totalGrossRevenue: 0,
      totalEarnedInRange: 0,
      totalLostToCutoff: 0,
      totalExpectedThisMonth: 0,
      totalEarnedMonthToDate: 0,
      present: 0,
      late: 0,
      excusedAbsent: 0,
      unexcusedAbsent: 0,
    },
  );

  return serializeDecimals({
    from: filters.from,
    to: filters.to,
    totalStudents: students.length,
    totalGrossRevenue: totals.totalGrossRevenue,
    totalExpectedThisMonth: totals.totalExpectedThisMonth,
    totalEarnedMonthToDate: totals.totalEarnedMonthToDate,
    totalEarnedInRange: totals.totalEarnedInRange,
    totalLostToCutoff: totals.totalLostToCutoff,
    present: totals.present,
    late: totals.late,
    excusedAbsent: totals.excusedAbsent,
    unexcusedAbsent: totals.unexcusedAbsent,
    groups: Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    students: studentBreakdowns,
  });
}
