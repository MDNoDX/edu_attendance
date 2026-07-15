"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  requireSession,
  hashPassword,
  signSession,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@/lib/auth";
import { adminUpdateTeacherSchema, adminResetPasswordSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Every registered TEACHER account, for the /admin roster. SUPER_ADMIN accounts are never listed here. */
export async function listAllTeachers() {
  await requireSuperAdmin();

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      photoUrl: true,
      defaultLessonRate: true,
      specialization: true,
      isActive: true,
      createdAt: true,
      _count: { select: { students: true, groups: true, courses: true } },
    },
  });

  return serializeDecimals(teachers);
}

/** One teacher's full profile (minus passwordHash), for the /admin edit dialog. */
export async function getTeacherById(userId: string) {
  await requireSuperAdmin();
  const teacher = await prisma.user.findFirst({
    where: { id: userId, role: "TEACHER" },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      photoUrl: true,
      defaultLessonRate: true,
      specialization: true,
      bio: true,
      isActive: true,
      createdAt: true,
    },
  });
  if (!teacher) throw new Error("NOT_FOUND");
  return serializeDecimals(teacher);
}

/** Admin-side edit of any teacher's profile fields, including activation status. */
export async function updateTeacherByAdmin(userId: string, input: unknown) {
  await requireSuperAdmin();
  const parsed = adminUpdateTeacherSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const teacher = await prisma.user.findFirst({ where: { id: userId, role: "TEACHER" } });
  if (!teacher) return { ok: false as const, error: "O'qituvchi topilmadi." };

  const { username, email, ...rest } = parsed.data;

  if (username && username !== teacher.username) {
    const clash = await prisma.user.findUnique({ where: { username } });
    if (clash) return { ok: false as const, error: "Bu login band. Boshqa login tanlang." };
  }
  if (email) {
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== userId) {
      return { ok: false as const, error: "Bu email allaqachon ro'yxatdan o'tgan." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(username ? { username } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
    },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}

/** Admin sets a brand-new password for a teacher (e.g. they lost access / forgot it). */
export async function resetTeacherPassword(userId: string, input: unknown) {
  await requireSuperAdmin();
  const parsed = adminResetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const teacher = await prisma.user.findFirst({ where: { id: userId, role: "TEACHER" } });
  if (!teacher) return { ok: false as const, error: "O'qituvchi topilmadi." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { ok: true as const };
}

/**
 * Swaps the admin's own session cookie for a session "as" the target
 * teacher, while recording the admin's own id in `impersonatorId` so the
 * dashboard can show a banner and stopImpersonation() can hand the session
 * back. The admin's original session is not kept server-side anywhere —
 * it's reconstructed from `impersonatorId` when they stop impersonating.
 */
export async function impersonateTeacher(userId: string) {
  const adminSession = await requireSuperAdmin();

  const teacher = await prisma.user.findFirst({ where: { id: userId, role: "TEACHER" } });
  if (!teacher) return { ok: false as const, error: "O'qituvchi topilmadi." };
  if (!teacher.isActive) return { ok: false as const, error: "Bu hisob faol emas." };

  const payload: SessionPayload = {
    sub: teacher.id,
    username: teacher.username,
    fullName: teacher.fullName,
    role: "TEACHER",
    impersonatorId: adminSession.sub,
  };
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return { ok: true as const };
}

/** Hands the session back to the original SUPER_ADMIN who was impersonating. */
export async function stopImpersonation() {
  const session = await requireSession();
  if (!session.impersonatorId) {
    return { ok: false as const, error: "Impersonatsiya rejimida emassiz." };
  }

  const admin = await prisma.user.findUnique({ where: { id: session.impersonatorId } });
  if (!admin || !admin.isActive || admin.role !== "SUPER_ADMIN") {
    return { ok: false as const, error: "Admin hisobi topilmadi yoki faol emas." };
  }

  const payload: SessionPayload = {
    sub: admin.id,
    username: admin.username,
    fullName: admin.fullName,
    role: "SUPER_ADMIN",
  };
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return { ok: true as const };
}

/** Platform-wide counts for the /admin dashboard header. */
export async function getAdminOverview() {
  await requireSuperAdmin();
  const [teacherCount, activeTeacherCount, studentCount, groupCount] = await Promise.all([
    prisma.user.count({ where: { role: "TEACHER" } }),
    prisma.user.count({ where: { role: "TEACHER", isActive: true } }),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.group.count({ where: { deletedAt: null } }),
  ]);

  return { teacherCount, activeTeacherCount, studentCount, groupCount };
}
