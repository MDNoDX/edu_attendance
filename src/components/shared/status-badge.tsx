import { Badge } from "@/components/ui/badge";

const STUDENT_STATUS_UZ: Record<string, { label: string; tone: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Faol", tone: "success" },
  INACTIVE: { label: "Nofaol", tone: "warning" },
  FINISHED: { label: "Tugatgan", tone: "secondary" },
};

const ATTENDANCE_STATUS_UZ: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "secondary" }> = {
  PRESENT: { label: "Keldi", tone: "success" },
  EXCUSED_ABSENT: { label: "Sababli", tone: "warning" },
  UNEXCUSED_ABSENT: { label: "Sababsiz", tone: "destructive" },
  LATE: { label: "Kechikdi", tone: "secondary" },
};

const PAYMENT_STATUS_UZ: Record<string, { label: string; tone: "success" | "warning" | "destructive" }> = {
  PAID: { label: "To'langan", tone: "success" },
  PARTIAL: { label: "Qisman", tone: "warning" },
  UNPAID: { label: "To'lanmagan", tone: "destructive" },
};

const ROOM_STATUS_UZ: Record<string, { label: string; tone: "success" | "destructive" }> = {
  FREE: { label: "Bo'sh", tone: "success" },
  BUSY: { label: "Band", tone: "destructive" },
};

export function StudentStatusBadge({ status }: { status: string }) {
  const s = STUDENT_STATUS_UZ[status] ?? { label: status, tone: "secondary" as const };
  return <Badge variant={s.tone}>{s.label}</Badge>;
}

export function AttendanceStatusBadge({ status }: { status: string }) {
  const s = ATTENDANCE_STATUS_UZ[status] ?? { label: status, tone: "secondary" as const };
  return <Badge variant={s.tone}>{s.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS_UZ[status] ?? { label: status, tone: "warning" as const };
  return <Badge variant={s.tone}>{s.label}</Badge>;
}

export function RoomStatusBadge({ status }: { status: string }) {
  const s = ROOM_STATUS_UZ[status] ?? { label: status, tone: "success" as const };
  return <Badge variant={s.tone}>{s.label}</Badge>;
}
