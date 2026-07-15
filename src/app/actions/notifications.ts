"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serializeDecimals } from "@/lib/serialize";
import { computeCurrentStreak, type AttendanceMark } from "@/lib/attendance-payment";

export interface AgendaLesson {
  id: string;
  groupId: string;
  groupName: string;
  roomName: string;
  startTime: string;
  endTime: string;
  totalStudents: number;
  markedStudents: number;
}

export interface RiskStudent {
  id: string;
  fullName: string;
  groupId: string;
  groupName: string;
  consecutiveMisses: number;
}

export interface NotificationAgenda {
  generatedAt: Date;
  todayLessons: AgendaLesson[];
  /** Active students sitting at 2 consecutive misses — one more miss triggers the pay cutoff. */
  atRiskStudents: RiskStudent[];
}

/**
 * The data behind the notification bell: today's lessons (with a flag for
 * whether attendance has been taken yet, so the teacher gets reminded before
 * class), and students who are one missed lesson away from tripping the
 * consecutive-miss pay cutoff (`computeCurrentStreak` — same function the
 * earnings engine uses, so the warning always matches what will actually
 * happen on the next mark).
 */
export async function getNotificationAgenda(): Promise<NotificationAgenda> {
  const session = await requireSession();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const lessons = await prisma.lessonSession.findMany({
    where: { userId: session.sub, date: { gte: dayStart, lte: dayEnd } },
    include: {
      group: { include: { students: { where: { deletedAt: null, status: "ACTIVE" } } } },
      attendances: true,
    },
    orderBy: { startTime: "asc" },
  });

  const todayLessons: AgendaLesson[] = lessons.map((l) => ({
    id: l.id,
    groupId: l.groupId,
    groupName: l.group.name,
    roomName: l.group.roomName,
    startTime: l.startTime,
    endTime: l.endTime,
    totalStudents: l.group.students.length,
    markedStudents: l.attendances.length,
  }));

  const students = await prisma.student.findMany({
    where: { userId: session.sub, deletedAt: null, status: "ACTIVE" },
    include: {
      group: true,
      attendances: {
        include: { lessonSession: true },
      },
    },
  });

  const atRiskStudents: RiskStudent[] = [];
  for (const s of students) {
    const recentFirst = [...s.attendances]
      .sort((a, b) => b.lessonSession.date.getTime() - a.lessonSession.date.getTime())
      .map((a) => a.status as AttendanceMark);
    const streak = computeCurrentStreak(recentFirst);
    if (streak === 2) {
      atRiskStudents.push({
        id: s.id,
        fullName: `${s.lastName} ${s.firstName}`,
        groupId: s.groupId,
        groupName: s.group.name,
        consecutiveMisses: streak,
      });
    }
  }

  return serializeDecimals({ generatedAt: now, todayLessons, atRiskStudents });
}
