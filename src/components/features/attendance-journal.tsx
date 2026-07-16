"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Check,
  X as XIcon,
  Clock,
  Minus,
  MessageSquareText,
  RefreshCw,
  CalendarX2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatUZS } from "@/lib/utils";
import { markAttendance, getGroupAttendanceJournal } from "@/app/actions/attendance";
import { regenerateGroupSessions } from "@/app/actions/schedule";

type AttendanceStatus = "PRESENT" | "EXCUSED_ABSENT" | "UNEXCUSED_ABSENT" | "LATE";

interface Mark {
  status: AttendanceStatus;
  note: string | null;
  arrivalTime?: string | null;
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

// Hardcoded Uzbek weekday/month names instead of Intl.DateTimeFormat("uz-UZ", ...):
// some server/browser runtimes only ship English ("small-icu") locale data, which
// silently falls back to garbled output like "WE"/"SU" or "M07" instead of proper
// Uzbek names — hardcoding removes any dependency on the runtime's locale data.
const UZ_WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Cho", "Pa", "Ju", "Sha"]; // index 0 = Sunday, matches Date#getDay()
const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

function monthLabel(date: Date) {
  return `${UZ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function dayNumber(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getDate();
}

function weekdayShort(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return UZ_WEEKDAYS_SHORT[d.getDay()];
}

function currentTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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
  initialHasScheduleSlots,
}: {
  groupId: string;
  initialMonth: string; // "2026-07"
  initialStudents: JournalStudent[];
  initialSessions: JournalSession[];
  initialHasScheduleSlots: boolean;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [students] = useState(initialStudents);
  const [sessions, setSessions] = useState(initialSessions);
  const [hasScheduleSlots, setHasScheduleSlots] = useState(initialHasScheduleSlots);
  const [pending, startTransition] = useTransition();
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [lateDialog, setLateDialog] = useState<{ sessionId: string; studentId: string; time: string } | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ sessionId: string; studentId: string; note: string } | null>(null);

  const monthDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [month]);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await regenerateGroupSessions(groupId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.created > 0) {
        toast.success(`${res.created} ta dars kuni yaratildi.`);
      } else {
        toast.success("Dars kunlari allaqachon yaratilgan — hech narsa o'zgarmadi.");
      }
      const data = await getGroupAttendanceJournal(groupId, monthDate.getFullYear(), monthDate.getMonth() + 1);
      setSessions(data.sessions);
      setHasScheduleSlots(data.hasScheduleSlots);
    } catch {
      toast.error("Xatolik yuz berdi. Qaytadan urinib ko'ring.");
    } finally {
      setRegenerating(false);
    }
  }

  // Guards against a stale, slower response overwriting a faster, more
  // recent one when the teacher clicks the month arrows in quick succession
  // (e.g. next-next-prev before the first fetch has resolved) — without
  // this, whichever request happens to resolve LAST wins even if it's not
  // the one for the month currently shown, silently showing the wrong
  // month's data under the right month's label.
  const requestSeqRef = useRef(0);

  function shiftMonth(delta: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setMonth(key);
    const year = next.getFullYear();
    const targetMonth = next.getMonth() + 1;
    const seq = ++requestSeqRef.current;
    startTransition(async () => {
      try {
        const data = await getGroupAttendanceJournal(groupId, year, targetMonth);
        if (seq !== requestSeqRef.current) return; // a newer navigation already superseded this one
        setHasScheduleSlots(data.hasScheduleSlots);
        setSessions(data.sessions);
      } catch {
        if (seq !== requestSeqRef.current) return;
        toast.error("Oyni yuklab bo'lmadi. Qaytadan urinib ko'ring.");
      }
    });
  }

  async function handleMark(
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
    arrivalTime?: string,
    note?: string,
  ) {
    const cellKey = `${sessionId}:${studentId}`;
    setSavingCell(cellKey);
    let res;
    try {
      res = await markAttendance({ lessonSessionId: sessionId, studentId, status, arrivalTime, note });
    } catch {
      // Defense in depth: the server action itself now catches DB errors and
      // returns { ok: false }, but if something still throws (network drop,
      // serverless cold-start timeout, etc.) we must not let it become an
      // unhandled rejection — show a toast and keep the grid as-is instead
      // of it silently breaking.
      setSavingCell(null);
      toast.error("Saqlanmadi — internet aloqasini tekshirib, qaytadan urinib ko'ring.");
      return;
    }
    setSavingCell(null);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
      return;
    }
    // Marking one cell can shift the consecutive-miss streak and therefore
    // the teacherEarningAmount of OTHER sessions for this student too (a run
    // of 3+ consecutive misses zeroes the WHOLE run retroactively). We used
    // to handle that by immediately re-fetching the whole month from the
    // server — but that fresh read occasionally raced with this very write's
    // commit becoming visible on Neon's pooled serverless connections,
    // coming back with fewer (sometimes zero) sessions and making the whole
    // grid appear to "jump" to an empty state right after a successful mark.
    // The server now returns the authoritative recomputed earnings for every
    // one of this student's lessons directly in `res`, so we patch the grid
    // from that response instead of trusting a brand new read.
    const earningsBySession = new Map(res.updatedEarnings.map((e) => [e.lessonSessionId, e.teacherEarningAmount]));
    setSessions((prev) =>
      prev.map((s) => {
        const newEarning = earningsBySession.get(s.id);
        if (s.id === sessionId) {
          return {
            ...s,
            marks: {
              ...s.marks,
              [studentId]: {
                status: res.mark.status,
                note: res.mark.note,
                arrivalTime: res.mark.arrivalTime,
                teacherEarningAmount: newEarning ?? 0,
              },
            },
          };
        }
        if (newEarning !== undefined && s.marks[studentId]) {
          return {
            ...s,
            marks: { ...s.marks, [studentId]: { ...s.marks[studentId], teacherEarningAmount: newEarning } },
          };
        }
        return s;
      }),
    );
  }

  function onStatusPick(sessionId: string, studentId: string, status: AttendanceStatus) {
    if (status === "LATE") {
      const existing = sessions.find((s) => s.id === sessionId)?.marks[studentId];
      const session = sessions.find((s) => s.id === sessionId);
      setLateDialog({
        sessionId,
        studentId,
        time: existing?.arrivalTime || session?.startTime || currentTimeHHMM(),
      });
      return;
    }
    if (status === "EXCUSED_ABSENT") {
      // Sababli kelmadi: teacher may optionally jot down why, purely as
      // their own note — never required, can be left blank.
      const existing = sessions.find((s) => s.id === sessionId)?.marks[studentId];
      setNoteDialog({ sessionId, studentId, note: existing?.note ?? "" });
      return;
    }
    // Sababsiz kelmadi (and Keldi) never carry a note — mark immediately.
    handleMark(sessionId, studentId, status);
  }

  function confirmLateMark() {
    if (!lateDialog) return;
    handleMark(lateDialog.sessionId, lateDialog.studentId, "LATE", lateDialog.time);
    setLateDialog(null);
  }

  function confirmNoteMark() {
    if (!noteDialog) return;
    handleMark(noteDialog.sessionId, noteDialog.studentId, "EXCUSED_ABSENT", undefined, noteDialog.note.trim() || undefined);
    setNoteDialog(null);
  }

  const groupTotal = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;
    let earned = 0;
    for (const s of sessions) {
      for (const studentId of Object.keys(s.marks)) {
        const mark = s.marks[studentId];
        if (mark.status === "PRESENT") present += 1;
        if (mark.status === "LATE") late += 1;
        if (mark.status === "EXCUSED_ABSENT") excused += 1;
        if (mark.status === "UNEXCUSED_ABSENT") unexcused += 1;
        earned += mark.teacherEarningAmount;
      }
    }
    return { present, late, excused, unexcused, earned };
  }, [sessions]);

  function studentSummary(studentId: string) {
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;
    let earned = 0;
    const notes: { day: number; note: string; sessionId: string }[] = [];
    for (const s of sessions) {
      const mark = s.marks[studentId];
      if (!mark) continue;
      if (mark.status === "PRESENT") present += 1;
      if (mark.status === "LATE") late += 1;
      if (mark.status === "EXCUSED_ABSENT") excused += 1;
      if (mark.status === "UNEXCUSED_ABSENT") unexcused += 1;
      earned += mark.teacherEarningAmount;
      if (mark.note) notes.push({ day: dayNumber(s.date), note: mark.note, sessionId: s.id });
    }
    return { present, late, excused, unexcused, earned, notes };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} disabled={pending} aria-label="Oldingi oy">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{monthLabel(monthDate)}</span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} disabled={pending} aria-label="Keyingi oy">
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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <CalendarX2 className="h-6 w-6" />
          {!hasScheduleSlots ? (
            <>
              <p className="max-w-md">
                Bu guruh uchun haftalik dars jadvali (qaysi kunlari, soat nechada dars bo&apos;lishi) hali
                belgilanmagan — shuning uchun dars kunlari avtomatik yaratilmayapti.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/groups">Guruhni tahrirlab, jadvalni belgilash</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="max-w-md">Bu oyda dars kunlari topilmadi.</p>
              <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
                {regenerating ? "Tekshirilmoqda..." : "Qayta tekshirish"}
              </Button>
            </>
          )}
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
                    <div className="text-[9px] font-normal leading-none text-muted-foreground">{s.startTime}</div>
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
                        <PopoverContent align="start" className="max-w-72 text-sm">
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
                          {summary.notes.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-border pt-2">
                              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                <MessageSquareText className="h-3.5 w-3.5" /> Izohlar
                              </p>
                              {summary.notes.map((n) => (
                                <div key={n.sessionId} className="flex items-start justify-between gap-1.5 text-xs text-muted-foreground">
                                  <p>
                                    <span className="font-medium text-foreground">
                                      {n.day}-{UZ_MONTHS[monthDate.getMonth()]}:
                                    </span>{" "}
                                    {n.note}
                                  </p>
                                  {/* This is the one persistent, discoverable place a teacher
                                      can come back to view AND edit a note they left earlier —
                                      without having to remember or re-find the exact day's cell
                                      in the grid above. */}
                                  <button
                                    type="button"
                                    className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                                    aria-label="Izohni tahrirlash"
                                    onClick={() => setNoteDialog({ sessionId: n.sessionId, studentId: student.id, note: n.note })}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
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
                      const tooltipParts = [mark ? STATUS_CONFIG[mark.status].label : null];
                      if (mark?.status === "LATE" && mark.arrivalTime) tooltipParts.push(`Vaqt: ${mark.arrivalTime}`);
                      if (mark?.note) tooltipParts.push(`Izoh: ${mark.note}`);
                      const tooltip = tooltipParts.filter(Boolean).join(" · ") || undefined;
                      return (
                        <td key={s.id} className="px-1 py-2 text-center">
                          <div className="relative mx-auto w-fit">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  disabled={savingCell === cellKey}
                                  title={tooltip}
                                  className={cn(
                                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
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
                                    <DropdownMenuItem key={status} onClick={() => onStatusPick(s.id, student.id, status)}>
                                      <Icon className="mr-2 h-4 w-4" /> {cfg.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {mark?.note && (
                              // Its own independent button (not just a `title` tooltip, which
                              // never works on touch devices) — pressing this directly opens
                              // the note for viewing/editing without going through the
                              // status dropdown at all. stopPropagation keeps this press from
                              // also toggling the dropdown trigger underneath it.
                              <button
                                type="button"
                                aria-label="Izohni ko'rish"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNoteDialog({ sessionId: s.id, studentId: student.id, note: mark.note ?? "" });
                                }}
                                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-1 ring-border hover:ring-primary"
                              >
                                <MessageSquareText className="h-2 w-2 text-foreground/70" />
                              </button>
                            )}
                          </div>
                          {mark?.status === "LATE" && mark.arrivalTime && (
                            <div className="mx-auto mt-0.5 w-fit rounded bg-amber-500/15 px-1 text-[9px] font-medium leading-tight text-amber-600 dark:text-amber-400">
                              {mark.arrivalTime}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-medium">{formatUZS(summary.earned)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50 font-medium">
                <td className="sticky left-0 z-10 border-r border-border bg-muted/50 px-3 py-2">
                  Guruh bo&apos;yicha jami
                </td>
                <td colSpan={sessions.length} className="px-3 py-2 text-xs text-muted-foreground">
                  Keldi: <strong className="text-foreground">{groupTotal.present}</strong> · Kechikdi:{" "}
                  <strong className="text-foreground">{groupTotal.late}</strong> · Sababli:{" "}
                  <strong className="text-foreground">{groupTotal.excused}</strong> · Sababsiz:{" "}
                  <strong className="text-foreground">{groupTotal.unexcused}</strong>
                </td>
                <td className="px-3 py-2 text-right">{formatUZS(groupTotal.earned)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={!!lateDialog} onOpenChange={(open) => !open && setLateDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Kelgan vaqtini kiriting</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Aynan qaysi vaqtda keldi</Label>
            <Input
              type="time"
              value={lateDialog?.time ?? ""}
              onChange={(e) => setLateDialog((prev) => (prev ? { ...prev, time: e.target.value } : prev))}
            />
          </div>
          <DialogFooter>
            <Button onClick={confirmLateMark}>Tasdiqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteDialog} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sababli kelmadi</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Izoh (ixtiyoriy, faqat o&apos;zingiz uchun)</Label>
            <Textarea
              value={noteDialog?.note ?? ""}
              onChange={(e) => setNoteDialog((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
              placeholder="Masalan: kasal, oilaviy sabab..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button onClick={confirmNoteMark}>Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
