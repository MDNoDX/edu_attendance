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
 * The teacher's payout, in words, from the spec:
 *
 *   1. Every time the student is PRESENT (or LATE — physically attended),
 *      the teacher earns the full lesson rate. This always resets any
 *      ongoing absence streak back to zero.
 *
 *   2. If the student is ABSENT (excused or unexcused — both count the same
 *      way for this rule), the teacher STILL earns the full rate for the
 *      1st and 2nd consecutive absence. Only starting from the 3RD
 *      consecutive absence onward does the teacher's payout for that lesson
 *      become zero. The cutoff stays in effect for every subsequent absence
 *      until the student attends again, at which point the streak resets
 *      and full payouts resume immediately.
 *
 *   Verified against the spec's worked examples:
 *
 *   Example 1 — a student who stops coming:
 *     Keldi, Kelmadi, Kelmadi, Kelmadi, Kelmadi, Kelmadi
 *     (Present, Absent x5)
 *     Earnings for the 5 absences: 18500, 18500, 0, 0, 0
 *       -> absence #1 (streak=1): still paid
 *       -> absence #2 (streak=2): still paid
 *       -> absence #3 (streak=3): CUTOFF -> 0
 *       -> absence #4 (streak=4): 0
 *       -> absence #5 (streak=5): 0
 *
 *   Example 2 — a student who misses on and off, never 3 in a row:
 *     Keldi, Kelmadi, Keldi, Kelmadi, Kelmadi, Keldi
 *     (Present, Absent, Present, Absent, Absent, Present)
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
 * Computes the teacher earning for a single new attendance mark, given the
 * student's consecutive-miss streak BEFORE this lesson (0 if the previous
 * lesson was attended or this is the first lesson on record).
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

  // A miss (excused or unexcused) extends the streak.
  const streakAfter = streakBefore + 1;
  // The 1st and 2nd consecutive miss still pay in full; the 3rd+ pays 0.
  const earning = streakAfter >= CONSECUTIVE_MISS_CUTOFF ? 0 : lessonRate;
  return { earning, streakAfter };
}

/**
 * Walks a student's full chronological attendance history for a group and
 * recomputes the teacher earning for every lesson, applying the
 * consecutive-miss cutoff rule. Use this to (re)build earnings when
 * back-filling history, auditing, or displaying a breakdown to the teacher.
 */
export function computeEarningsForHistory(
  history: AttendanceHistoryEntry[],
  lessonRate: number,
): ComputedEarningEntry[] {
  let streak = 0;
  const results: ComputedEarningEntry[] = [];

  for (const entry of history) {
    const { earning, streakAfter } = computeLessonEarning(entry.status, streak, lessonRate);
    results.push({
      ...entry,
      teacherEarning: earning,
      streakAfter,
      isPastCutoff: isMiss(entry.status) && streakAfter >= CONSECUTIVE_MISS_CUTOFF,
    });
    streak = streakAfter;
  }

  return results;
}

/**
 * Given the CURRENT consecutive-miss streak for a student (computed from
 * their prior attendance records, most recent last), returns the earning for
 * a NEW attendance mark being recorded right now. Server actions call this
 * at mark-time so we never have to recompute the whole history on every
 * write — only the running streak (stored redundantly on the student's most
 * recent attendance row, or recomputed cheaply via a bounded lookback query)
 * needs to be known.
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
