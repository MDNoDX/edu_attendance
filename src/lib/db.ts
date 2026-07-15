import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma Client singleton.
 *
 * In serverless/edge environments (Vercel) and in Next.js dev mode with hot
 * reload, every module reload would otherwise instantiate a brand new
 * PrismaClient and eventually exhaust the Postgres connection limit. We cache
 * the instance on `globalThis` so it survives HMR and is reused across
 * invocations within the same serverless execution context.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Turns a raw Prisma/DB error into a short Uzbek message safe to show a
 * teacher, instead of ever letting a raw stack/exception reach the client as
 * an uncaught Server Action rejection (which otherwise reads as the whole
 * screen "jumping" to an error state mid-click). Server actions that write
 * data (markAttendance, etc.) should wrap their body in try/catch and return
 * `{ ok: false, error: toFriendlyDbError(err) }` on failure.
 */
export function toFriendlyDbError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2022: a column the deployed code expects doesn't exist yet in the
    // database — always means a pending migration hasn't been applied.
    if (err.code === "P2022") {
      return "Tizim yangilanmoqda — bazaga oxirgi o'zgarishlar hali qo'llanilmagan. Birozdan so'ng qaytadan urinib ko'ring.";
    }
    if (err.code === "P2025") {
      return "Bu yozuv topilmadi — sahifani yangilab ko'ring.";
    }
    return "Ma'lumotlar bazasida xatolik yuz berdi. Qaytadan urinib ko'ring.";
  }
  return "Kutilmagan xatolik yuz berdi. Qaytadan urinib ko'ring.";
}
