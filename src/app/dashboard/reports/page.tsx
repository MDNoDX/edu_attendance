import { PageHeader } from "@/components/shared/page-header";
import { TeacherReports } from "@/components/features/teacher-reports";
import { listGroups } from "@/app/actions/groups";

export default async function ReportsPage() {
  const groups = await listGroups();

  return (
    <div className="space-y-6">
      <PageHeader title="Hisobot" description="Davomat va daromad hisobotingizni yuklab oling" />
      <TeacherReports groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
    </div>
  );
}
