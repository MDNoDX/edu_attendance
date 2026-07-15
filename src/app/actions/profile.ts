"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession, verifyPassword, hashPassword } from "@/lib/auth";
import { profileUpdateSchema, changePasswordSchema } from "@/lib/validations";

/** The logged-in teacher's own profile — the single self-service account record. */
export async function getProfile() {
  const session = await requireSession();
  return prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
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
      createdAt: true,
    },
  });
}

export async function updateProfile(input: unknown) {
  const session = await requireSession();
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  if (parsed.data.email) {
    const existing = await prisma.user.findFirst({
      where: { email: parsed.data.email, id: { not: session.sub } },
    });
    if (existing) return { ok: false as const, error: "Bu email band." };
  }

  const user = await prisma.user.update({
    where: { id: session.sub },
    data: {
      ...parsed.data,
      email: parsed.data.email === "" ? null : parsed.data.email,
    },
  });

  revalidatePath("/dashboard/profile");
  return { ok: true as const, user };
}

export async function changePassword(input: unknown) {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { ok: false as const, error: "Joriy parol noto'g'ri." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: session.sub }, data: { passwordHash } });

  return { ok: true as const };
}
