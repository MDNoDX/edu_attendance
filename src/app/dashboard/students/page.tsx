import { PageHeader } from "@/components/shared/page-header";
import { StudentsManager } from "@/components/features/students-manager";
import { listStudents } from "@/app/actions/students";
import { listCourses } from "@/app/actions/courses";

export default async function StudentsPage() {
  const [{ students, total }, courses] = await Promise.all([
    listStudents({ pageSize: 200 }),
    listCourses(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Studentlarim" description={`Jami ${total} ta student`} />
      <StudentsManager
        initialStudents={students as never}
        initialTotal={total}
        courses={courses.map((c) => ({
          id: c.id,
          name: c.name,
          groups: c.groups.map((g) => ({ id: g.id, name: g.name })),
        }))}
      />
    </div>
  );
}
