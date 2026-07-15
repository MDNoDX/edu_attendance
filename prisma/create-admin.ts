/**
 * One-time provisioning script for a SUPER_ADMIN account. There is no
 * self-signup path for admins (by design — /signup always creates a
 * TEACHER) so this is the only way to create one.
 *
 * Usage (reads from env vars so the password never appears in shell
 * history / process list args):
 *
 *   ADMIN_USERNAME="nodirbek_admin" ADMIN_PASSWORD="StrongPass123!" ADMIN_FULLNAME="Nodirbek" \
 *     npx tsx prisma/create-admin.ts
 *
 * Safe to re-run: if the username already exists, it just updates the
 * password/role/fullName instead of failing.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULLNAME || "Super Admin";

  if (!username || !password) {
    console.error(
      "Missing ADMIN_USERNAME / ADMIN_PASSWORD.\n\n" +
        'Usage: ADMIN_USERNAME="nodirbek_admin" ADMIN_PASSWORD="StrongPass123!" ADMIN_FULLNAME="Nodirbek" npx tsx prisma/create-admin.ts',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD kamida 8 ta belgidan iborat bo'lsin.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      fullName,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    update: {
      passwordHash,
      fullName,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log(`Super-admin tayyor: username="${user.username}", id=${user.id}`);
  console.log(`/login sahifasidan shu login/parol bilan kiring — avtomatik /admin ga yo'naltiriladi.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
