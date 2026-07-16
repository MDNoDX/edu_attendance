import ExcelJS from "exceljs";
import type { ReportFieldDef } from "./fields";
import type { ReportRow } from "./build-rows";
import { APP_NAME } from "@/lib/constants";

export interface ReportSummaryItem {
  label: string;
  value: string;
}

/**
 * `summary`, when provided, renders as a professional headline block right
 * under the title (gross revenue / this-month expected ceiling / earned so
 * far, etc.) — the same numbers shown at the top of the Hisobot page — so
 * the exported file always carries them, not just the raw attendance rows.
 */
export async function buildAttendanceExcelReport(
  rows: ReportRow[],
  fields: ReportFieldDef[],
  title: string,
  summary?: ReportSummaryItem[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Davomat hisobot", {
    views: [{ state: "frozen", ySplit: (summary && summary.length > 0 ? 2 + summary.length + 1 : 2) }],
  });

  const colCount = Math.max(fields.length, 2);

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { size: 14, bold: true };
  titleCell.alignment = { horizontal: "left" };

  let headerRowIndex = 2;

  if (summary && summary.length > 0) {
    headerRowIndex = 2 + summary.length + 1;
    summary.forEach((item, i) => {
      const rowIndex = 2 + i;
      sheet.mergeCells(rowIndex, 1, rowIndex, Math.ceil(colCount / 2));
      const labelCell = sheet.getCell(rowIndex, 1);
      labelCell.value = item.label;
      labelCell.font = { size: 10, color: { argb: "FF6B7280" } };

      sheet.mergeCells(rowIndex, Math.ceil(colCount / 2) + 1, rowIndex, colCount);
      const valueCell = sheet.getCell(rowIndex, Math.ceil(colCount / 2) + 1);
      valueCell.value = item.value;
      valueCell.font = { size: 12, bold: true };
      valueCell.alignment = { horizontal: "right" };
      sheet.getRow(rowIndex).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
      });
    });
  }

  sheet.getRow(headerRowIndex).values = fields.map((f) => f.label);
  sheet.getRow(headerRowIndex).font = { bold: true };
  sheet.getRow(headerRowIndex).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin" } };
  });

  fields.forEach((f, i) => {
    sheet.getColumn(i + 1).width = Math.max(f.label.length + 4, 16);
  });

  for (const row of rows) {
    sheet.addRow(fields.map((f) => row[f.key] ?? ""));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
