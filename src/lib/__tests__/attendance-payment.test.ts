import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeEarningsForHistory,
  computeLessonValue,
  computeCurrentStreak,
  summarizeEarnings,
  type AttendanceHistoryEntry,
} from "../attendance-payment";

const RATE = 18500;

function entry(id: string, date: string, status: AttendanceHistoryEntry["status"]): AttendanceHistoryEntry {
  return { lessonSessionId: id, date, status };
}

test("updated spec: exactly 3 consecutive absences -> ALL 3 pay 0 (retroactive)", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "2026-07-01", "PRESENT"),
    entry("l2", "2026-07-02", "UNEXCUSED_ABSENT"),
    entry("l3", "2026-07-03", "UNEXCUSED_ABSENT"),
    entry("l4", "2026-07-04", "UNEXCUSED_ABSENT"),
  ];

  const computed = computeEarningsForHistory(history, RATE);
  const earnings = computed.map((c) => c.teacherEarning);

  // 18500 * 3 (all three misses) is NOT paid — not just the 3rd one.
  assert.deepEqual(earnings, [RATE, 0, 0, 0]);
});

test("updated spec: exactly 4 consecutive absences -> all 4 pay 0 (retroactive)", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "2026-07-01", "PRESENT"),
    entry("l2", "2026-07-02", "UNEXCUSED_ABSENT"),
    entry("l3", "2026-07-03", "UNEXCUSED_ABSENT"),
    entry("l4", "2026-07-04", "UNEXCUSED_ABSENT"),
    entry("l5", "2026-07-05", "UNEXCUSED_ABSENT"),
  ];

  const computed = computeEarningsForHistory(history, RATE);
  const earnings = computed.map((c) => c.teacherEarning);

  assert.deepEqual(earnings, [RATE, 0, 0, 0, 0]);
});

test("only 1 or 2 consecutive absences: still no deduction at all", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "2026-07-01", "UNEXCUSED_ABSENT"),
    entry("l2", "2026-07-02", "UNEXCUSED_ABSENT"),
    entry("l3", "2026-07-03", "PRESENT"),
  ];
  const computed = computeEarningsForHistory(history, RATE);
  assert.deepEqual(
    computed.map((c) => c.teacherEarning),
    [RATE, RATE, RATE],
  );
});

test("spec example 2: alternating present/absent never reaches a streak of 3 -> no deduction ever", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "2026-07-01", "PRESENT"),
    entry("l2", "2026-07-02", "UNEXCUSED_ABSENT"),
    entry("l3", "2026-07-03", "PRESENT"),
    entry("l4", "2026-07-04", "UNEXCUSED_ABSENT"),
    entry("l5", "2026-07-05", "UNEXCUSED_ABSENT"),
    entry("l6", "2026-07-06", "PRESENT"),
  ];

  const computed = computeEarningsForHistory(history, RATE);
  const earnings = computed.map((c) => c.teacherEarning);

  // every single lesson pays the full rate — no cutoff ever triggers
  assert.deepEqual(earnings, [RATE, RATE, RATE, RATE, RATE, RATE]);
  assert.ok(computed.every((c) => !c.isPastCutoff));
});

test("streak resets immediately on attendance, even after a retroactive wipe", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "d1", "UNEXCUSED_ABSENT"), // streak 1 -> paid for now
    entry("l2", "d2", "UNEXCUSED_ABSENT"), // streak 2 -> paid for now
    entry("l3", "d3", "UNEXCUSED_ABSENT"), // streak 3 -> cutoff: l1,l2,l3 ALL become 0
    entry("l4", "d4", "UNEXCUSED_ABSENT"), // streak 4 -> still 0
    entry("l5", "d5", "PRESENT"), // resets to 0, pays
    entry("l6", "d6", "UNEXCUSED_ABSENT"), // streak 1 again -> pays (new run, below cutoff)
  ];
  const computed = computeEarningsForHistory(history, RATE);
  assert.deepEqual(
    computed.map((c) => c.teacherEarning),
    [0, 0, 0, 0, RATE, RATE],
  );
  assert.deepEqual(
    computed.map((c) => c.streakAfter),
    [1, 2, 3, 4, 0, 1],
  );
});

test("excused and unexcused absences count identically toward the streak", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "d1", "EXCUSED_ABSENT"),
    entry("l2", "d2", "UNEXCUSED_ABSENT"),
    entry("l3", "d3", "EXCUSED_ABSENT"),
  ];
  const computed = computeEarningsForHistory(history, RATE);
  // streak reaches 3 on l3 -> all 3 (mixed excused/unexcused) are wiped
  assert.deepEqual(
    computed.map((c) => c.teacherEarning),
    [0, 0, 0],
  );
});

test("LATE counts as attended: pays in full and resets the streak", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "d1", "UNEXCUSED_ABSENT"),
    entry("l2", "d2", "UNEXCUSED_ABSENT"),
    entry("l3", "d3", "LATE"),
    entry("l4", "d4", "UNEXCUSED_ABSENT"),
    entry("l5", "d5", "UNEXCUSED_ABSENT"),
  ];
  const computed = computeEarningsForHistory(history, RATE);
  assert.deepEqual(
    computed.map((c) => c.teacherEarning),
    [RATE, RATE, RATE, RATE, RATE],
  );
  assert.deepEqual(
    computed.map((c) => c.streakAfter),
    [1, 2, 0, 1, 2],
  );
});

test("computeLessonValue divides monthly price by lessons per month", () => {
  assert.equal(computeLessonValue(720000, 12), 60000);
  assert.equal(computeLessonValue(500000, 0), 0);
});

test("computeCurrentStreak walks backwards from most-recent-first list", () => {
  assert.equal(computeCurrentStreak(["UNEXCUSED_ABSENT", "UNEXCUSED_ABSENT", "PRESENT"]), 2);
  assert.equal(computeCurrentStreak(["PRESENT", "UNEXCUSED_ABSENT", "UNEXCUSED_ABSENT"]), 0);
  assert.equal(computeCurrentStreak([]), 0);
});

test("summarizeEarnings aggregates totals correctly", () => {
  const history: AttendanceHistoryEntry[] = [
    entry("l1", "d1", "PRESENT"),
    entry("l2", "d2", "UNEXCUSED_ABSENT"),
    entry("l3", "d3", "UNEXCUSED_ABSENT"),
    entry("l4", "d4", "UNEXCUSED_ABSENT"), // cutoff -> l2,l3,l4 ALL become 0
    entry("l5", "d5", "EXCUSED_ABSENT"), // same run continues -> 0
    entry("l6", "d6", "LATE"), // resets, pays
  ];
  const computed = computeEarningsForHistory(history, RATE);
  const summary = summarizeEarnings(computed, RATE);

  assert.equal(summary.totalLessons, 6);
  assert.equal(summary.attendedLessons, 2); // PRESENT + LATE
  assert.equal(summary.lateArrivals, 1);
  assert.equal(summary.unexcusedAbsences, 3);
  assert.equal(summary.excusedAbsences, 1);
  assert.equal(summary.totalEarned, RATE * 2); // l1, l6 only
  assert.equal(summary.totalLostToCutoff, RATE * 4); // l2, l3, l4, l5
});
