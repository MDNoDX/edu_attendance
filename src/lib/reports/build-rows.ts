import { formatDate, formatUZS } from "@/lib/utils";
import { ATTENDANCE_STATUS_LABEL_UZ } from "./fields";
import type { Attendance, Student, LessonSession, Group } from "@prisma/client";

type FullAttendanceRow = Attendance & {
  student: Student;
  lessonSession: LessonSession & {
    group: Group;
  };
};

export interface ReportRow {
  date: string;
  studentName: string;
  groupName: string;
  subjectName: string;
  roomName: string;
  status: string;
  note: string;
  lessonValue: string;
  teacherEarning: string;
  [key: string]: string;
}

export function buildAttendanceReportRows(records: FullAttendanceRow[]): ReportRow[] {
  return records.map((r) => ({
    date: formatDate(r.lessonSession.date),
    studentName: `${r.student.lastName} ${r.student.firstName}`,
    groupName: r.lessonSession.group.name,
    subjectName: r.lessonSession.group.subject ?? "",
    roomName: r.lessonSession.group.roomName,
    status: ATTENDANCE_STATUS_LABEL_UZ[r.status] ?? r.status,
    note: r.note ?? "",
    lessonValue: formatUZS(Number(r.lessonValueSnapshot)),
    teacherEarning: formatUZS(Number(r.teacherEarningAmount)),
  }));
}
