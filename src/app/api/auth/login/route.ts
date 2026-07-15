import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";

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

  const user = await prisma.user.findUnique({ where: { username } });

  // Constant-shaped response whether the user exists or not, to avoid
  // leaking which usernames are registered.
  if (!user || user.deletedAt) {
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
    return NextResponse.json({ error: "Login yoki parol noto'g'ri." }, { status: 401 });
  }

  await createSessionCookie({
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  });

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
