"use server";

import { revalidatePath } from "next/cache";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { markAttendanceSchema, bulkMarkAttendanceSchema } from "@/lib/validations";
import {
  computeEarningsForHistory,
  computeLessonValue,
  type AttendanceHistoryEntry,
  type AttendanceMark,
} from "@/lib/attendance-payment";
import { serializeDecimals } from "@/lib/serialize";
import { generateLessonSessionsForGroup } from "@/app/actions/schedule";
import type { Prisma } from "@prisma/client";

/** Resolves the effective per-lesson teacher rate for a group (override or the teacher's default). */
async function getLessonRateForGroup(groupId: string) {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { user: true, course: true },
  });
  const rate = Number(group.teacherLessonRateOverride ?? group.user.defaultLessonRate);
  const lessonValue = computeLessonValue(Number(group.course.monthlyPrice), group.course.lessonsPerMonth);
  return { rate, lessonValue, group };
}

/**
 * Re-walks a single student's ENTIRE attendance history in chronological
 * order and rewrites every teacherEarningAmount according to the
 * consecutive-miss cutoff rule. This is deliberately called after every
 * write (create or correction) so earnings stay consistent no matter what
 * order attendance gets marked/edited in — a teacher fixing a mistake on a
 * lesson from two weeks ago will correctly ripple the cutoff forward.
 */
async function recomputeStudentEarnings(studentId: string, lessonRate: number) {
  const records = await prisma.attendance.findMany({
    where: { studentId },
    include: { lessonSession: true },
    orderBy: { lessonSession: { date: "asc" } },
  });

  const history: AttendanceHistoryEntry[] = records.map((r) => ({
    lessonSessionId: r.lessonSessionId,
    date: r.lessonSession.date,
    status: r.status as AttendanceMark,
  }));

  const computed = computeEarningsForHistory(history, lessonRate);

  await prisma.$transaction(
    computed.map((entry, i) =>
      prisma.attendance.update({
        where: { id: records[i].id },
        data: { teacherEarningAmount: entry.teacherEarning },
      }),
    ),
  );
}

/** Returns the group's active roster for one lesson session, with any existing attendance mark. */
export async function getLessonRoster(lessonSessionId: string) {
  const session = await requireSession();
  const lessonSession = await prisma.lessonSession.findFirst({
    where: { id: lessonSessionId, userId: session.sub },
    include: {
      group: { include: { students: { where: { deletedAt: null } }, course: true } },
      attendances: true,
    },
  });
  if (!lessonSession) throw new Error("NOT_FOUND");

  const attendanceByStudent = new Map(lessonSession.attendances.map((a) => [a.studentId, a]));

  return serializeDecimals({
    lessonSession,
    roster: lessonSession.group.students.map((student) => ({
      student,
      attendance: attendanceByStudent.get(student.id) ?? null,
    })),
  });
}

/**
 * The core view behind the Attendance Journal grid (students x lesson
 * dates for one group, one calendar month). Future dates are returned
 * un-marked so the UI can render them locked — a teacher can't record
 * attendance for a lesson that hasn't happened yet.
 */
