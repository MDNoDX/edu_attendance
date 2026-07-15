/**
 * The full set of columns available in an attendance report. The teacher
 * export UI lets the teacher tick which of these columns to include before
 * generating the PDF/Excel file, per the product requirement that the
 * teacher can choose exactly what data appears in their own export.
 */
export interface ReportFieldDef {
  key: string;
  label: string;
  /** Included in the default selection when the teacher first opens the export dialog. */
  defaultSelected: boolean;
}

export const ATTENDANCE_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "date", label: "Sana", defaultSelected: true },
  { key: "studentName", label: "O'quvchi", defaultSelected: true },
  { key: "groupName", label: "Guruh", defaultSelected: true },
  { key: "courseName", label: "Kurs", defaultSelected: false },
  { key: "roomName", label: "Xona", defaultSelected: false },
  { key: "status", label: "Holati", defaultSelected: true },
  { key: "note", label: "Izoh", defaultSelected: false },
  { key: "lessonValue", label: "Dars qiymati", defaultSelected: false },
  { key: "teacherEarning", label: "Ulushim", defaultSelected: true },
];

export const ATTENDANCE_STATUS_LABEL_UZ: Record<string, string> = {
  PRESENT: "Keldi",
  EXCUSED_ABSENT: "Sababli kelmadi",
  UNEXCUSED_ABSENT: "Sababsiz kelmadi",
  LATE: "Kechikdi",
};

export function resolveRequestedFields(requested: string[] | undefined): ReportFieldDef[] {
  if (!requested || requested.length === 0) {
    return ATTENDANCE_REPORT_FIELDS.filter((f) => f.defaultSelected);
  }
  const requestedSet = new Set(requested);
  return ATTENDANCE_REPORT_FIELDS.filter((f) => requestedSet.has(f.key));
}
