import "server-only";
import { prisma } from "@/lib/db";

export interface RateLimitCheck {
  limited: boolean;
  retryAfterSeconds?: number;
}

/**
 * Simple Postgres-backed sliding-window rate limiter for auth endpoints
 * (login, signup, username-availability checks). No Redis/Upstash — at this
 * app's traffic scale, one small indexed table is simpler to operate than a
 * separate service, and it's already sitting right next to everything else.
 *
 * Read-only: checks how many attempts are recorded for `key` within the
 * trailing `windowSeconds`, without writing anything. Callers decide
 * separately (via recordAttempt) whether this particular attempt should
 * count — e.g. the login route only records FAILED attempts, so a user who
 * mistypes their password once and then logs in successfully never risks
 * getting themselves rate-limited by their own success.
 *
 * Not a hard concurrency-safe boundary (no row locking) — two requests
 * racing right at the limit could both slip through. Acceptable for
 * throttling brute-force/abuse, not meant as a strict quota.
 */
export async function isRateLimited(key: string, max: number, windowSeconds: number): Promise<RateLimitCheck> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  // Opportunistic cleanup so this table never grows unboundedly — every
  // check prunes its own key's stale rows first.
  await prisma.rateLimitAttempt.deleteMany({ where: { key, createdAt: { lt: windowStart } } });

  const rows = await prisma.rateLimitAttempt.findMany({
    where: { key, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (rows.length >= max) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rows[0].createdAt.getTime() + windowSeconds * 1000 - Date.now()) / 1000),
    );
    return { limited: true, retryAfterSeconds };
  }
  return { limited: false };
}

/** Records one attempt against `key`, counted by the next isRateLimited() call within its window. */
export async function recordAttempt(key: string): Promise<void> {
  await prisma.rateLimitAttempt.create({ data: { key } });
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
