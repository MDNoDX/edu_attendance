import { NextResponse, type NextRequest } from "next/server";
import { prisma, toFriendlyDbError } from "@/lib/db";
import { hashPassword, createSessionCookieAndRecord } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";
import { isRateLimited, recordAttempt, getClientIp } from "@/lib/rate-limit";
import { formatFullName } from "@/lib/utils";

export const runtime = "nodejs";

// Open self-signup with no email verification/CAPTCHA is a real mass-account
// abuse surface — this per-IP cap is a cheap first line of defense against
// scripted bulk registration without requiring a new external service.
const MAX_SIGNUPS_PER_IP = 10;
const WINDOW_SECONDS = 60 * 60;

// Self-service registration: any teacher creates their own account directly.
// There is no admin who provisions accounts — this is the only way in.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ipKey = `signup:ip:${ip}`;
  const ipLimit = await isRateLimited(ipKey, MAX_SIGNUPS_PER_IP, WINDOW_SECONDS);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Juda ko'p urinish. Birozdan so'ng qaytadan urining." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds ?? WINDOW_SECONDS) } },
    );
  }
  // Recorded up front (every POST that gets this far counts, pass or fail)
  // since signup abuse is about attempt VOLUME, not just successful ones.
  await recordAttempt(ipKey);

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ma'lumotlar noto'g'ri kiritildi.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password, firstName, lastName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "Bu login band. Boshqa login tanlang." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  // The findUnique check above narrows the common case, but two signups for
  // the same username arriving at once can still both pass it (a classic
  // check-then-act race) — the DB's own unique constraint is the real guard,
  // so this create() must never throw uncaught past this point.
  let user;
  try {
    user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        firstName,
        lastName,
        fullName: formatFullName(firstName, lastName),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: toFriendlyDbError(err) }, { status: 409 });
  }

  await createSessionCookieAndRecord(
    {
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  return NextResponse.json({
    ok: true,
    redirectTo: "/dashboard",
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
    },
  });
}
