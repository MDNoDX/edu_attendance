"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { courseSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";

// Every query and mutation here is scoped to the logged-in teacher's own
// userId — there is no admin oversight, so ownership is the only guard we
// need. Attempting to touch another teacher's course simply returns nothing
// (findFirst) or throws (update/delete where clause includes userId).

export async function listCourses() {
  const session = await requireSession();
  const courses = await prisma.course.findMany({
    where: { userId: session.sub, deletedAt: null },
    include: {
      groups: { where: { deletedAt: null }, include: { students: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return serializeDecimals(courses);
}

export async function createCourse(input: unknown) {
  const session = await requireSession();
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const course = await prisma.course.create({
    data: { ...parsed.data, userId: session.sub },
  });

  revalidatePath("/dashboard/courses");
  return { ok: true as const, course: serializeDecimals(course) };
}

export async function updateCourse(courseId: string, input: unknown) {
  const session = await requireSession();
  const parsed = courseSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const existing = await prisma.course.findFirst({ where: { id: courseId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Kurs topilmadi." };

  const course = await prisma.course.update({
    where: { id: courseId },
    data: parsed.data,
  });

  revalidatePath("/dashboard/courses");
  return { ok: true as const, course: serializeDecimals(course) };
}

export async function deleteCourse(courseId: string) {
  const session = await requireSession();

  const existing = await prisma.course.findFirst({ where: { id: courseId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Kurs topilmadi." };

  const activeGroups = await prisma.group.count({ where: { courseId, status: "ACTIVE", deletedAt: null } });
  if (activeGroups > 0) {
    return { ok: false as const, error: "Bu kursda faol guruhlar bor." };
  }

  await prisma.course.update({ where: { id: courseId }, data: { deletedAt: new Date(), isActive: false } });

  revalidatePath("/dashboard/courses");
  return { ok: true as const };
}
