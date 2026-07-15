/**
 * =============================================================================
 * CORE BUSINESS RULE: Attendance-driven Teacher Earnings
 * =============================================================================
 *
 * A student pays a fixed monthly tuition (e.g. 720 000 so'm) for a fixed
 * number of lessons per month (e.g. 12). This gives a per-lesson value:
 *
 *      lessonValue = monthlyPrice / lessonsPerMonth      (720000 / 12 = 60000)
 *
 * Independently, a teacher earns a fixed per-lesson share (e.g. 18 500 so'm).
 * The teacher's payout, in words, from the spec (updated per the teacher's
 * explicit correction — the cutoff now zeroes the WHOLE consecutive-miss
 * run retroactively, not just the lessons from the 3rd miss onward):
 *
 *   1. Every time the student is PRESENT (or LATE — physically attended),
 *      the teacher earns the full lesson rate. This always resets any
 *      ongoing absence streak back to zero.
 *
 *   2. If the student is ABSENT (excused or unexcused — both count the same
 *      way for this rule), the teacher STILL earns the full rate for the
 *      1st and 2nd consecutive absence — no deduction at all as long as the
 *      streak stays below 3.
 *
 *   3. The moment a streak reaches the 3rd consecutive absence, the payout
 *      for ALL THREE of those lessons becomes zero — including the 1st and
 *      2nd, which had already been marked as paid. In other words, hitting
 *      the cutoff doesn't just zero the newest lesson going forward, it
 *      retroactively wipes out the entire run of misses that led up to it.
 *      A 4th consecutive miss zeroes all 4; a 5th zeroes all 5; and so on —
 *      every miss in an unbroken run of 3+ pays 0 once the run reaches 3.
 *
 *   4. The instant the student attends again (PRESENT or LATE), the streak
 *      resets to zero and full payouts resume immediately from that lesson.
 *
 *   Worked examples (per the teacher's own numbers, rate = 18 500):
 *
 *   Example A — exactly 3 consecutive misses:
 *     Keldi, Kelmadi, Kelmadi, Kelmadi
 *     Earnings: 18500, 0, 0, 0
 *       -> once the streak hits 3, ALL 3 misses pay 0 (18500*3 not paid),
 *          not just the 3rd one.
 *
 *   Example B — exactly 4 consecutive misses:
 *     Keldi, Kelmadi, Kelmadi, Kelmadi, Kelmadi
 *     Earnings: 18500, 0, 0, 0, 0
 *       -> all 4 misses pay 0 (18500*4 not paid).
 *
 *   Example C — a student who misses on and off, never 3 in a row:
 *     Keldi, Kelmadi, Keldi, Kelmadi, Kelmadi, Keldi
 *     "hech qanday chegirma bo'lmaydi" — no deduction at all, because every
 *     PRESENT resets the streak before it ever reaches 3.
 *
 *   "LATE" (kechikdi) counts as attended for payout purposes (the student is
 *   physically in the room) — it pays in full and resets the streak, exactly
 *   like PRESENT. Only EXCUSED_ABSENT and UNEXCUSED_ABSENT count as a "miss"
 *   towards the streak, and the rule makes no distinction between the two.
 * =============================================================================
 */

export type AttendanceMark =
  | "PRESENT"
  | "EXCUSED_ABSENT"
  | "UNEXCUSED_ABSENT"
  | "LATE";

export interface AttendanceHistoryEntry {
  /** Stable identifier for the lesson session, used only for output mapping. */
  lessonSessionId: string;
  /** ISO date string or Date; must be in chronological order relative to siblings. */
  date: string | Date;
  status: AttendanceMark;
}

export interface ComputedEarningEntry extends AttendanceHistoryEntry {
  /** Amount credited to the teacher for this specific lesson. */
  teacherEarning: number;
  /** Consecutive-miss streak count AFTER this lesson (0 if present/late). */
  streakAfter: number;
  /** True when this lesson's absence fell at/after the 3rd consecutive miss (i.e. paid 0 because of the cutoff). */
  isPastCutoff: boolean;
}

const MISS_STATUSES = new Set<AttendanceMark>([
  "EXCUSED_ABSENT",
  "UNEXCUSED_ABSENT",
]);

/** The streak length at which the teacher payout for a miss drops to zero. */
export const CONSECUTIVE_MISS_CUTOFF = 3;

/** A lesson counts as "attended" for payout purposes if PRESENT or LATE. */
export function isAttended(status: AttendanceMark): boolean {
  return status === "PRESENT" || status === "LATE";
}

export function isMiss(status: AttendanceMark): boolean {
  return MISS_STATUSES.has(status);
}

/**
 * Computes the teacher earning for a single new attendance mark IN ISOLATION,
 * given the student's consecutive-miss streak BEFORE this lesson. This does
 * NOT apply the retroactive whole-streak-zero rule (it can't — that requires
 * rewriting earlier lessons too, which only `computeEarningsForHistory` can
 * do with the full history in hand). Useful only for streak bookkeeping;
 * `computeEarningsForHistory` is the single source of truth for what a
 * teacher actually gets paid.
 */
export function computeLessonEarning(
  status: AttendanceMark,
  streakBefore: number,
  lessonRate: number,
): { earning: number; streakAfter: number } {
  if (isAttended(status)) {
    // Present or late: full payout, streak resets.
    return { earning: lessonRate, streakAfter: 0 };
  }

  // A miss (excused or unexcused) extends the streak. This lesson-in-isolation
  // view pays in full below the cutoff; once the caller's streak reaches the
  // cutoff, computeEarningsForHistory is what actually zeroes the whole run.
  const streakAfter = streakBefore + 1;
  const earning = streakAfter >= CONSECUTIVE_MISS_CUTOFF ? 0 : lessonRate;
  return { earning, streakAfter };
}

