"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getScheduleSessions } from "@/app/actions/schedule";
import { formatDate } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly";

interface SessionRow {
  id: string;
  date: string | Date;
  startTime: string;
  endTime: string;
  group: { name: string; roomName: string; subject: string | null; _count: { students: number } };
}

function rangeFor(period: Period, ref: Date) {
  const from = new Date(ref);
  const to = new Date(ref);
  if (period === "daily") {
    // same day
  } else if (period === "weekly") {
    const day = (from.getDay() + 6) % 7; // Monday-start
    from.setDate(from.getDate() - day);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 6);
  } else {
    from.setDate(1);
    to.setMonth(to.getMonth() + 1, 0);
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function ScheduleView({ initialSessions }: { initialSessions: SessionRow[] }) {
  const [period, setPeriod] = useState<Period>("daily");
  const [refDate, setRefDate] = useState(new Date());
  const [sessions, setSessions] = useState(initialSessions);
  const [isPending, startTransition] = useTransition();

  function shift(days: number) {
    const next = new Date(refDate);
    next.setDate(next.getDate() + days);
    setRefDate(next);
    reload(period, next);
  }

  function reload(p: Period, ref: Date) {
    const { from, to } = rangeFor(p, ref);
    startTransition(async () => {
      const res = await getScheduleSessions({ from, to });
      setSessions(res as never);
    });
  }

  function changePeriod(p: Period) {
    setPeriod(p);
    reload(p, refDate);
  }

  const stepDays = period === "daily" ? 1 : period === "weekly" ? 7 : 30;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={period} onValueChange={(v) => changePeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="daily">Kunlik</TabsTrigger>
            <TabsTrigger value="weekly">Haftalik</TabsTrigger>
            <TabsTrigger value="monthly">Oylik</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-stepDays)} aria-label="Oldingi davr">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-medium">{formatDate(refDate)}</span>
          <Button variant="outline" size="icon" onClick={() => shift(stepDays)} aria-label="Keyingi davr">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Darslar topilmadi" description="Tanlangan davrda dars mavjud emas." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sana</TableHead>
              <TableHead>Vaqt</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Fan</TableHead>
              <TableHead>Xona</TableHead>
              <TableHead>Studentlar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{formatDate(s.date)}</TableCell>
                <TableCell>
                  {s.startTime} - {s.endTime}
                </TableCell>
                <TableCell className="font-medium">{s.group.name}</TableCell>
                <TableCell>{s.group.subject || "—"}</TableCell>
                <TableCell>{s.group.roomName}</TableCell>
                <TableCell>{s.group._count.students}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {isPending && <p className="text-xs text-muted-foreground">Yuklanmoqda...</p>}
    </div>
  );
}
