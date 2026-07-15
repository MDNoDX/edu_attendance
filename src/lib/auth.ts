import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";

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
