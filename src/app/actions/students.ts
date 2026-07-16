"use server";

import { revalidatePath } from "next/cache";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { studentSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";
import type { StudentStatus } from "@prisma/client";

export interface StudentFilters {
  search?: string;
  status?: StudentStatus;
  courseId?: string;
  groupId?: string;
  page?: number;
  pageSize?: number;
}

export async function listStudents(filters: StudentFilters = {}) {
  const session = await requireSession();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Record<string, unknown> = { userId: session.sub, deletedAt: null };
  if (filters.status) where.status = filters.status;
  if (filters.courseId) where.courseId = filters.courseId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
      { parentPhone: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { course: true, group: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students: serializeDecimals(students), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getStudent(studentId: string) {
  const session = await requireSession();
  const student = await prisma.student.findFirst({
    where: { id: studentId, userId: session.sub, deletedAt: null },
    include: {
      course: true,
      group: true,
      payments: { orderBy: { billingMonth: "desc" } },
    },
  });
  return serializeDecimals(student);
}

export async function createStudent(input: unknown) {
  const session = await requireSession();
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const [course, group] = await Promise.all([
    prisma.course.findFirst({ where: { id: parsed.data.courseId, userId: session.sub } }),
    prisma.group.findFirst({ where: { id: parsed.data.groupId, userId: session.sub } }),
  ]);
  if (!course) return { ok: false as const, error: "Kurs topilmadi." };
  if (!group) return { ok: false as const, error: "Guruh topilmadi." };

  // NOTE: deliberately NOT revalidating /dashboard/groups/[groupId] here (only
  // the students list). That page runs a fairly heavy Server Component fetch
  // (attendance self-heal + DB queries) — forcing it to re-run as a side
  // effect of an unrelated student edit is wasted work, and if that extra
  // fetch ever hiccups, it's exactly the kind of coupling that made
  // attendance marking "jump to another screen" in an earlier bug. The
  // Students page already refetches its own list client-side after this
  // resolves, which is the only thing that actually needs to be fresh here.
  try {
    const student = await prisma.student.create({
      data: { ...parsed.data, userId: session.sub },
    });
    revalidatePath("/dashboard/students");
    return { ok: true as const, student };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

export async function updateStudent(studentId: string, input: unknown) {
  const session = await requireSession();
  const existing = await prisma.student.findFirst({ where: { id: studentId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Student topilmadi." };

  const parsed = studentSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  try {
    const student = await prisma.student.update({ where: { id: studentId }, data: parsed.data });
    revalidatePath("/dashboard/students");
    return { ok: true as const, student };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

export async function deleteStudent(studentId: string) {
  const session = await requireSession();
  const existing = await prisma.student.findFirst({ where: { id: studentId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Student topilmadi." };

  try {
    await prisma.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });
    revalidatePath("/dashboard/students");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}
