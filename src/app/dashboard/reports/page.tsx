import { PageHeader } from "@/components/shared/page-header";
import { ReportDashboard } from "@/components/features/report-dashboard";
import { getReportAnalytics } from "@/app/actions/reports";
import { listGroups } from "@/app/actions/groups";
import { listStudents } from "@/app/actions/students";

function startOfCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function ReportsPage() {
  const [groups, { students }, analytics] = await Promise.all([
    listGroups(),
    listStudents({ pageSize: 200, status: "ACTIVE" }),
    getReportAnalytics({ from: startOfCurrentMonth(), to: new Date() }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="To'lovlar va hisobot"
        description="Studentlar bo'yicha daromadingiz, davomat va yuklab olinadigan hisobotlar — barchasi bir joyda"
      />
      <ReportDashboard
        initialAnalytics={analytics}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        students={students.map((s) => ({
          id: s.id,
          fullName: `${s.lastName} ${s.firstName}`,
          groupId: s.groupId,
        }))}
      />
    </div>
  );
}
