"use server";

import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeDecimals } from "@/lib/serialize";

/**
 * Generates concrete LessonSession rows from a Group's recurring
 * ScheduleSlot template, covering everything from the group's startDate
 * through `weeks` weeks ahead of today. Idempotent: relies on the
 * (groupId, date) unique constraint and skips dates that already have a
 * session, so it's safe to call on every page load.
 *
 * Deliberately starts at group.startDate rather than "today" — the very
 * first version of this only ever generated forward from today, so any
 * month that fell BETWEEN the group's creation and whenever self-heal first
 * ran for it could be permanently missing its lesson days, showing "Bu oyda
 * dars kunlari topilmadi" even though the group was clearly active that
 * month. Re-running this is cheap: existing dates are skipped via a caught
 * unique-constraint violation.
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

  const start = new Date(group.startDate);
  start.setHours(0, 0, 0, 0);

  const datesToCreate: { date: Date; startTime: string; endTime: string }[] = [];

  for (let d = new Date(start); d <= horizon; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    for (const slot of group.scheduleSlots) {
      if (slot.dayOfWeek === day) {
        datesToCreate.push({ date: new Date(d), startTime: slot.startTime, endTime: slot.endTime });
      }
    }
  }

  if (datesToCreate.length === 0) return { created: 0 };

  // One round-trip instead of one `create` per date (this used to be up to
  // ~50-60 sequential awaited inserts per call, most of which just hit the
  // (groupId, date) unique constraint and got silently caught — wasted
  // round-trips on every journal load for an ACTIVE group). `skipDuplicates`
  // makes this just as idempotent as the old try/catch-per-date loop.
  const result = await prisma.lessonSession.createMany({
    data: datesToCreate.map(({ date, startTime, endTime }) => ({
      groupId: group.id,
      userId: group.userId,
      date,
      startTime,
      endTime,
    })),
    skipDuplicates: true,
  });

  return { created: result.count };
}

/**
 * Owner-scoped, teacher-triggerable version of the self-heal that
 * getGroupAttendanceJournal runs automatically. Exists so a teacher stuck
 * looking at "Bu oyda dars kunlari topilmadi" has a visible, immediate way
 * to force a regeneration and see WHY it's empty (no weekly schedule set at
 * all vs. a transient DB hiccup vs. genuinely nothing to generate), instead
 * of the silent background self-heal that gives no feedback either way.
 */
export async function regenerateGroupSessions(groupId: string) {
  const session = await requireSession();
  const group = await prisma.group.findFirst({
    where: { id: groupId, userId: session.sub },
    include: { scheduleSlots: true },
  });
  if (!group) return { ok: false as const, error: "Guruh topilmadi." };

  if (group.scheduleSlots.length === 0) {
    return {
      ok: false as const,
      error:
        "Bu guruh uchun haftalik dars jadvali (qaysi kunlari dars bo'lishi) belgilanmagan. Guruhlar ro'yxatida ushbu guruhni tahrirlab, haftalik jadvalni qo'shing.",
      needsScheduleSlots: true as const,
    };
  }

  try {
    const { created } = await generateLessonSessionsForGroup(groupId, 8);
    return { ok: true as const, created };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
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

  const sessions = await prisma.lessonSession.findMany({
    where,
    include: {
      // schedule-view.tsx only ever shows a student COUNT for the group,
      // never individual students — `_count` avoids pulling every student's
      // full record (photoUrl included) for every session on the calendar.
      group: { include: { _count: { select: { students: { where: { deletedAt: null } } } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return serializeDecimals(sessions);
}
