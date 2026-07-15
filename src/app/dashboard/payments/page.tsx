import { Wallet, TrendingDown, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PaymentsManager } from "@/components/features/payments-manager";
import { listPayments } from "@/app/actions/payments";
import { listStudents } from "@/app/actions/students";
import { getDashboardStats } from "@/app/actions/stats";
import { formatUZS } from "@/lib/utils";

export default async function PaymentsPage() {
  const [{ payments }, { students }, stats] = await Promise.all([
    listPayments({ pageSize: 100 }),
    listStudents({ pageSize: 200, status: "ACTIVE" }),
    getDashboardStats(),
  ]);

  const monthPotential = stats.month.earned + stats.month.lostToCutoff;
  const monthPct = monthPotential > 0 ? Math.round((stats.month.earned / monthPotential) * 100) : 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="To'lovlar va daromadim"
        description={`Bir dars uchun standart ulush: ${formatUZS(stats.defaultLessonRate)}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bugungi daromad" value={formatUZS(stats.today.earned)} icon={Wallet} tone="success" />
        <StatCard label="Oylik daromad" value={formatUZS(stats.month.earned)} icon={CalendarDays} />
        <StatCard label="Yillik daromad" value={formatUZS(stats.year.earned)} icon={CalendarDays} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bu oy samaradorlik</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={monthPct} />
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Ketma-ket kelmagan darslar sababli yo&apos;qotilgan:
            </span>
            <strong className="text-destructive">{formatUZS(stats.month.lostToCutoff)}</strong>
          </div>
          <p className="text-xs text-muted-foreground">
            Eslatma: student ketma-ket 3 va undan ortiq darsga kelmasa, 3-darsdan boshlab ushbu davr uchun ulush hisoblanmaydi.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Studentlar to&apos;lovlari</h2>
        <PaymentsManager
          initialPayments={payments as never}
          students={students.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            course: { monthlyPrice: s.course.monthlyPrice },
          }))}
        />
      </div>
    </div>
  );
}
