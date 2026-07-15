import { CalendarCheck, Users, Wallet, TrendingDown, Layers, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats } from "@/app/actions/stats";
import { formatUZS } from "@/lib/utils";

export default async function DashboardHomePage() {
  const stats = await getDashboardStats();

  const periods = [
    { label: "Bugun", data: stats.today, color: "text-info" },
    { label: "Bu hafta", data: stats.week, color: "text-violet" },
    { label: "Bu oy", data: stats.month, color: "text-primary" },
    { label: "Bu yil", data: stats.year, color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Bosh sahifa" description="Faoliyatingiz bo'yicha umumiy ko'rsatkichlar" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faol guruhlarim" value={stats.groupCount} icon={Layers} tone="violet" />
        <StatCard label="Studentlarim" value={stats.studentCount} icon={Users} tone="info" />
        <StatCard label="Bugungi daromad" value={formatUZS(stats.today.earned)} icon={Wallet} tone="success" />
        <StatCard label="Bu oy yo'qotilgan" value={formatUZS(stats.month.lostToCutoff)} icon={TrendingDown} tone="destructive" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {periods.map((p) => (
          <Card key={p.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className={`h-4 w-4 ${p.color}`} /> {p.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Keldi</span>
                <strong className="text-success">{p.data.present + p.data.late}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sababli</span>
                <strong className="text-warning">{p.data.excusedAbsent}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sababsiz</span>
                <strong className="text-destructive">{p.data.unexcusedAbsent}</strong>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ishlab topilgan
                </span>
                <strong>{formatUZS(p.data.earned)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yo&apos;qotilgan</span>
                <strong className="text-destructive">{formatUZS(p.data.lostToCutoff)}</strong>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
