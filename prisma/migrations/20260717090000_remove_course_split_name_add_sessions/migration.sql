-- ============================================================================
-- 1. User: split fullName into firstName/lastName (fullName stays as a
--    denormalized cache, kept in sync at every write going forward).
-- ============================================================================
ALTER TABLE "users" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

UPDATE "users"
SET
  "firstName" = CASE
    WHEN position(' ' in "fullName") > 0 THEN split_part("fullName", ' ', 1)
    ELSE "fullName"
  END,
  "lastName" = CASE
    WHEN position(' ' in "fullName") > 0 THEN trim(both ' ' from substring("fullName" from position(' ' in "fullName") + 1))
    ELSE ''
  END;

-- ============================================================================
-- 2. Group: absorb Course's pricing fields directly, backfilled from the
--    linked course row before the FK is dropped.
-- ============================================================================
ALTER TABLE "groups" ADD COLUMN "subject" TEXT;
ALTER TABLE "groups" ADD COLUMN "monthlyPrice" DECIMAL(14,2);
ALTER TABLE "groups" ADD COLUMN "lessonsPerMonth" INTEGER;

UPDATE "groups" g
SET
  "subject" = c."subject",
  "monthlyPrice" = c."monthlyPrice",
  "lessonsPerMonth" = c."lessonsPerMonth"
FROM "courses" c
WHERE g."courseId" = c."id";

-- Safety net in case any group's course row was somehow already missing.
UPDATE "groups" SET "monthlyPrice" = 0 WHERE "monthlyPrice" IS NULL;
UPDATE "groups" SET "lessonsPerMonth" = 12 WHERE "lessonsPerMonth" IS NULL;

ALTER TABLE "groups" ALTER COLUMN "monthlyPrice" SET NOT NULL;
ALTER TABLE "groups" ALTER COLUMN "lessonsPerMonth" SET NOT NULL;

ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_courseId_fkey";
DROP INDEX IF EXISTS "groups_courseId_idx";
ALTER TABLE "groups" DROP COLUMN "courseId";

-- ============================================================================
-- 3. Student: drop the direct course link (a student's course/price now
--    comes entirely from their group), and relax gender/birthDate to
--    optional — not every teacher needs/wants to record these.
-- ============================================================================
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_courseId_fkey";
DROP INDEX IF EXISTS "students_courseId_idx";
ALTER TABLE "students" DROP COLUMN "courseId";

ALTER TABLE "students" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "students" ALTER COLUMN "birthDate" DROP NOT NULL;

-- ============================================================================
-- 4. Drop the Course table entirely — nothing references it anymore.
-- ============================================================================
DROP TABLE IF EXISTS "courses";

-- ============================================================================
-- 5. Sessions: one row per issued login, for the "which devices are logged
--    in" profile feature.
-- ============================================================================
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_tokenId_key" ON "sessions"("tokenId");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
