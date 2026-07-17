"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FileText,
  FileSpreadsheet,
  Loader2,
  Wallet,
  Check,
  EyeOff,
  Eye,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  ArrowUpRight,
  MessageSquareText,
  Clock,
  Minus,
  X as XIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { FadeInStagger, FadeInItem } from "@/components/shared/motion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportAnalytics, type ReportAnalytics } from "@/app/actions/reports";
import { ATTENDANCE_REPORT_FIELDS } from "@/lib/reports/fields";
import { Checkbox } from "@/components/ui/checkbox";
import { formatUZS, formatDate, cn } from "@/lib/utils";

interface GroupOption {
  id: string;
  name: string;
}
interface StudentOption {
  id: string;
  fullName: string;
  groupId: string;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Triggers a real file download via fetch+blob so a failed export shows a toast instead of silently downloading a broken/empty file. */
async function downloadReport(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Hisobotni yuklab bo'lmadi.");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function ReportDashboard({
  initialAnalytics,
  groups,
  students,
  /**
   * When set, this report is permanently scoped to one group — used from
   * that group's own "Hisobot" tab (src/app/dashboard/groups/[groupId]/page.tsx).
   * The "Ko'rsatish" scope picker is hidden entirely (there's nothing to
   * choose — every number on this view is already this one group's own),
   * rather than just pre-selecting it, since a picker with a single
   * meaningful option is just clutter.
   */
  lockGroupId,
}: {
  initialAnalytics: ReportAnalytics;
  groups: GroupOption[];
  students: StudentOption[];
  lockGroupId?: string;
}) {
  const [from, setFrom] = useState(toDateInputValue(startOfCurrentMonth()));
  const [to, setTo] = useState(toDateInputValue(new Date()));
  const [scope, setScope] = useState<"all" | string>(lockGroupId ? `group:${lockGroupId}` : "all"); // "all" | `group:<id>` | `student:<id>`
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(
    ATTENDANCE_REPORT_FIELDS.filter((f) => f.defaultSelected).map((f) => f.key),
  );
  // "Narxlarni yashirish" — lets the teacher black out every money figure on
  // screen before sharing their own screen with a student/parent, without
  // having to leave the report page. Purely a display toggle: exports always
  // include real figures regardless of this switch.
  const [pricesHidden, setPricesHidden] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  // Export used to be a big always-open card (checkboxes + buttons) sitting
  // between the headline cards and the period stats — collapsed by default
  // now so the primary view is just the numbers a teacher actually looks at
  // day to day; exporting is an occasional action, not something that needs
  // permanent screen real estate.
  const [exportOpen, setExportOpen] = useState(false);
  // Per-student breakdown behind whichever headline card / period-stat box
  // was clicked — every one of those numbers is just a sum over
  // analytics.students, so a single generic dialog can explain any of them
  // instead of building a bespoke drill-down for each.
  const [detailDialog, setDetailDialog] = useState<{
    kind: DetailKind;
    title: string;
    description: string;
    rows: { label: string; sub: string; value: string; groupId: string; notes?: string[] }[];
    total: string;
  } | null>(null);

  function money(n: number) {
    return pricesHidden ? "•••••" : formatUZS(n);
  }

  type DetailKind =
    | "gross"
    | "expected"
    | "earnedMonth"
    | "present"
    | "late"
    | "excused"
    | "unexcused"
    | "earnedRange"
    | "lost";

  function openDetail(kind: DetailKind) {
    const configs: Record<
      DetailKind,
      { title: string; description: string; pick: (s: ReportAnalytics["students"][number]) => number; isMoney: boolean }
    > = {
      gross: {
        title: "O'quvchilar to'lovi — kimlardan tashkil topgani",
        description: "Har bir studentning o'zi to'laydigan oylik tuition narxi.",
        pick: (s) => s.monthlyPrice,
        isMoney: true,
      },
      expected: {
        title: "Oylik kutilayotgan summa — hisoblash",
        description: "Har bir student uchun: dars ulushi x shu oydagi haqiqiy dars kunlari soni.",
        pick: (s) => s.expectedThisMonth,
        isMoney: true,
      },
      earnedMonth: {
        title: "Amalda olingan ulush (shu oy) — kimdan qancha",
        description: "Oy boshidan bugungacha, real davomat asosida har bir studentdan olingan ulush.",
        pick: (s) => s.earnedMonthToDate,
        isMoney: true,
      },
      present: {
        title: "Keldi — studentlar bo'yicha",
        description: `${formatDate(analytics.from)} — ${formatDate(analytics.to)} davrida.`,
        pick: (s) => s.present,
        isMoney: false,
      },
      late: {
        title: "Kechikdi — studentlar bo'yicha",
        description: `${formatDate(analytics.from)} — ${formatDate(analytics.to)} davrida.`,
        pick: (s) => s.late,
        isMoney: false,
      },
      excused: {
        title: "Sababli kelmadi — studentlar bo'yicha",
        description: `${formatDate(analytics.from)} — ${formatDate(analytics.to)} davrida.`,
        pick: (s) => s.excusedAbsent,
        isMoney: false,
      },
      unexcused: {
        title: "Sababsiz kelmadi — studentlar bo'yicha",
        description: `${formatDate(analytics.from)} — ${formatDate(analytics.to)} davrida.`,
        pick: (s) => s.unexcusedAbsent,
        isMoney: false,
      },
      earnedRange: {
        title: "Davr ichida ulushim — studentlar bo'yicha",
        description: `${formatDate(analytics.from)} — ${formatDate(analytics.to)} davrida haqiqiy davomat asosida.`,
        pick: (s) => s.earnedInRange,
        isMoney: true,
      },
      lost: {
        // No longer "(uzr)" — the underlying figure covers BOTH excused and
        // unexcused absences past the consecutive-miss cutoff, so labeling
        // it as excused-only was misleading about what's actually included.
        title: "Yo'qotilgan — studentlar bo'yicha",
        description: "Ketma-ket 3+ kelmagan holatlar sababli to'lanmagan summa. Har bir student — aynan o'sha guruhga o'tish uchun bosing.",
        pick: (s) => s.lostToCutoff,
        isMoney: true,
      },
    };

    const cfg = configs[kind];
    const rows = analytics.students
      .map((s) => ({
        label: s.fullName,
        sub: s.groupName,
        groupId: s.groupId,
        raw: cfg.pick(s),
        // Only relevant for "Sababli kelmadi" — the whole point of this kind's
        // drill-down is surfacing WHY, not just how many, so each student's
        // actual excuse notes ride along with their row.
        notes: kind === "excused" ? s.excusedNotes.map((n) => `${formatDate(n.date)}: ${n.note}`) : undefined,
      }))
      .filter((r) => r.raw !== 0)
      .sort((a, b) => b.raw - a.raw)
      .map((r) => ({
        label: r.label,
        sub: r.sub,
        groupId: r.groupId,
        notes: r.notes,
        value: cfg.isMoney ? money(r.raw) : String(r.raw),
      }));
    const totalRaw = analytics.students.reduce((sum, s) => sum + cfg.pick(s), 0);

    setDetailDialog({
      kind,
      title: cfg.title,
      description: cfg.description,
      rows,
      total: cfg.isMoney ? money(totalRaw) : String(totalRaw),
    });
  }

  const scopeOptions = useMemo(
    () => [
      { value: "all", label: "Barcha guruhlar" },
      ...groups.map((g) => ({ value: `group:${g.id}`, label: g.name })),
      ...students.map((s) => ({ value: `student:${s.id}`, label: `${s.fullName} (student)` })),
    ],
    [groups, students],
  );

  function refetch(nextFrom: string, nextTo: string, nextScope: string) {
    startTransition(async () => {
      const groupId = nextScope.startsWith("group:") ? nextScope.slice(6) : undefined;
      const studentId = nextScope.startsWith("student:") ? nextScope.slice(8) : undefined;
      const data = await getReportAnalytics({
        from: new Date(nextFrom),
        to: new Date(nextTo),
        groupId,
        studentId,
      });
      setAnalytics(data);
    });
  }

  function onFromChange(v: string) {
    setFrom(v);
    refetch(v, to, scope);
  }
  function onToChange(v: string) {
    setTo(v);
    refetch(from, v, scope);
  }
  function onScopeChange(v: string) {
    setScope(v);
    refetch(from, to, v);
  }

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function buildExportUrl(format: "pdf" | "xlsx") {
    const params = new URLSearchParams({ format, from, to, fields: selectedFields.join(",") });
    if (scope.startsWith("group:")) params.set("groupId", scope.slice(6));
    if (scope.startsWith("student:")) params.set("studentId", scope.slice(8));
    return `/api/reports/teacher?${params.toString()}`;
  }

  async function handleExport(format: "pdf" | "xlsx") {
    if (selectedFields.length === 0) {
      toast.error("Kamida bitta ustun tanlang.");
      return;
    }
    setExporting(format);
    try {
      await downloadReport(buildExportUrl(format), `hisobot-${from}_${to}.${format === "xlsx" ? "xlsx" : "pdf"}`);
      toast.success("Hisobot yuklandi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi.");
    } finally {
      setExporting(null);
    }
  }

  const studentsByGroup = useMemo(() => {
    const map = new Map<string, ReportAnalytics["students"]>();
    for (const s of analytics.students) {
      const list = map.get(s.groupId) ?? [];
      list.push(s);
      map.set(s.groupId, list);
    }
    return map;
  }, [analytics.students]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 rounded-lg border border-border bg-card px-3 py-2">
        {pricesHidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        <Label htmlFor="hide-prices" className="cursor-pointer text-sm">
          Narxlarni yashirish
        </Label>
        <Switch id="hide-prices" checked={pricesHidden} onCheckedChange={setPricesHidden} />
      </div>

      <Card>
        <CardContent className={cn("grid gap-4 p-5", lockGroupId ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          <div className="space-y-2">
            <Label>Sanadan</Label>
            <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Sanagacha</Label>
            <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
          </div>
          {!lockGroupId && (
            <div className="space-y-2">
              <Label>Ko&apos;rsatish</Label>
              <Select value={scope} onValueChange={onScopeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The three headline figures are deliberately always visible and never
          tied to the ad-hoc from/to filter above (that filter only affects
          "Davr ichida ulushim" further down, plus the export) — these three
          answer three fixed, always-relevant questions: what the students
          owe in total, what the teacher's own ceiling is THIS month given
          each group's real weekly schedule, and what's actually been earned
          so far this month. See the doc comment on getReportAnalytics(). */}
      <FadeInStagger
        key={`${String(analytics.from)}-${String(analytics.to)}-${scope}`}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <FadeInItem>
          <StatCard
            label="O'quvchilar to'lovi (jami)"
            value={money(analytics.totalGrossRevenue)}
            icon={Wallet}
            tone="info"
            hint="Bu o'quvchilarning oylik to'lovi — sizning ulushingiz emas"
            onClick={() => openDetail("gross")}
          />
        </FadeInItem>
        <FadeInItem>
          <StatCard
            label="Oylik kutilayotgan summa"
            value={money(analytics.totalExpectedThisMonth)}
            icon={Target}
            tone="violet"
            hint="Shu oy — hamma student to'liq kelsa, ulushingiz"
            onClick={() => openDetail("expected")}
          />
        </FadeInItem>
        <FadeInItem>
          <StatCard
            label="Amalda olingan ulush (shu oy)"
            value={money(analytics.totalEarnedMonthToDate)}
            icon={TrendingUp}
            tone="success"
            hint="Oy boshidan bugungacha, real davomat asosida"
            onClick={() => openDetail("earnedMonth")}
          />
        </FadeInItem>
      </FadeInStagger>

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader
          className="cursor-pointer select-none pb-2"
          role="button"
          tabIndex={0}
          onClick={() => setExportOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExportOpen((v) => !v);
            }
          }}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Excel yoki PDF sifatida yuklab olish
            </span>
            {exportOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        {exportOpen && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Hisobotda ko&apos;rinadigan ustunlar</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-3">
                {ATTENDANCE_REPORT_FIELDS.map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selectedFields.includes(field.key)} onCheckedChange={() => toggleField(field.key)} />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport("xlsx")} disabled={exporting !== null}>
                {exporting === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Excel
              </Button>
              <Button onClick={() => handleExport("pdf")} disabled={exporting !== null}>
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> Yuklab olingan fayl boshida yuqoridagi uchta summa va tanlangan davr ustunlari bilan chiqadi.
            </p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {formatDate(analytics.from)} — {formatDate(analytics.to)} davri
            {isPending && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Each pair of related figures nests inside one outer card instead
              of 6 flat, same-weight boxes — reads as one unified group per
              topic (davomat / kelmadi / ulush) and stacks cleanly on a
              single mobile column with no horizontal scrolling. */}
          <div className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Davomat
            </p>
            <div className="divide-y divide-border">
              <button
                type="button"
                onClick={() => openDetail("present")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-success/5"
              >
                <span className="text-sm text-muted-foreground">Keldi</span>
                <span className="text-lg font-semibold text-success">{analytics.present}</span>
              </button>
              <button
                type="button"
                onClick={() => openDetail("late")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-warning/5"
              >
                <span className="text-sm text-muted-foreground">Kechikdi</span>
                <span className="text-lg font-semibold text-warning">{analytics.late}</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Kelmadi
            </p>
            <div className="divide-y divide-border">
              <button
                type="button"
                onClick={() => openDetail("excused")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-sky-500/5"
              >
                <span className="text-sm text-muted-foreground">Sababli</span>
                <span className="text-lg font-semibold text-sky-600 dark:text-sky-400">{analytics.excusedAbsent}</span>
              </button>
              <button
                type="button"
                onClick={() => openDetail("unexcused")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-destructive/5"
              >
                <span className="text-sm text-muted-foreground">Sababsiz</span>
                <span className="text-lg font-semibold text-destructive">{analytics.unexcusedAbsent}</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Ulush
            </p>
            <div className="divide-y divide-border">
              <button
                type="button"
                onClick={() => openDetail("earnedRange")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-success/5"
              >
                <span className="text-sm text-muted-foreground">Davr ichida</span>
                <span className="text-base font-semibold text-success">{money(analytics.totalEarnedInRange)}</span>
              </button>
              <button
                type="button"
                onClick={() => openDetail("lost")}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-destructive/5"
              >
                <span className="text-sm text-muted-foreground">Yo&apos;qotilgan</span>
                <span className="text-base font-semibold text-destructive">{money(analytics.totalLostToCutoff)}</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={lockGroupId ? "students" : "groups"}>
        <TabsList>
          <TabsTrigger value="groups">Guruhlar bo&apos;yicha</TabsTrigger>
          <TabsTrigger value="students">Studentlar bo&apos;yicha</TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Guruhlar bo&apos;yicha</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Guruh</TableHead>
                    <TableHead>Studentlar</TableHead>
                    <TableHead>Oylik kutilayotgan</TableHead>
                    <TableHead>Olingan (shu oy)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.groups.map((g) => (
                    <Fragment key={g.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setExpandedGroupId((cur) => (cur === g.id ? null : g.id))}
                      >
                        <TableCell className="w-8">
                          {expandedGroupId === g.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>{g.studentCount}</TableCell>
                        <TableCell className="text-violet-600 dark:text-violet-400">{money(g.expectedThisMonth)}</TableCell>
                        <TableCell className="text-success">{money(g.earnedMonthToDate)}</TableCell>
                      </TableRow>
                      {expandedGroupId === g.id && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={5} className="p-0">
                            <div className="space-y-2 p-4">
                              {/* Umumiy summa / Davr ichida / Yo'qotilgan used to
                                  be their own always-visible columns — moved
                                  here since they matter less often than the
                                  two figures kept in the main row. */}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  Umumiy summa: <strong className="text-foreground">{money(g.grossRevenue)}</strong>
                                </span>
                                <span>
                                  Davr ichida: <strong className="text-success">{money(g.earnedInRange)}</strong>
                                </span>
                                <span>
                                  Yo&apos;qotilgan: <strong className="text-destructive">{money(g.lostToCutoff)}</strong>
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Nega bunday: har bir student uchun ulushingiz = shu guruhning bitta darsdan
                                olinadigan ulushi ({money(Number(studentsByGroup.get(g.id)?.[0]?.lessonRate ?? 0))}) ×
                                shu oydagi haqiqiy dars kunlari soni ({studentsByGroup.get(g.id)?.[0]?.scheduledLessonsThisMonth ?? 0} ta).
                              </p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Oylik to&apos;lovi</TableHead>
                                    <TableHead>Dars ulushi</TableHead>
                                    <TableHead>Shu oy dars kuni</TableHead>
                                    <TableHead>Oylik kutilayotgan</TableHead>
                                    <TableHead>Olingan (shu oy)</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(studentsByGroup.get(g.id) ?? []).map((s) => (
                                    <TableRow key={s.id}>
                                      <TableCell>{s.fullName}</TableCell>
                                      <TableCell>{money(s.monthlyPrice)}</TableCell>
                                      <TableCell>{money(s.lessonRate)}</TableCell>
                                      <TableCell>{s.scheduledLessonsThisMonth}</TableCell>
                                      <TableCell className="text-violet-600 dark:text-violet-400">
                                        {money(s.expectedThisMonth)}
                                      </TableCell>
                                      <TableCell className="text-success">{money(s.earnedMonthToDate)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Studentlar bo&apos;yicha</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Guruh</TableHead>
                    <TableHead>Davomat</TableHead>
                    <TableHead>Oylik kutilayotgan</TableHead>
                    <TableHead>Olingan (shu oy)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.students.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.fullName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.groupName}</TableCell>
                      <TableCell>
                        {/* Keldi/Kechikdi/Sababli/Sababsiz used to be 4 of
                            their own columns — squeezed into one compact,
                            color-coded cluster so the table stops scrolling
                            wide on smaller screens. "Davr ichida" moved to
                            the period-stat drill-down above, it's not lost. */}
                        <div className="flex flex-wrap gap-1">
                          <span
                            title="Keldi"
                            className="flex items-center gap-0.5 rounded bg-success/15 px-1.5 py-0.5 text-xs font-medium text-success"
                          >
                            <Check className="h-3 w-3" /> {s.present}
                          </span>
                          <span
                            title="Kechikdi"
                            className="flex items-center gap-0.5 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning"
                          >
                            <Clock className="h-3 w-3" /> {s.late}
                          </span>
                          <span
                            title="Sababli kelmadi"
                            className="flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400"
                          >
                            <Minus className="h-3 w-3" /> {s.excusedAbsent}
                          </span>
                          <span
                            title="Sababsiz kelmadi"
                            className="flex items-center gap-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive"
                          >
                            <XIcon className="h-3 w-3" /> {s.unexcusedAbsent}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-violet-600 dark:text-violet-400">{money(s.expectedThisMonth)}</TableCell>
                      <TableCell className="text-success">{money(s.earnedMonthToDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailDialog} onOpenChange={(open) => !open && setDetailDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detailDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{detailDialog?.description}</p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(() => {
              // Local alias so TS can narrow `detailDialog` to non-null once
              // and keep that narrowing inside the nested .map() callback
              // below (optional-chaining on the outer expression alone
              // doesn't survive into a nested closure).
              const d = detailDialog;
              if (!d) return null;
              if (d.rows.length === 0) {
                return <p className="py-4 text-center text-sm text-muted-foreground">Bu davrda ma&apos;lumot yo&apos;q.</p>;
              }
              return d.rows.map((r, i) => {
                const hasNotes = d.kind === "excused" && r.notes && r.notes.length > 0;
                const isLost = d.kind === "lost";
                return (
                  <div key={i} className="rounded-lg px-2 py-1.5 odd:bg-muted/30">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.sub}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="font-medium">{r.value}</p>
                        {isLost && (
                          // "aynan osha vaziyatga bog'langan panelga olib
                          // boradigan" — a direct link to THIS student's own
                          // group + report tab, not just a static number.
                          <Link
                            href={`/dashboard/groups/${r.groupId}?tab=report`}
                            className="flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                          >
                            Guruhga <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {/* "Sababli kelmadi" notes surfaced right here, larger and
                        on their own line, instead of being buried — this is
                        the whole reason a teacher opens this drill-down. */}
                    {hasNotes && (
                      <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
                        {r.notes!.map((note, ni) => (
                          <p key={ni} className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                            {note}
                          </p>
                        ))}
                      </div>
                    )}
                    {d.kind === "excused" && !hasNotes && (
                      <p className="mt-1 text-xs italic text-muted-foreground/70">Izoh qoldirilmagan</p>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>Jami</span>
            <span>{detailDialog?.total}</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
