import ExcelJS from "exceljs";
import type { ReportFieldDef } from "./fields";
import type { ReportRow } from "./build-rows";
import { APP_NAME } from "@/lib/constants";

export async function buildAttendanceExcelReport(
  rows: ReportRow[],
  fields: ReportFieldDef[],
  title: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Davomat hisobot", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  sheet.mergeCells(1, 1, 1, fields.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { size: 14, bold: true };
  titleCell.alignment = { horizontal: "left" };

  sheet.getRow(2).values = fields.map((f) => f.label);
  sheet.getRow(2).font = { bold: true };
  sheet.getRow(2).eachCell((cell) => {
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
