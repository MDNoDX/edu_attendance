import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";

export const runtime = "nodejs";

// Self-service registration: any teacher creates their own account directly.
// There is no admin who provisions accounts — this is the only way in.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ma'lumotlar noto'g'ri kiritildi.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password, fullName, email, phone, defaultLessonRate, specialization } =
    parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "Bu login band. Boshqa login tanlang." },
      { status: 409 },
    );
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "Bu email allaqachon ro'yxatdan o'tgan." },
        { status: 409 },
      );
    }
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      fullName,
      email: email ? email : null,
      phone: phone || null,
      defaultLessonRate,
      specialization: specialization || null,
    },
  });

  await createSessionCookie({
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
  });

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
