"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock, Check, X as XIcon, Clock, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatUZS } from "@/lib/utils";
import { markAttendance, getGroupAttendanceJournal } from "@/app/actions/attendance";

type AttendanceStatus = "PRESENT" | "EXCUSED_ABSENT" | "UNEXCUSED_ABSENT" | "LATE";

interface Mark {
  status: AttendanceStatus;
  note: string | null;
  teacherEarningAmount: number;
}

interface JournalSession {
  id: string;
  date: string | Date;
  startTime: string;
  endTime: string;
  isFuture: boolean;
  marks: Record<string, Mark>;
}

interface JournalStudent {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: typeof Check; className: string }
> = {
  PRESENT: { label: "Keldi", icon: Check, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  LATE: { label: "Kechikdi", icon: Clock, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  EXCUSED_ABSENT: { label: "Sababli kelmadi", icon: Minus, className: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  UNEXCUSED_ABSENT: { label: "Sababsiz kelmadi", icon: XIcon, className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "LATE", "EXCUSED_ABSENT", "UNEXCUSED_ABSENT"];

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("uz-UZ", { month: "long", year: "numeric" }).format(date);
}

function dayNumber(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getDate();
}

function weekdayShort(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("uz-UZ", { weekday: "short" }).format(d).slice(0, 2);
}

/**
 * Students x lesson-dates grid for one group, one calendar month. This is
 * the teacher's primary daily tool: click any past/today cell to mark
 * attendance, future cells are locked. Each student's name opens a popover
 * with their running balance for the month (present/absent/late counts and
 * the teacher's own earnings for that student under the consecutive-miss
 * cutoff rule).
 */
export function AttendanceJournal({
  groupId,
  initialMonth,
  initialStudents,
  initialSessions,
}: {
  groupId: string;
  initialMonth: string; // "2026-07"
  initialStudents: JournalStudent[];
  initialSessions: JournalSession[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [students] = useState(initialStudents);
  const [sessions, setSessions] = useState(initialSessions);
  const [pending, startTransition] = useTransition();
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const monthDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [month]);

  function shiftMonth(delta: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setMonth(key);
    startTransition(async () => {
      const data = await getGroupAttendanceJournal(groupId, next);
      setSessions(data.sessions);
    });
  }

  async function handleMark(sessionId: string, studentId: string, status: AttendanceStatus) {
    const cellKey = `${sessionId}:${studentId}`;
    setSavingCell(cellKey);
    const res = await markAttendance({ lessonSessionId: sessionId, studentId, status });
    setSavingCell(null);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
      return;
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, marks: { ...s.marks, [studentId]: { status, note: null, teacherEarningAmount: 0 } } }
          : s,
      ),
    );
  }

  function studentSummary(studentId: string) {
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;
    let earned = 0;
    for (const s of sessions) {
      const mark = s.marks[studentId];
      if (!mark) continue;
      if (mark.status === "PRESENT") present += 1;
      if (mark.status === "LATE") late += 1;
      if (mark.status === "EXCUSED_ABSENT") excused += 1;
      if (mark.status === "UNEXCUSED_ABSENT") unexcused += 1;
      earned += mark.teacherEarningAmount;
    }
    return { present, late, excused, unexcused, earned };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} disabled={pending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{monthLabel(monthDate)}</span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} disabled={pending}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {STATUS_OPTIONS.map((status) => {
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            return (
              <span key={status} className="flex items-center gap-1">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded", cfg.className)}>
                  <Icon className="h-3 w-3" />
                </span>
                {cfg.label}
              </span>
            );
          })}
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Bu guruhda hali studentlar yo&apos;q.
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Bu oyda dars kunlari topilmadi.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="sticky left-0 z-10 min-w-48 border-r border-border bg-muted/40 px-3 py-2 text-left font-medium">
                  O&apos;quvchi
                </th>
                {sessions.map((s) => (
                  <th key={s.id} className="min-w-14 px-1 py-2 text-center font-medium">
                    <div className="text-[10px] uppercase text-muted-foreground">{weekdayShort(s.date)}</div>
                    <div>{dayNumber(s.date)}</div>
                  </th>
                ))}
                <th className="min-w-28 px-3 py-2 text-right font-medium">Ulushim</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, rowIndex) => {
                const summary = studentSummary(student.id);
                return (
                  <tr key={student.id} className={cn(rowIndex % 2 === 1 && "bg-muted/20")}>
                    <td className="sticky left-0 z-10 border-r border-border bg-inherit px-3 py-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-left font-medium hover:underline">
                            {student.lastName} {student.firstName}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="text-sm">
                          <p className="mb-2 font-medium">{student.lastName} {student.firstName}</p>
                          <div className="space-y-1 text-muted-foreground">
                            <p>Keldi: <strong className="text-foreground">{summary.present}</strong></p>
                            <p>Kechikdi: <strong className="text-foreground">{summary.late}</strong></p>
                            <p>Sababli kelmadi: <strong className="text-foreground">{summary.excused}</strong></p>
                            <p>Sababsiz kelmadi: <strong className="text-foreground">{summary.unexcused}</strong></p>
                            <p className="pt-1 text-foreground">
                              Bu oy ulushim: <strong>{formatUZS(summary.earned)}</strong>
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                    {sessions.map((s) => {
                      const mark = s.marks[student.id];
                      const cellKey = `${s.id}:${student.id}`;
                      if (s.isFuture) {
                        return (
                          <td key={s.id} className="px-1 py-2 text-center text-muted-foreground/40">
                            <Lock className="mx-auto h-3.5 w-3.5" />
                          </td>
                        );
                      }
                      return (
                        <td key={s.id} className="px-1 py-2 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                disabled={savingCell === cellKey}
                                className={cn(
                                  "mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                                  mark ? STATUS_CONFIG[mark.status].className : "bg-muted text-muted-foreground/50 hover:bg-accent",
                                )}
                              >
                                {mark ? (
                                  (() => {
                                    const Icon = STATUS_CONFIG[mark.status].icon;
                                    return <Icon className="h-3.5 w-3.5" />;
                                  })()
                                ) : (
                                  <span className="text-xs">·</span>
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                              {STATUS_OPTIONS.map((status) => {
                                const cfg = STATUS_CONFIG[status];
                                const Icon = cfg.icon;
                                return (
                                  <DropdownMenuItem key={status} onClick={() => handleMark(s.id, student.id, status)}>
                                    <Icon className="mr-2 h-4 w-4" /> {cfg.label}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-medium">{formatUZS(summary.earned)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
