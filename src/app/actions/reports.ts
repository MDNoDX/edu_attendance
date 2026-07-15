"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeDecimals } from "@/lib/serialize";

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
  monthlyPrice: number;
  present: number;
  late: number;
  excusedAbsent: number;
  unexcusedAbsent: number;
  earned: number;
  lostToCutoff: number;
}

export interface GroupBreakdown {
  id: string;
  name: string;
  studentCount: number;
  monthlyRevenue: number;
  earned: number;
  lostToCutoff: number;
}

export interface ReportAnalytics {
  from: Date;
  to: Date;
  totalStudents: number;
  totalMonthlyRevenue: number;
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
 * The unified financial + attendance view behind the Hisobot page: within a
 * date range (and an optional group or single-student narrowing), shows how
 * much tuition revenue the teacher's students represent, how much the
 * teacher has actually earned in that window under the consecutive-miss
 * cutoff rule, and a full group/student breakdown — the same numbers the
 * PDF/Excel export produces, so what's on screen always matches the file.
 */
export async function getReportAnalytics(filters: ReportFilters): Promise<ReportAnalytics> {
  const session = await requireSession();

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
      course: true,
      group: true,
      attendances: {
        where: { lessonSession: { date: { gte: filters.from, lte: filters.to } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const studentBreakdowns: StudentBreakdown[] = students.map((s) => {
    let present = 0;
    let late = 0;
    let excusedAbsent = 0;
    let unexcusedAbsent = 0;
    let earned = 0;
    let lostToCutoff = 0;

    for (const a of s.attendances) {
      if (a.status === "PRESENT") present += 1;
      else if (a.status === "LATE") late += 1;
      else if (a.status === "EXCUSED_ABSENT") excusedAbsent += 1;
      else if (a.status === "UNEXCUSED_ABSENT") unexcusedAbsent += 1;

      earned += Number(a.teacherEarningAmount);
      if (
        (a.status === "EXCUSED_ABSENT" || a.status === "UNEXCUSED_ABSENT") &&
        Number(a.teacherEarningAmount) === 0
      ) {
        lostToCutoff += Number(a.lessonValueSnapshot);
      }
    }

    return {
      id: s.id,
      fullName: `${s.lastName} ${s.firstName}`,
      groupId: s.groupId,
      groupName: s.group.name,
      monthlyPrice: Number(s.course.monthlyPrice),
      present,
      late,
      excusedAbsent,
      unexcusedAbsent,
      earned,
      lostToCutoff,
    };
  });

  const groupMap = new Map<string, GroupBreakdown>();
  for (const s of studentBreakdowns) {
    const existing = groupMap.get(s.groupId);
    if (existing) {
      existing.studentCount += 1;
      existing.monthlyRevenue += s.monthlyPrice;
      existing.earned += s.earned;
      existing.lostToCutoff += s.lostToCutoff;
    } else {
      groupMap.set(s.groupId, {
        id: s.groupId,
        name: s.groupName,
        studentCount: 1,
        monthlyRevenue: s.monthlyPrice,
        earned: s.earned,
        lostToCutoff: s.lostToCutoff,
      });
    }
  }

  const totals = studentBreakdowns.reduce(
    (acc, s) => {
      acc.totalMonthlyRevenue += s.monthlyPrice;
      acc.totalEarnedInRange += s.earned;
      acc.totalLostToCutoff += s.lostToCutoff;
      acc.present += s.present;
      acc.late += s.late;
      acc.excusedAbsent += s.excusedAbsent;
      acc.unexcusedAbsent += s.unexcusedAbsent;
      return acc;
    },
    { totalMonthlyRevenue: 0, totalEarnedInRange: 0, totalLostToCutoff: 0, present: 0, late: 0, excusedAbsent: 0, unexcusedAbsent: 0 },
  );

  return serializeDecimals({
    from: filters.from,
    to: filters.to,
    totalStudents: students.length,
    totalMonthlyRevenue: totals.totalMonthlyRevenue,
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
