import { PageHeader } from "@/components/shared/page-header";
import { StudentsManager } from "@/components/features/students-manager";
import { listStudents } from "@/app/actions/students";
import { listGroups } from "@/app/actions/groups";

export default async function StudentsPage() {
  const [{ students, total }, groups] = await Promise.all([
    listStudents({ pageSize: 200 }),
    listGroups(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Studentlarim" description={`Jami ${total} ta student`} />
      <StudentsManager
        initialStudents={students as never}
        initialTotal={total}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />
    </div>
  );
}
