import PDFDocument from "pdfkit";
import type { ReportFieldDef } from "./fields";
import type { ReportRow } from "./build-rows";
import { APP_NAME } from "@/lib/constants";

/**
 * Renders a simple, clean tabular PDF report. Column widths are distributed
 * evenly across the printable page width based on how many fields were
 * selected — this is what lets the teacher pick a handful of columns and
 * still get a readable, non-cramped table.
 */
export async function buildAttendancePdfReport(
  rows: ReportRow[],
  fields: ReportFieldDef[],
  title: string,
  subtitle?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: fields.length > 5 ? "landscape" : "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(APP_NAME, { align: "left" });
    doc.font("Helvetica-Bold").fontSize(13).text(title, { align: "left" });
    if (subtitle) {
      doc.font("Helvetica").fontSize(9).fillColor("#555555").text(subtitle);
      doc.fillColor("#000000");
    }
    doc.moveDown(0.5);

    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / fields.length;
    const rowHeight = 20;

    function drawHeader(y: number) {
      doc.font("Helvetica-Bold").fontSize(9);
      fields.forEach((f, i) => {
        doc.text(f.label, startX + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
      doc
        .moveTo(startX, y + rowHeight - 4)
        .lineTo(startX + usableWidth, y + rowHeight - 4)
        .strokeColor("#cccccc")
        .stroke();
    }

    let y = doc.y + 6;
    drawHeader(y);
    y += rowHeight;

    doc.font("Helvetica").fontSize(9);
    for (const row of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader(y);
        y += rowHeight;
        doc.font("Helvetica").fontSize(9);
      }
      fields.forEach((f, i) => {
        doc.text(String(row[f.key] ?? ""), startX + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
      y += rowHeight;
    }

    doc.font("Helvetica").fontSize(8).fillColor("#888888");
    doc.text(`Jami: ${rows.length} ta yozuv`, startX, doc.page.height - doc.page.margins.bottom + 4);

    doc.end();
  });
}
