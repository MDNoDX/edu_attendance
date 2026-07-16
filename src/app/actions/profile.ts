"use server";

import { revalidatePath } from "next/cache";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession, verifyPassword, hashPassword, createSessionCookie } from "@/lib/auth";
import { profileUpdateSchema, changePasswordSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";

// Fields safe to send to the client — passwordHash must never leave the server.
const SAFE_PROFILE_SELECT = {
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
} as const;

/** The logged-in teacher's own profile — the single self-service account record. */
export async function getProfile() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: SAFE_PROFILE_SELECT,
  });
  return serializeDecimals(user);
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

  // A teacher can change their own login — checked here again (not just via
  // checkUsernameAvailable on the client) so a race between two people
  // grabbing the same username at once can never both succeed.
  if (parsed.data.username) {
    const existing = await prisma.user.findFirst({
      where: { username: parsed.data.username, id: { not: session.sub } },
    });
    if (existing) return { ok: false as const, error: "Bu login band. Boshqa login tanlang." };
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.sub },
      data: {
        ...parsed.data,
        email: parsed.data.email === "" ? null : parsed.data.email,
      },
      select: SAFE_PROFILE_SELECT,
    });

    // The session cookie's `username`/`fullName` claims are only ever set at
    // login time — without re-issuing it here, the header/menu would keep
    // showing the OLD username until the next login, even though the
    // profile page itself (re-fetched via revalidatePath) already shows the
    // new one. Re-sign with the same role/impersonatorId so this never
    // silently changes what the session is allowed to do, only its display.
    await createSessionCookie({
      sub: session.sub,
      username: user.username,
      fullName: user.fullName,
      role: session.role,
      ...(session.impersonatorId ? { impersonatorId: session.impersonatorId } : {}),
    });

    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard");
    return { ok: true as const, user: serializeDecimals(user) };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
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
