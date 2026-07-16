import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getAttendanceInRange } from "@/app/actions/attendance";
import { getReportAnalytics } from "@/app/actions/reports";
import { buildAttendanceReportRows } from "@/lib/reports/build-rows";
import { buildAttendanceExcelReport, type ReportSummaryItem } from "@/lib/reports/excel";
import { buildAttendancePdfReport } from "@/lib/reports/pdf";
import { resolveRequestedFields } from "@/lib/reports/fields";
import { resolvePeriodRange, periodLabelUZ, type ReportPeriod } from "@/lib/reports/period";
import { formatDate, formatUZS } from "@/lib/utils";

export const runtime = "nodejs";
// This route reads the session cookie (via requireSession) on every request,
// so it can never be statically rendered/cached. Without this, Next.js may
// attempt static optimization and throw "Dynamic server usage: ... cookies"
// at request time in production.
export const dynamic = "force-dynamic";

/**
 * The teacher's own attendance/earnings report export. The teacher chooses
 * exactly which columns to include via `fields` (comma-separated field
 * keys, see src/lib/reports/fields.ts) — if omitted, a sensible default
 * subset is used. Optionally narrowed to one group via `groupId`. Always
 * scoped strictly to the logged-in teacher's own lessons.
 * GET /api/reports/teacher?period=daily|weekly|monthly&format=pdf|xlsx&fields=date,status,teacherEarning&groupId=...&from=...&to=...
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    const format = searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
    const fieldsParam = searchParams.get("fields");
    const fields = resolveRequestedFields(fieldsParam ? fieldsParam.split(",") : undefined);
    const groupId = searchParams.get("groupId") || undefined;
    const studentId = searchParams.get("studentId") || undefined;

    // Either an explicit from/to range (used by the Hisobot page's custom
    // date range) or a named period (daily/weekly/monthly) fallback.
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    let from: Date;
    let to: Date;
    let title: string;

    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      to.setHours(23, 59, 59, 999);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json({ error: "Sana oralig'i noto'g'ri." }, { status: 400 });
      }
      title = `Hisobot — ${session.fullName}`;
    } else {
      const period = (searchParams.get("period") as ReportPeriod) || "monthly";
      const range = resolvePeriodRange(period);
      from = range.from;
      to = range.to;
      title = `${periodLabelUZ(period)} hisobot — ${session.fullName}`;
    }

    const [records, analytics] = await Promise.all([
      getAttendanceInRange({ from, to, groupId, studentId }),
      // The same three headline figures shown at the top of the Hisobot page
      // — computed with the identical from/to/groupId/studentId scope — so
      // the exported file's summary block always matches what was on screen
      // when the teacher clicked export.
      getReportAnalytics({ from, to, groupId, studentId }),
    ]);
    const rows = buildAttendanceReportRows(records as never);
    const subtitle = `${formatDate(from)} — ${formatDate(to)}`;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Tanlangan davrda hech qanday davomat yozuvi topilmadi." },
        { status: 404 },
      );
    }

    const summary: ReportSummaryItem[] = [
      { label: "Umumiy tushadigan summa", value: formatUZS(analytics.totalGrossRevenue) },
      { label: "Oylik kutilayotgan summa", value: formatUZS(analytics.totalExpectedThisMonth) },
      { label: "Olingan ulush (shu oy)", value: formatUZS(analytics.totalEarnedMonthToDate) },
      { label: "Davr ichida ulushim", value: formatUZS(analytics.totalEarnedInRange) },
    ];

    const filenameDate = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

    if (format === "xlsx") {
      const buffer = await buildAttendanceExcelReport(rows, fields, `${title} (${subtitle})`, summary);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="hisobot-${filenameDate}.xlsx"`,
        },
      });
    }

    const buffer = await buildAttendancePdfReport(rows, fields, title, subtitle, summary);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hisobot-${filenameDate}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Report export failed:", error);
    const message = error instanceof Error && error.message === "UNAUTHENTICATED"
      ? "Tizimga qayta kiring."
      : "Hisobotni yaratishda xatolik yuz berdi. Qaytadan urinib ko'ring.";
    const status = error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
