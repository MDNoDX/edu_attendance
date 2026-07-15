"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
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

  const student = await prisma.student.create({
    data: { ...parsed.data, userId: session.sub },
  });

  revalidatePath("/dashboard/students");
  revalidatePath(`/dashboard/groups/${parsed.data.groupId}`);
  return { ok: true as const, student };
}

export async function updateStudent(studentId: string, input: unknown) {
  const session = await requireSession();
  const existing = await prisma.student.findFirst({ where: { id: studentId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Student topilmadi." };

  const parsed = studentSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const student = await prisma.student.update({ where: { id: studentId }, data: parsed.data });

  revalidatePath("/dashboard/students");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/groups/${student.groupId}`);
  return { ok: true as const, student };
}

export async function deleteStudent(studentId: string) {
  const session = await requireSession();
  const existing = await prisma.student.findFirst({ where: { id: studentId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Student topilmadi." };

  await prisma.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });

  revalidatePath("/dashboard/students");
  revalidatePath(`/dashboard/groups/${existing.groupId}`);
  return { ok: true as const };
}
