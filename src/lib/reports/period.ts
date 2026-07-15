import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export type ReportPeriod = "daily" | "weekly" | "monthly";

/** Resolves a named period (relative to `reference`, default now) into a concrete [from, to] range. */
export function resolvePeriodRange(period: ReportPeriod, reference: Date = new Date()) {
  switch (period) {
    case "daily":
      return { from: startOfDay(reference), to: endOfDay(reference) };
    case "weekly":
      return { from: startOfWeek(reference, { weekStartsOn: 1 }), to: endOfWeek(reference, { weekStartsOn: 1 }) };
    case "monthly":
      return { from: startOfMonth(reference), to: endOfMonth(reference) };
  }
}

export function periodLabelUZ(period: ReportPeriod): string {
  switch (period) {
    case "daily":
      return "Kunlik";
    case "weekly":
      return "Haftalik";
    case "monthly":
      return "Oylik";
  }
}
