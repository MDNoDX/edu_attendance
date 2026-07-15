import { PrismaClient } from "@prisma/client";

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
