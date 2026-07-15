import { formatDate, formatUZS } from "@/lib/utils";
import { ATTENDANCE_STATUS_LABEL_UZ } from "./fields";
import type { Attendance, Student, LessonSession, Group, Course } from "@prisma/client";

type FullAttendanceRow = Attendance & {
  student: Student;
  lessonSession: LessonSession & {
    group: Group & { course: Course };
  };
};

export interface ReportRow {
  date: string;
  studentName: string;
  groupName: string;
  courseName: string;
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
    courseName: r.lessonSession.group.course.name,
    roomName: r.lessonSession.group.roomName,
    status: ATTENDANCE_STATUS_LABEL_UZ[r.status] ?? r.status,
    note: r.note ?? "",
    lessonValue: formatUZS(Number(r.lessonValueSnapshot)),
    teacherEarning: formatUZS(Number(r.teacherEarningAmount)),
  }));
}
