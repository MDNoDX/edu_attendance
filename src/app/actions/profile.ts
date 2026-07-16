"use server";

import { revalidatePath } from "next/cache";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { requireSession, verifyPassword, hashPassword, createSessionCookie } from "@/lib/auth";
import { profileUpdateSchema, changePasswordSchema } from "@/lib/validations";
import { serializeDecimals } from "@/lib/serialize";
import { formatFullName } from "@/lib/utils";

// Fields safe to send to the client — passwordHash must never leave the server.
const SAFE_PROFILE_SELECT = {
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

  // fullName is a denormalized cache of firstName+lastName (see the doc
  // comment on User.fullName in schema.prisma) — it must be recomputed here
  // whenever either name part changes, otherwise every one of the ~40+ read
  // sites that only display `.fullName` would silently show a stale name.
  let fullNamePatch: { fullName: string } | Record<string, never> = {};
  if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { firstName: true, lastName: true },
    });
    fullNamePatch = {
      fullName: formatFullName(
        parsed.data.firstName ?? current.firstName,
        parsed.data.lastName ?? current.lastName,
      ),
    };
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.sub },
      data: {
        ...parsed.data,
        ...fullNamePatch,
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
    // The tokenId is carried forward unchanged (not a new signSession() call)
    // so a routine profile edit never detaches the current browser from its
    // own entry in the "Faol qurilmalar" (active devices) list on this page.
    await createSessionCookie({
      sub: session.sub,
      username: user.username,
      fullName: user.fullName,
      role: session.role,
      ...(session.impersonatorId ? { impersonatorId: session.impersonatorId } : {}),
      ...(session.tokenId ? { tokenId: session.tokenId } : {}),
    });

    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard");
    return { ok: true as const, user: serializeDecimals(user) };
  } catch (err) {
    return { ok: false as const, error: toFriendlyDbError(err) };
  }
}

/**
 * The logged-in teacher's own tracked devices/browsers ("Faol qurilmalar"),
 * for the profile page. Only ever reads the `sessions` table — never
 * consulted on the hot path of a normal request (see the doc comment on
 * SessionPayload.tokenId in src/lib/auth.ts for why revocation here is
 * informational, not an instant server-side kill switch).
 */
export async function listMySessions() {
  const session = await requireSession();
  const rows = await prisma.session.findMany({
    where: { userId: session.sub, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, tokenId: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.userAgent,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    isCurrent: r.tokenId === session.tokenId,
  }));
}

/**
 * Removes one device from the teacher's own visible list. Deliberately soft
 * (revokedAt, not a hard delete) and — per the informational-only design of
 * this feature — does NOT invalidate that device's actual JWT immediately;
 * it naturally expires on its own 30-day TTL. A teacher can always "forget"
 * a device here (e.g. a shared/public computer they logged into once) even
 * though this session's own browser is what they're using to do it.
 */
export async function revokeMySession(sessionRowId: string) {
  const session = await requireSession();
  const existing = await prisma.session.findFirst({ where: { id: sessionRowId, userId: session.sub } });
  if (!existing) return { ok: false as const, error: "Qurilma topilmadi." };

  await prisma.session.update({ where: { id: sessionRowId }, data: { revokedAt: new Date() } });
  revalidatePath("/dashboard/profile");
  return { ok: true as const };
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
