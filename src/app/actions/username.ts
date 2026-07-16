"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { usernameSchema } from "@/lib/validations";

/**
 * Live username-availability check, shared by the signup form (no session
 * yet) and the profile page's "change my username" field (session exists —
 * in which case the caller's OWN current username is excluded from the
 * "taken" check, since keeping the same username they already have should
 * never show as unavailable). Deliberately reads the session server-side
 * rather than trusting an `excludeUserId` argument from the client, so an
 * unauthenticated caller can never probe which user id owns a username.
 */
export async function checkUsernameAvailable(
  username: string,
): Promise<{ available: boolean; reason?: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.errors[0]?.message ?? "Login noto'g'ri." };
  }

  const session = await getSession();
  const existing = await prisma.user.findUnique({
    where: { username: parsed.data },
    select: { id: true },
  });

  if (!existing) return { available: true };
  if (session && existing.id === session.sub) return { available: true };
  return { available: false, reason: "Bu login band." };
}
