"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, FileSpreadsheet, Loader2, Users, Wallet, TrendingDown, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { FadeInStagger, FadeInItem } from "@/components/shared/motion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportAnalytics, type ReportAnalytics } from "@/app/actions/reports";
import { ATTENDANCE_REPORT_FIELDS } from "@/lib/reports/fields";
import { Checkbox } from "@/components/ui/checkbox";
import { formatUZS, formatDate } from "@/lib/utils";

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
}: {
  initialAnalytics: ReportAnalytics;
  groups: GroupOption[];
  students: StudentOption[];
}) {
  const [from, setFrom] = useState(toDateInputValue(startOfCurrentMonth()));
  const [to, setTo] = useState(toDateInputValue(new Date()));
  const [scope, setScope] = useState<"all" | string>("all"); // "all" | `group:<id>` | `student:<id>`
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(
    ATTENDANCE_REPORT_FIELDS.filter((f) => f.defaultSelected).map((f) => f.key),
  );

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

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Sanadan</Label>
            <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Sanagacha</Label>
            <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
          </div>
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
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Excel yoki PDF sifatida yuklab olish</CardTitle>
        </CardHeader>
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
            <Check className="h-3.5 w-3.5" /> Yuklab olingan fayl aynan yuqoridagi filtr va sanalarga mos keladi.
          </p>
        </CardContent>
      </Card>

      <FadeInStagger
        key={`${String(analytics.from)}-${String(analytics.to)}-${scope}`}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <FadeInItem>
          <StatCard label="Studentlar" value={analytics.totalStudents} icon={Users} tone="info" />
        </FadeInItem>
        <FadeInItem>
          <StatCard label="Oylik kutilayotgan summa" value={formatUZS(analytics.totalMonthlyRevenue)} icon={Wallet} tone="violet" />
        </FadeInItem>
        <FadeInItem>
          <StatCard label="Davr ichida ulushim" value={formatUZS(analytics.totalEarnedInRange)} icon={Wallet} tone="success" />
        </FadeInItem>
        <FadeInItem>
          <StatCard label="Yo'qotilgan (uzr)" value={formatUZS(analytics.totalLostToCutoff)} icon={TrendingDown} tone="destructive" />
        </FadeInItem>
      </FadeInStagger>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {formatDate(analytics.from)} — {formatDate(analytics.to)} davomat taqsimoti
            {isPending && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-success/10 p-3 text-center">
            <p className="text-2xl font-semibold text-success">{analytics.present}</p>
            <p className="text-xs text-muted-foreground">Keldi</p>
          </div>
          <div className="rounded-lg bg-warning/10 p-3 text-center">
            <p className="text-2xl font-semibold text-warning">{analytics.late}</p>
            <p className="text-xs text-muted-foreground">Kechikdi</p>
          </div>
          <div className="rounded-lg bg-sky-500/10 p-3 text-center">
            <p className="text-2xl font-semibold text-sky-600 dark:text-sky-400">{analytics.excusedAbsent}</p>
            <p className="text-xs text-muted-foreground">Sababli kelmadi</p>
          </div>
          <div className="rounded-lg bg-destructive/10 p-3 text-center">
            <p className="text-2xl font-semibold text-destructive">{analytics.unexcusedAbsent}</p>
            <p className="text-xs text-muted-foreground">Sababsiz kelmadi</p>
          </div>
        </CardContent>
      </Card>

      {analytics.groups.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Guruhlar bo&apos;yicha</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guruh</TableHead>
                  <TableHead>Studentlar</TableHead>
                  <TableHead>Oylik summa</TableHead>
                  <TableHead>Ulushim</TableHead>
                  <TableHead>Yo&apos;qotilgan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.studentCount}</TableCell>
                    <TableCell>{formatUZS(g.monthlyRevenue)}</TableCell>
                    <TableCell className="text-success">{formatUZS(g.earned)}</TableCell>
                    <TableCell className="text-destructive">{formatUZS(g.lostToCutoff)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                <TableHead>Keldi</TableHead>
                <TableHead>Kechikdi</TableHead>
                <TableHead>Sababli</TableHead>
                <TableHead>Sababsiz</TableHead>
                <TableHead>Ulushim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.groupName}</TableCell>
                  <TableCell>{s.present}</TableCell>
                  <TableCell>{s.late}</TableCell>
                  <TableCell>{s.excusedAbsent}</TableCell>
                  <TableCell>{s.unexcusedAbsent}</TableCell>
                  <TableCell className="text-success">{formatUZS(s.earned)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
