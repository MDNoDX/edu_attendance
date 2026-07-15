"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, AlertTriangle, Volume2, VolumeX, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getNotificationAgenda, type NotificationAgenda } from "@/app/actions/notifications";

const POLL_INTERVAL_MS = 60_000;
const SOUND_PREF_KEY = "nadiredu.notif.sound";
const NOTIFIED_KEY_PREFIX = "nadiredu.notif.seen.";

/**
 * Browsers only let a page play audio after a real user gesture (click,
 * keypress, tap) has unlocked the page's audio — an AudioContext created
 * from a `setInterval` poll (no gesture in the call stack) starts in
 * "suspended" state and never actually produces sound, even though no
 * error is thrown. The previous implementation created a brand new
 * AudioContext on every chime attempt, which meant it silently never
 * unlocked. This module instead keeps ONE shared context, resumes it the
 * moment any real user gesture happens anywhere on the page, and reuses
 * that already-unlocked context for every later timer-triggered chime.
 */
let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function unlockAudioOnce() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/** Two short ascending beeps via Web Audio — no audio asset needed, works offline. */
function playChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // If the shared context is still suspended (no gesture has unlocked it
    // yet this session), attempt a resume anyway — harmless if it fails.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.14);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.24);
    });
  } catch {
    // Web Audio unavailable — fail silently, it's a non-critical enhancement.
  }
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function NotificationCenter() {
  const [agenda, setAgenda] = useState<NotificationAgenda | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [open, setOpen] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const stored = window.localStorage.getItem(SOUND_PREF_KEY);
    if (stored !== null) setSoundOn(stored === "1");
    const today = new Date().toISOString().slice(0, 10);
    const seen = window.localStorage.getItem(NOTIFIED_KEY_PREFIX + today);
    if (seen) notifiedRef.current = new Set(JSON.parse(seen));
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    // Unlock audio playback on the very first real user interaction with the
    // page (click/keypress/touch) so later timer-triggered chimes can
    // actually be heard — see the comment above playChime().
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    const unlock = () => {
      unlockAudioOnce();
      events.forEach((evt) => window.removeEventListener(evt, unlock));
    };
    events.forEach((evt) => window.addEventListener(evt, unlock, { once: true }));
    return () => events.forEach((evt) => window.removeEventListener(evt, unlock));
  }, []);

  function persistNotified() {
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(NOTIFIED_KEY_PREFIX + today, JSON.stringify(Array.from(notifiedRef.current)));
  }

  const fireDueLessonAlerts = useCallback(
    (data: NotificationAgenda) => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let firedAny = false;

      for (const lesson of data.todayLessons) {
        const startMinutes = timeToMinutes(lesson.startTime);
        const diff = startMinutes - nowMinutes;
        const isDueSoon = diff <= 15 && diff >= -30;
        const key = `lesson:${lesson.id}`;
        if (isDueSoon && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          firedAny = true;
          if (soundOn) playChime();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`Dars boshlanmoqda: ${lesson.groupName}`, {
              body: `${lesson.startTime}–${lesson.endTime} · ${lesson.roomName}. Davomatni belgilashni unutmang.`,
              icon: "/logo.svg",
              tag: key,
            });
          }
        }
      }

      for (const student of data.atRiskStudents) {
        const key = `risk:${student.id}:${student.consecutiveMisses}`;
        if (!notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          firedAny = true;
          if (soundOn) playChime();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`${student.fullName} — ulush xavfi`, {
              body: `${student.groupName}: ketma-ket ${student.consecutiveMisses}-marta kelmadi. Yana bir marta kelmasa ulush hisoblanmaydi.`,
              icon: "/logo.svg",
              tag: key,
            });
          }
        }
      }

      if (firedAny) persistNotified();
    },
    [soundOn],
  );

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const data = await getNotificationAgenda();
      if (cancelled) return;
      setAgenda(data);
      fireDueLessonAlerts(data);
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fireDueLessonAlerts]);

  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev;
      window.localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      // This click is itself a user gesture, so it's a reliable place to
      // unlock audio and immediately confirm to the teacher that sound
      // actually works, rather than them finding out only later.
      if (next) {
        unlockAudioOnce();
        playChime();
      }
      return next;
    });
  }

  const unmarkedCount = (agenda?.todayLessons ?? []).filter((l) => l.markedStudents < l.totalStudents).length;
  const riskCount = agenda?.atRiskStudents.length ?? 0;
  const badgeCount = unmarkedCount + riskCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Bildirishnomalar">
          <Bell className="h-[1.1rem] w-[1.1rem]" />
          {badgeCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Bildirishnomalar</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSound} aria-label="Ovozni yoqish/o'chirish">
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!agenda ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Yuklanmoqda...</p>
          ) : agenda.todayLessons.length === 0 && agenda.atRiskStudents.length === 0 ? (
            <div className="flex flex-col items-center gap-1 p-6 text-center text-xs text-muted-foreground">
              <CheckCircle2 className="h-5 w-5" />
              Bugun hech qanday bildirishnoma yo&apos;q.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {agenda.todayLessons.map((lesson) => {
                const marked = lesson.markedStudents >= lesson.totalStudents && lesson.totalStudents > 0;
                return (
                  <Link
                    key={lesson.id}
                    href={`/dashboard/groups/${lesson.groupId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-3 py-2.5 text-sm hover:bg-accent"
                  >
                    <CalendarClock className={cn("mt-0.5 h-4 w-4 shrink-0", marked ? "text-success" : "text-warning")} />
                    <div className="min-w-0">
                      <p className="font-medium">{lesson.groupName}</p>
                      <p className="text-xs text-muted-foreground">
                        {lesson.startTime}–{lesson.endTime} · {lesson.roomName}
                      </p>
                      <p className={cn("text-xs", marked ? "text-success" : "text-warning")}>
                        {marked
                          ? "Davomat belgilangan"
                          : `Davomat belgilanmagan (${lesson.markedStudents}/${lesson.totalStudents})`}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {agenda.atRiskStudents.map((student) => (
                <Link
                  key={student.id}
                  href={`/dashboard/groups/${student.groupId}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-3 py-2.5 text-sm hover:bg-accent"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="font-medium">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground">{student.groupName}</p>
                    <p className="text-xs text-destructive">
                      Ketma-ket {student.consecutiveMisses}-marta kelmadi — yana kelmasa ulush hisoblanmaydi
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
