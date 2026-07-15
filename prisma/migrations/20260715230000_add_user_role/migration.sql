-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TEACHER', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'TEACHER';
