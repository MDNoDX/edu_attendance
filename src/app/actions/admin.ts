"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma, toFriendlyDbError } from "@/lib/db";
import {
  requireSuperAdmin,
  requireSession,
  requireAdminPermission,
  requireOwnerAdmin,
  hashPassword,
  signSession,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@/lib/auth";
import { adminUpdateTeacherSchema, adminResetPasswordSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";
import { ADMIN_PERMISSIONS, isValidAdminPermission } from "@/lib/permissions";
import { formatFullName } from "@/lib/utils";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** The logged-in admin's own ownership/permission state, for the /admin UI to decide what to show. */
export async function getMyAdminAccess() {
  const session = await requireSuperAdmin();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: { isOwner: true, permissions: true },
  });
  return { isOwner: me.isOwner, permissions: me.permissions };
}

/** Every registered TEACHER account, for the /admin roster. SUPER_ADMIN accounts are never listed here. */
export async function listAllTeachers() {
  await requireAdminPermission("MANAGE_TEACHERS");

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      photoUrl: true,
      defaultLessonRate: true,
      specialization: true,
      isActive: true,
      createdAt: true,
      _count: { select: { students: true, groups: true } },
    },
  });

  return serializeDecimals(teachers);
}

/** One teacher's full profile (minus passwordHash), for the /admin edit dialog. */
export async function getTeacherById(userId: string) {
  await requireAdminPermission("MANAGE_TEACHERS");
  const teacher = await prisma.user.findFirst({
    where: { id: userId, role: "TEACHER" },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
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
  await requireAdminPermission("MANAGE_TEACHERS");
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

  // Same denormalized-fullName-cache concern as updateProfile() in
  // src/app/actions/profile.ts — recompute it whenever either name part is
  // touched so it never drifts from firstName/lastName.
  const fullNamePatch =
    rest.firstName !== undefined || rest.lastName !== undefined
      ? { fullName: formatFullName(rest.firstName ?? teacher.firstName, rest.lastName ?? teacher.lastName) }
      : {};

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...fullNamePatch,
      ...(username ? { username } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
    },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}

/** Admin sets a brand-new password for a teacher (e.g. they lost access / forgot it). */
export async function resetTeacherPassword(userId: string, input: unknown) {
  await requireAdminPermission("MANAGE_TEACHERS");
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
  const adminSession = await requireAdminPermission("IMPERSONATE");

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

/**
 * Every SUPER_ADMIN account (owner or limited), for the /admin "Adminlar"
 * tab. Owner-only — a limited admin can never see who the other admins are
 * or what they can do, since that's part of the trust boundary that keeps
 * privilege escalation impossible.
 */
export async function listAllAdmins() {
  await requireOwnerAdmin();
  const admins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      isOwner: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
  });
  return serializeDecimals(admins);
}

function sanitizePermissions(input: string[]): string[] {
  // Silently drop anything that isn't a recognized permission key, rather
  // than erroring — keeps this forward-compatible if ADMIN_PERMISSIONS ever
  // shrinks, and stops garbage values from ever reaching the database.
  return Array.from(new Set(input.filter(isValidAdminPermission)));
}

/**
 * Promotes an existing TEACHER account to SUPER_ADMIN with the given
 * (non-owner) permissions. Owner-only. The new admin is never made an
 * owner themselves — only prisma/create-admin.ts can do that — so this can
 * never be used to create a second, equally-privileged account by mistake.
 */
export async function promoteToAdmin(userId: string, permissions: string[]) {
  await requireOwnerAdmin();

  const teacher = await prisma.user.findFirst({ where: { id: userId, role: "TEACHER" } });
  if (!teacher) return { ok: false as const, error: "O'qituvchi topilmadi." };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "SUPER_ADMIN", permissions: sanitizePermissions(permissions) },
    });
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

/** Changes an existing (non-owner) admin's permission set. Owner-only. */
export async function updateAdminPermissions(userId: string, permissions: string[]) {
  await requireOwnerAdmin();

  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN" } });
  if (!admin) return { ok: false as const, error: "Admin topilmadi." };
  if (admin.isOwner) {
    return { ok: false as const, error: "Owner-adminning vakolatlarini o'zgartirib bo'lmaydi." };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { permissions: sanitizePermissions(permissions) },
    });
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Demotes a (non-owner) admin back to a normal TEACHER account, clearing
 * their permissions. Owner-only. An owner can never be demoted through
 * this — that would only ever be done directly against the database, to
 * make absolutely sure the platform can never be left with zero owners by
 * a UI mistake.
 */
export async function demoteAdmin(userId: string) {
  await requireOwnerAdmin();

  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN" } });
  if (!admin) return { ok: false as const, error: "Admin topilmadi." };
  if (admin.isOwner) {
    return { ok: false as const, error: "Owner-adminni administratorlikdan chetlashtirib bo'lmaydi." };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "TEACHER", permissions: [] },
    });
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

/** The set of valid permission keys, for the promote/edit-permissions UI. */
export async function getAvailablePermissions() {
  await requireOwnerAdmin();
  return ADMIN_PERMISSIONS;
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
