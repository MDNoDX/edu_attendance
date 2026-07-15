"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { markAttendanceSchema, bulkMarkAttendanceSchema } from "@/lib/validations";
import {
  computeEarningsForHistory,
  computeLessonValue,
  type AttendanceHistoryEntry,
  type AttendanceMark,
} from "@/lib/attendance-payment";
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

  return {
    lessonSession,
    roster: lessonSession.group.students.map((student) => ({
      student,
      attendance: attendanceByStudent.get(student.id) ?? null,
    })),
  };
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
    },
  });
  if (!group) throw new Error("NOT_FOUND");

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const sessions = await prisma.lessonSession.findMany({
    where: { groupId, date: { gte: monthStart, lte: monthEnd } },
    include: { attendances: true },
    orderBy: { date: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    group,
    students: group.students,
    // `marks` is a plain object (not a Map) so this payload survives the
    // server -> client component serialization boundary intact.
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      isFuture: s.date > today,
      marks: Object.fromEntries(
        s.attendances.map((a) => [
          a.studentId,
          { status: a.status, note: a.note, teacherEarningAmount: Number(a.teacherEarningAmount) },
        ]),
      ),
    })),
  };
}

export async function markAttendance(input: unknown) {
  const session = await requireSession();
  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { lessonSessionId, studentId, status, note } = parsed.data;

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

  await prisma.attendance.upsert({
    where: { studentId_lessonSessionId: { studentId, lessonSessionId } },
    create: {
      studentId,
      lessonSessionId,
      status,
      note,
      teacherEarningAmount: 0, // fixed immediately below by recompute
      lessonValueSnapshot: lessonValue,
    },
    update: { status, note, lessonValueSnapshot: lessonValue },
  });

  await recomputeStudentEarnings(studentId, rate);

  await prisma.lessonSession.update({
    where: { id: lessonSessionId },
    data: { status: "COMPLETED" },
  });

  revalidatePath("/dashboard/groups");
  revalidatePath(`/dashboard/groups/${lessonSession.groupId}`);
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

  for (const mark of marks) {
    await prisma.attendance.upsert({
      where: { studentId_lessonSessionId: { studentId: mark.studentId, lessonSessionId } },
      create: {
        studentId: mark.studentId,
        lessonSessionId,
        status: mark.status,
        note: mark.note,
        teacherEarningAmount: 0,
        lessonValueSnapshot: lessonValue,
      },
      update: { status: mark.status, note: mark.note, lessonValueSnapshot: lessonValue },
    });
    await recomputeStudentEarnings(mark.studentId, rate);
  }

  await prisma.lessonSession.update({ where: { id: lessonSessionId }, data: { status: "COMPLETED" } });

  revalidatePath("/dashboard/groups");
  revalidatePath(`/dashboard/groups/${lessonSession.groupId}`);
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
