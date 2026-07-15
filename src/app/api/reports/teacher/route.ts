import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getAttendanceInRange } from "@/app/actions/attendance";
import { buildAttendanceReportRows } from "@/lib/reports/build-rows";
import { buildAttendanceExcelReport } from "@/lib/reports/excel";
import { buildAttendancePdfReport } from "@/lib/reports/pdf";
import { resolveRequestedFields } from "@/lib/reports/fields";
import { resolvePeriodRange, periodLabelUZ, type ReportPeriod } from "@/lib/reports/period";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * The teacher's own attendance/earnings report export. The teacher chooses
 * exactly which columns to include via `fields` (comma-separated field
 * keys, see src/lib/reports/fields.ts) — if omitted, a sensible default
 * subset is used. Optionally narrowed to one group via `groupId`. Always
 * scoped strictly to the logged-in teacher's own lessons.
 * GET /api/reports/teacher?period=daily|weekly|monthly&format=pdf|xlsx&fields=date,status,teacherEarning&groupId=...
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);

  const period = (searchParams.get("period") as ReportPeriod) || "monthly";
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const fieldsParam = searchParams.get("fields");
  const fields = resolveRequestedFields(fieldsParam ? fieldsParam.split(",") : undefined);
  const groupId = searchParams.get("groupId") || undefined;

  const { from, to } = resolvePeriodRange(period);
  const records = await getAttendanceInRange({ from, to, groupId });
  const rows = buildAttendanceReportRows(records as never);

  const title = `${periodLabelUZ(period)} hisobot — ${session.fullName}`;
  const subtitle = `${formatDate(from)} — ${formatDate(to)}`;

  if (format === "xlsx") {
    const buffer = await buildAttendanceExcelReport(rows, fields, `${title} (${subtitle})`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mening-hisobotim-${period}.xlsx"`,
      },
    });
  }

  const buffer = await buildAttendancePdfReport(rows, fields, title, subtitle);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mening-hisobotim-${period}.pdf"`,
    },
  });
}