/**
 * Walks a student's full chronological attendance history for a group and
 * recomputes the teacher earning for every lesson, applying the
 * consecutive-miss cutoff rule. This is the single source of truth for
 * teacher payouts — call it (and persist every entry's `teacherEarning`)
 * any time attendance history changes, since a single new mark can change
 * the payout of EARLIER lessons too (see below).
 *
 * The cutoff is retroactive: as soon as a run of consecutive misses reaches
 * CONSECUTIVE_MISS_CUTOFF (3), every lesson in that run — from its very
 * first miss — pays 0, not just the lessons from the 3rd miss onward. A run
 * of exactly 3 misses loses all 3; a run of 4 loses all 4; and so on. A run
 * of only 1 or 2 misses is unaffected and still pays in full.
 */
export function computeEarningsForHistory(
  history: AttendanceHistoryEntry[],
  lessonRate: number,
): ComputedEarningEntry[] {
  const results: ComputedEarningEntry[] = [];
  let streak = 0;
  /** Index in `results` where the CURRENT unbroken run of misses began (-1 if not in a run). */
  let runStart = -1;

  for (const entry of history) {
    if (isAttended(entry.status)) {
      streak = 0;
      runStart = -1;
      results.push({ ...entry, teacherEarning: lessonRate, streakAfter: 0, isPastCutoff: false });
      continue;
    }

    // A miss: extend (or start) the current run.
    if (runStart === -1) runStart = results.length;
    streak += 1;

    if (streak < CONSECUTIVE_MISS_CUTOFF) {
      // Still within the grace period — pays in full, for now. This may get
      // retroactively zeroed below if the run keeps going and hits the cutoff.
      results.push({ ...entry, teacherEarning: lessonRate, streakAfter: streak, isPastCutoff: false });
    } else {
      // Cutoff reached (or already passed, for the 4th+ miss in this run):
      // this lesson pays 0, and so does every earlier lesson in this same run.
      results.push({ ...entry, teacherEarning: 0, streakAfter: streak, isPastCutoff: true });
      for (let i = runStart; i < results.length - 1; i++) {
        results[i] = { ...results[i], teacherEarning: 0, isPastCutoff: true };
      }
    }
  }

  return results;
}

/**
 * Given the CURRENT consecutive-miss streak for a student (computed from
 * their prior attendance records, most recent last), returns the earning for
 * a NEW attendance mark being recorded right now, IN ISOLATION (see the
 * caveat on `computeLessonEarning` above — this cannot retroactively rewrite
 * earlier lessons, so `computeEarningsForHistory` must still be used to
 * persist the final, authoritative earnings after every write).
 */
export function computeNewMarkEarning(
  newStatus: AttendanceMark,
  currentStreakBeforeThisMark: number,
  lessonRate: number,
): { earning: number; newStreak: number } {
  const { earning, streakAfter } = computeLessonEarning(
    newStatus,
    currentStreakBeforeThisMark,
    lessonRate,
  );
  return { earning, newStreak: streakAfter };
}

/**
 * Recomputes the current consecutive-miss streak by walking backwards from
 * the most recent attendance record until a PRESENT/LATE is found (streak
 * resets) or history is exhausted. `recentFirst` must be ordered most recent
 * lesson first.
 */
export function computeCurrentStreak(recentFirst: AttendanceMark[]): number {
  let streak = 0;
  for (const status of recentFirst) {
    if (isAttended(status)) break;
    if (isMiss(status)) streak += 1;
  }
  return streak;
}

/** monthlyPrice / lessonsPerMonth, rounded to the nearest integer so'm. */
export function computeLessonValue(monthlyPrice: number, lessonsPerMonth: number): number {
  if (lessonsPerMonth <= 0) return 0;
  return Math.round(monthlyPrice / lessonsPerMonth);
}

export interface EarningsSummary {
  totalLessons: number;
  attendedLessons: number;
  excusedAbsences: number;
  unexcusedAbsences: number;
  lateArrivals: number;
  totalEarned: number;
  /** Sum of lessonRate for every miss that fell past the cutoff (i.e. what was NOT paid because of the rule). */
  totalLostToCutoff: number;
}

/** Aggregates a computed history into the summary numbers shown on the teacher dashboard. */
export function summarizeEarnings(
  computed: ComputedEarningEntry[],
  lessonRate: number,
): EarningsSummary {
  const summary: EarningsSummary = {
    totalLessons: computed.length,
    attendedLessons: 0,
    excusedAbsences: 0,
    unexcusedAbsences: 0,
    lateArrivals: 0,
    totalEarned: 0,
    totalLostToCutoff: 0,
  };

  for (const e of computed) {
    if (e.status === "PRESENT") summary.attendedLessons += 1;
    else if (e.status === "LATE") {
      summary.attendedLessons += 1;
      summary.lateArrivals += 1;
    } else if (e.status === "EXCUSED_ABSENT") summary.excusedAbsences += 1;
    else if (e.status === "UNEXCUSED_ABSENT") summary.unexcusedAbsences += 1;

    summary.totalEarned += e.teacherEarning;
    if (e.isPastCutoff) {
      summary.totalLostToCutoff += lessonRate;
    }
  }

  return summary;
}
