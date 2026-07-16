import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import type { AdminPermission } from "@/lib/permissions";

const SESSION_COOKIE = "ustoz_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * NadirEdu has two kinds of accounts: TEACHER (the normal, self-service
 * case — every query in src/app/actions scopes itself to `session.sub`)
 * and a small number of SUPER_ADMIN platform-owner accounts that can see
 * across every teacher from /admin. `impersonatorId` is set only while a
 * SUPER_ADMIN is "logged in as" a specific teacher for support purposes —
 * it records the admin's own user id so the session can be handed back to
 * them via stopImpersonation().
 */
export interface SessionPayload {
  sub: string; // user id
  username: string;
  fullName: string;
  role: "TEACHER" | "SUPER_ADMIN";
  impersonatorId?: string;
  /**
   * Correlates this JWT with a row in the `sessions` table (see
   * prisma/schema.prisma's Session model) so the profile page can list and
   * let the teacher forget their own logged-in devices. Optional so tokens
   * issued before this field existed keep working — they just won't show up
   * in the device list. Deliberately NOT re-verified against the database on
   * every request (that would mean a DB read on every single action, for a
   * feature that's purely informational) — "forgetting" a device here is a
   * visibility/audit action, not an instant server-side kill switch; the
   * token still naturally expires via its own 30-day TTL either way.
   */
  tokenId?: string;
  [key: string]: unknown;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Sets the httpOnly session cookie. Call from a Route Handler or Server Action. */
export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * The one place a brand-new login (signup or password login) both issues the
 * session cookie AND records/refreshes the corresponding `sessions` table
 * row, so the two can never drift apart. Reuses `existingTokenId` when
 * re-signing an already-logged-in user's cookie (e.g. after a profile edit)
 * so that action doesn't spawn a phantom extra "device" or silently detach
 * the current one from the teacher's own device list.
 */
export async function createSessionCookieAndRecord(
  // Deliberately NOT `Omit<SessionPayload, "tokenId">` — SessionPayload's
  // own `[key: string]: unknown` index signature makes TypeScript's Omit
  // collapse the whole type down to just that index signature (Omit is
  // Pick<T, Exclude<keyof T, K>>, and keyof a type with a string index
  // signature is `string`, so Exclude<string, "tokenId"> is still just
  // `string` — none of the named properties survive). Spelling out the
  // exact shape here avoids that trap entirely.
  payload: { sub: string; username: string; fullName: string; role: "TEACHER" | "SUPER_ADMIN"; impersonatorId?: string },
  meta: { userAgent?: string | null; ip?: string | null } = {},
  existingTokenId?: string,
): Promise<string> {
  const tokenId = existingTokenId ?? crypto.randomUUID();
  await createSessionCookie({ ...payload, tokenId });

  await prisma.session.upsert({
    where: { tokenId },
    create: {
      tokenId,
      userId: payload.sub,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
    update: {
      lastSeenAt: new Date(),
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      ...(meta.ip ? { ip: meta.ip } : {}),
    },
  });

  return tokenId;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/** Reads and verifies the current session from cookies. Returns null if absent/invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Throws if there is no valid session. Use in server actions / route handlers that require auth. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

/**
 * Throws unless the current session belongs to a SUPER_ADMIN account.
 * Deliberately re-checks the role against the database on every call
 * (rather than trusting the JWT's `role` claim alone) so that revoking an
 * admin takes effect immediately, even if they still hold an unexpired
 * session token.
 */
export async function requireSuperAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { role: true, isActive: true } });
  if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/**
 * Fetches the current admin's ownership/permission state FRESH from the
 * database every call — permissions can be revoked by an owner at any time,
 * and unlike the role check this deliberately never trusts anything cached
 * in the JWT, so a change takes effect on the admin's very next action
 * rather than only after they log back in.
 */
async function requireAdminContext(): Promise<{
  session: SessionPayload;
  isOwner: boolean;
  permissions: string[];
}> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { role: true, isActive: true, isOwner: true, permissions: true },
  });
  if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return { session, isOwner: user.isOwner, permissions: user.permissions };
}

/**
 * Throws unless the current admin holds `permission` — an owner (isOwner)
 * always passes regardless of their explicit `permissions` list, since
 * owners implicitly have every capability.
 */
export async function requireAdminPermission(permission: AdminPermission): Promise<SessionPayload> {
  const { session, isOwner, permissions } = await requireAdminContext();
  if (!isOwner && !permissions.includes(permission)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/**
 * Throws unless the current admin is an owner-level account. Only owners
 * (provisioned via prisma/create-admin.ts) can promote/demote other
 * accounts to SUPER_ADMIN or change anyone's permissions — this is the one
 * capability that can never be delegated via `permissions`, since granting
 * it would let a non-owner admin escalate themselves or anyone else to full
 * ownership.
 */
export async function requireOwnerAdmin(): Promise<SessionPayload> {
  const { session, isOwner } = await requireAdminContext();
  if (!isOwner) throw new Error("FORBIDDEN");
  return session;
}
