import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionCookieAndRecord } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { isRateLimited, recordAttempt, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_ATTEMPTS_PER_USERNAME = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const WINDOW_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Login yoki parol noto'g'ri kiritildi.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;
  const ip = getClientIp(request);
  const usernameKey = `login:user:${username}`;
  const ipKey = `login:ip:${ip}`;

  // Checked BEFORE touching the DB for the user lookup / before ever
  // running bcrypt.compare (the expensive part) — a brute-force attempt
  // gets rejected cheaply instead of paying the hashing cost every time.
  const [userLimit, ipLimit] = await Promise.all([
    isRateLimited(usernameKey, MAX_ATTEMPTS_PER_USERNAME, WINDOW_SECONDS),
    isRateLimited(ipKey, MAX_ATTEMPTS_PER_IP, WINDOW_SECONDS),
  ]);
  if (userLimit.limited || ipLimit.limited) {
    const retryAfterSeconds = Math.max(userLimit.retryAfterSeconds ?? 0, ipLimit.retryAfterSeconds ?? 0);
    return NextResponse.json(
      { error: "Juda ko'p urinish. Birozdan so'ng qaytadan urining." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });

  // Constant-shaped response whether the user exists or not, to avoid
  // leaking which usernames are registered. Only FAILED attempts are
  // recorded against the rate limit — a legitimate user who mistypes once
  // and then logs in successfully should never end up rate-limited by
  // their own eventual success.
  if (!user || user.deletedAt) {
    await Promise.all([recordAttempt(usernameKey), recordAttempt(ipKey)]);
    return NextResponse.json({ error: "Login yoki parol noto'g'ri." }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: "Hisobingiz faol emas. Iltimos, biz bilan bog'laning." },
      { status: 403 },
    );
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await Promise.all([recordAttempt(usernameKey), recordAttempt(ipKey)]);
    return NextResponse.json({ error: "Login yoki parol noto'g'ri." }, { status: 401 });
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
    redirectTo: user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard",
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
    },
  });
}
