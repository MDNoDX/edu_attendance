"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/**
 * Generates concrete LessonSession rows from a Group's recurring
 * ScheduleSlot template for the next `weeks` weeks, starting today.
 * Idempotent: relies on the (groupId, date) unique constraint and skips
 * dates that already have a session.
 */
export async function generateLessonSessionsForGroup(groupId: string, weeks: number) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { scheduleSlots: true },
  });
  if (!group) return { created: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + weeks * 7);

  const datesToCreate: { date: Date; startTime: string; endTime: string }[] = [];

  for (let d = new Date(today); d <= horizon; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    for (const slot of group.scheduleSlots) {
      if (slot.dayOfWeek === day) {
        datesToCreate.push({ date: new Date(d), startTime: slot.startTime, endTime: slot.endTime });
      }
    }
  }

  let created = 0;
  for (const { date, startTime, endTime } of datesToCreate) {
    try {
      await prisma.lessonSession.create({
        data: {
          groupId: group.id,
          userId: group.userId,
          date,
          startTime,
          endTime,
        },
      });
      created += 1;
    } catch {
      // Unique constraint hit (already generated for this date) — skip silently.
    }
  }

  return { created };
}

/** Ensures every ACTIVE group owned by the current teacher has sessions generated far enough ahead. */
export async function ensureUpcomingSessions(weeks = 8) {
  const session = await requireSession();
  const groups = await prisma.group.findMany({
    where: { userId: session.sub, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  for (const g of groups) {
    await generateLessonSessionsForGroup(g.id, weeks);
  }
}

export interface ScheduleFilters {
  from: Date;
  to: Date;
  groupId?: string;
}

export async function getScheduleSessions(filters: ScheduleFilters) {
  const session = await requireSession();
  const where: Record<string, unknown> = {
    userId: session.sub,
    date: { gte: filters.from, lte: filters.to },
  };
  if (filters.groupId) where.groupId = filters.groupId;

  return prisma.lessonSession.findMany({
    where,
    include: {
      group: { include: { course: true, students: { where: { deletedAt: null } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}
