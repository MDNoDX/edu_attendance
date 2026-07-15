"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay } from "date-fns";

export interface PeriodBreakdown {
  present: number;
  excusedAbsent: number;
  unexcusedAbsent: number;
  late: number;
  earned: number;
  lostToCutoff: number;
}

async function summarizePeriod(userId: string, from: Date, to: Date): Promise<PeriodBreakdown> {
  const records = await prisma.attendance.findMany({
    where: { lessonSession: { userId, date: { gte: from, lte: to } } },
  });

  const summary: PeriodBreakdown = {
    present: 0,
    excusedAbsent: 0,
    unexcusedAbsent: 0,
    late: 0,
    earned: 0,
    lostToCutoff: 0,
  };

  for (const r of records) {
    if (r.status === "PRESENT") summary.present += 1;
    if (r.status === "LATE") summary.late += 1;
    if (r.status === "EXCUSED_ABSENT") summary.excusedAbsent += 1;
    if (r.status === "UNEXCUSED_ABSENT") summary.unexcusedAbsent += 1;
    summary.earned += Number(r.teacherEarningAmount);
    if ((r.status === "EXCUSED_ABSENT" || r.status === "UNEXCUSED_ABSENT") && Number(r.teacherEarningAmount) === 0) {
      const lessonValue = Number(r.lessonValueSnapshot);
      summary.lostToCutoff += lessonValue > 0 ? lessonValue : 0;
    }
  }

  return summary;
}

/** The full dashboard payload for the logged-in teacher: today/week/month/year breakdowns. */
export async function getDashboardStats() {
  const session = await requireSession();
  const now = new Date();

  const [today, week, month, year] = await Promise.all([
    summarizePeriod(session.sub, startOfDay(now), endOfDay(now)),
    summarizePeriod(session.sub, startOfWeek(now, { weekStartsOn: 1 }), endOfDay(now)),
    summarizePeriod(session.sub, startOfMonth(now), endOfDay(now)),
    summarizePeriod(session.sub, startOfYear(now), endOfDay(now)),
  ]);

  const [groupCount, studentCount, unpaidPayments, lessonsToday, user] = await Promise.all([
    prisma.group.count({ where: { userId: session.sub, deletedAt: null, status: "ACTIVE" } }),
    prisma.student.count({ where: { userId: session.sub, deletedAt: null, status: "ACTIVE" } }),
    prisma.payment.findMany({
      where: { userId: session.sub, deletedAt: null, status: { in: ["UNPAID", "PARTIAL"] } },
    }),
    prisma.lessonSession.count({ where: { userId: session.sub, date: { gte: startOfDay(now), lte: endOfDay(now) } } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.sub }, select: { defaultLessonRate: true } }),
  ]);

  const debts = unpaidPayments.reduce((sum, p) => sum + (Number(p.amountDue) - Number(p.amountPaid)), 0);

  return {
    today,
    week,
    month,
    year,
    groupCount,
    studentCount,
    lessonsToday,
    debts,
    unpaidCount: unpaidPayments.length,
    defaultLessonRate: Number(user.defaultLessonRate),
  };
}
