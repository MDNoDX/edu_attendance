"use server";

import { revalidatePath } from "next/cache";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { groupSchema } from "@/lib/validations";
import { generateLessonSessionsForGroup } from "@/app/actions/schedule";
import { serializeDecimals } from "@/lib/serialize";

export async function listGroups() {
  const session = await requireSession();
  const groups = await prisma.group.findMany({
    where: { userId: session.sub, deletedAt: null },
    include: {
      // The groups list only ever shows a student COUNT (see
      // groups-manager.tsx), never individual student fields — fetching
      // every field (including each student's full base64 photoUrl) of
      // every student in every group just to display a number was pure
      // waste. `_count` gets the number in the same query with none of that.
      _count: { select: { students: { where: { deletedAt: null } } } },
      scheduleSlots: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return serializeDecimals(groups);
}

export async function getGroup(groupId: string) {
  const session = await requireSession();
  const group = await prisma.group.findFirst({
    where: { id: groupId, userId: session.sub },
    include: {
      students: { where: { deletedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      scheduleSlots: true,
    },
  });
  return serializeDecimals(group);
}

/** Checks the teacher isn't double-booking their own room name at an overlapping weekly slot. */
async function assertNoRoomConflict(
  userId: string,
  roomName: string,
  slots: { dayOfWeek: number; startTime: string; endTime: string }[],
  excludeGroupId?: string,
) {
  const otherGroups = await prisma.group.findMany({
    where: {
      userId,
      roomName,
      status: "ACTIVE",
      deletedAt: null,
      ...(excludeGroupId ? { id: { not: excludeGroupId } } : {}),
    },
    include: { scheduleSlots: true },
  });

  for (const slot of slots) {
    for (const group of otherGroups) {
      for (const existing of group.scheduleSlots) {
        if (existing.dayOfWeek !== slot.dayOfWeek) continue;
        const overlaps = slot.startTime < existing.endTime && existing.startTime < slot.endTime;
        if (overlaps) {
          return `"${roomName}" xonasi shu vaqtda band: "${group.name}" guruhi bilan to'qnashadi.`;
        }
      }
    }
  }
  return null;
}

export async function createGroup(input: unknown) {
  const session = await requireSession();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { scheduleSlots, ...data } = parsed.data;

  const conflict = await assertNoRoomConflict(session.sub, data.roomName, scheduleSlots);
  if (conflict) return { ok: false as const, error: conflict };

  try {
    const group = await prisma.group.create({
      data: {
        ...data,
        userId: session.sub,
        scheduleSlots: { create: scheduleSlots },
      },
      include: { scheduleSlots: true },
    });

    // Pre-generate the next 8 weeks of concrete lesson sessions from the template.
    await generateLessonSessionsForGroup(group.id, 8);

    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard/schedule");
    return { ok: true as const, group: serializeDecimals(group) };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

export async function updateGroup(groupId: string, input: unknown) {
  const session = await requireSession();
  const existing = await prisma.group.findFirst({ where: { id: groupId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Guruh topilmadi." };

  const parsed = groupSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { scheduleSlots, ...data } = parsed.data;

  if (scheduleSlots && data.roomName) {
    const conflict = await assertNoRoomConflict(session.sub, data.roomName, scheduleSlots, groupId);
    if (conflict) return { ok: false as const, error: conflict };
  }

  try {
    const group = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...data,
        ...(scheduleSlots
          ? { scheduleSlots: { deleteMany: {}, create: scheduleSlots } }
          : {}),
      },
      include: { scheduleSlots: true },
    });

    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard/schedule");
    return { ok: true as const, group: serializeDecimals(group) };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

export async function updateGroupStatus(groupId: string, status: "ACTIVE" | "FINISHED" | "PAUSED") {
  const session = await requireSession();
  const existing = await prisma.group.findFirst({ where: { id: groupId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Guruh topilmadi." };

  try {
    const group = await prisma.group.update({ where: { id: groupId }, data: { status } });
    revalidatePath("/dashboard/groups");
    return { ok: true as const, group: serializeDecimals(group) };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

export async function deleteGroup(groupId: string) {
  const session = await requireSession();
  const existing = await prisma.group.findFirst({ where: { id: groupId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Guruh topilmadi." };

  const activeStudents = await prisma.student.count({ where: { groupId, deletedAt: null, status: "ACTIVE" } });
  if (activeStudents > 0) {
    return { ok: false as const, error: "Bu guruhda aktiv studentlar bor." };
  }

  try {
    await prisma.group.update({ where: { id: groupId }, data: { deletedAt: new Date(), status: "FINISHED" } });
    revalidatePath("/dashboard/groups");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}