export async function getGroupAttendanceJournal(groupId: string, monthDate: Date) {
  const session = await requireSession();
  const group = await prisma.group.findFirst({
    where: { id: groupId, userId: session.sub },
    include: {
      course: true,
      students: { where: { deletedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      scheduleSlots: true,
    },
  });
  if (!group) throw new Error("NOT_FOUND");

  // Self-heal: LessonSession rows are only ever generated 8 weeks ahead at
  // group-creation time, with nothing extending them afterwards. An older
  // group can silently run out of upcoming sessions, making the journal show
  // "no lesson days this month" for a month that should clearly have
  // classes. This call is idempotent (skips dates that already exist, and
  // covers from the group's startDate forward), so it's safe to run on
  // every journal load. Wrapped defensively: if this ever fails for any
  // reason, the journal should still render with whatever sessions already
  // exist rather than taking down the whole page load.
  if (group.status === "ACTIVE") {
    try {
      await generateLessonSessionsForGroup(groupId, 8);
    } catch (err) {
      // Non-fatal — fall through with whatever sessions already exist. Still
      // log it server-side (visible in Vercel logs) so a silently-failing
      // self-heal is diagnosable instead of just showing an empty grid with
      // no trace of why.
      console.error(`[getGroupAttendanceJournal] self-heal failed for group ${groupId}:`, err);
    }
  }

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const sessions = await prisma.lessonSession.findMany({
    where: { groupId, date: { gte: monthStart, lte: monthEnd } },
    include: { attendances: true },
    orderBy: { date: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // The whole payload is run through serializeDecimals because this action
  // is called directly from client code (the Attendance Journal's month
  // navigation), not just used as a Server Component prop — `group.course`
  // carries a Decimal `monthlyPrice` that would otherwise crash on the wire.
  return serializeDecimals({
    group,
    students: group.students,
    // Lets the client tell "no lessons this month because the group has no
    // weekly schedule at all" apart from "no lessons because none have
    // happened yet" — the two look identical as an empty sessions array,
    // but only one of them is something the teacher can actually fix.
    hasScheduleSlots: group.scheduleSlots.length > 0,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      isFuture: s.date > today,
      marks: Object.fromEntries(
        s.attendances.map((a) => [
          a.studentId,
          {
            status: a.status,
            note: a.note,
            arrivalTime: a.arrivalTime,
            teacherEarningAmount: Number(a.teacherEarningAmount),
          },
        ]),
      ),
    })),
  });
}

export async function markAttendance(input: unknown) {
  const session = await requireSession();
  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { lessonSessionId, studentId, status, note, arrivalTime } = parsed.data;
  // arrivalTime only makes sense for a LATE mark — ignore it for any other status.
  const resolvedArrivalTime = status === "LATE" ? (arrivalTime ?? null) : null;
  // A free-text note is only meaningful for an EXCUSED absence (a teacher's
  // own reminder of *why*) — enforced here too, not just in the UI, so an
  // UNEXCUSED_ABSENT can never carry a note no matter what called this.
  const resolvedNote = status === "EXCUSED_ABSENT" ? (note ?? null) : null;

  const lessonSession = await prisma.lessonSession.findFirst({
    where: { id: lessonSessionId, userId: session.sub },
  });
  if (!lessonSession) return { ok: false as const, error: "Bu dars sizga tegishli emas." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lessonSession.date > today) {
    return { ok: false as const, error: "Kelajakdagi dars uchun davomat belgilab bo'lmaydi." };
  }

  const { rate, lessonValue } = await getLessonRateForGroup(lessonSession.groupId);

  // Everything below is wrapped: any DB-level failure here (including a
  // schema mismatch like a not-yet-migrated column) must never throw
  // uncaught out of a Server Action — that surfaces to the client as a
  // rejected promise the Attendance Journal wasn't prepared for, which is
  // exactly the "jumps to another screen" symptom reported. Catch it and
  // hand back a normal { ok: false, error } response instead.
  try {
    await prisma.attendance.upsert({
      where: { studentId_lessonSessionId: { studentId, lessonSessionId } },
      create: {
        studentId,
        lessonSessionId,
        status,
        note: resolvedNote,
        arrivalTime: resolvedArrivalTime,
        teacherEarningAmount: 0, // fixed immediately below by recompute
        lessonValueSnapshot: lessonValue,
      },
      update: { status, note: resolvedNote, arrivalTime: resolvedArrivalTime, lessonValueSnapshot: lessonValue },
    });

    await recomputeStudentEarnings(studentId, rate);

    await prisma.lessonSession.update({
      where: { id: lessonSessionId },
      data: { status: "COMPLETED" },
    });
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }

  // NOTE: deliberately NOT calling revalidatePath for the group detail page
  // itself. This action is invoked directly from the Attendance Journal
  // client component, which already refetches getGroupAttendanceJournal()
  // right after this resolves — that's the single source of truth for the
  // on-screen grid. Revalidating the currently-active route here would make
  // Next.js re-run the whole page's Server Component (including its DB
  // query) on every single click, which is both wasted work and, if that
  // extra query ever hiccups, would surface as the entire page swapping to
  // a 404/error screen mid-click. Only the list page (student counts) needs
  // a cache bust.
  revalidatePath("/dashboard/groups");
  return { ok: true as const };
}

export async function bulkMarkAttendance(input: unknown) {
  const session = await requireSession();
  const parsed = bulkMarkAttendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { lessonSessionId, marks } = parsed.data;

  const lessonSession = await prisma.lessonSession.findFirst({
    where: { id: lessonSessionId, userId: session.sub },
  });
  if (!lessonSession) return { ok: false as const, error: "Bu dars sizga tegishli emas." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lessonSession.date > today) {
    return { ok: false as const, error: "Kelajakdagi dars uchun davomat belgilab bo'lmaydi." };
  }

  const { rate, lessonValue } = await getLessonRateForGroup(lessonSession.groupId);

  // See the comment in markAttendance() above: never let a DB error escape
  // this action uncaught.
  try {
    for (const mark of marks) {
      const resolvedArrivalTime = mark.status === "LATE" ? (mark.arrivalTime ?? null) : null;
      const resolvedNote = mark.status === "EXCUSED_ABSENT" ? (mark.note ?? null) : null;
      await prisma.attendance.upsert({
        where: { studentId_lessonSessionId: { studentId: mark.studentId, lessonSessionId } },
        create: {
          studentId: mark.studentId,
          lessonSessionId,
          status: mark.status,
          note: resolvedNote,
          arrivalTime: resolvedArrivalTime,
          teacherEarningAmount: 0,
          lessonValueSnapshot: lessonValue,
        },
        update: { status: mark.status, note: resolvedNote, arrivalTime: resolvedArrivalTime, lessonValueSnapshot: lessonValue },
      });
      await recomputeStudentEarnings(mark.studentId, rate);
    }

    await prisma.lessonSession.update({ where: { id: lessonSessionId }, data: { status: "COMPLETED" } });
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }

  // See the comment in markAttendance() above — no revalidatePath for the
  // active group detail route, to avoid forcing a fragile server re-render
  // on every attendance write.
  revalidatePath("/dashboard/groups");
  return { ok: true as const };
}

export interface AttendanceRangeFilters {
  from: Date;
  to: Date;
  studentId?: string;
  groupId?: string;
}

/** Raw attendance rows in a date range, used both by calendar views and report/export builders. */
export async function getAttendanceInRange(filters: AttendanceRangeFilters) {
  const session = await requireSession();

  const lessonSessionWhere: Prisma.LessonSessionWhereInput = {
    userId: session.sub,
    date: { gte: filters.from, lte: filters.to },
  };
  if (filters.groupId) lessonSessionWhere.groupId = filters.groupId;

  const where: Prisma.AttendanceWhereInput = { lessonSession: lessonSessionWhere };
  if (filters.studentId) where.studentId = filters.studentId;

  return prisma.attendance.findMany({
    where,
    include: {
      student: true,
      lessonSession: { include: { group: { include: { course: true } } } },
    },
    orderBy: { lessonSession: { date: "asc" } },
  });
}
