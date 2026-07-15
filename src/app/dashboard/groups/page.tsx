import { PageHeader } from "@/components/shared/page-header";
import { GroupsManager } from "@/components/features/groups-manager";
import { listGroups } from "@/app/actions/groups";
import { listCourses } from "@/app/actions/courses";

export default async function GroupsPage() {
  const [groups, courses] = await Promise.all([listGroups(), listCourses()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Guruhlarim" description="Guruhlaringizni yarating va boshqaring" />
      <GroupsManager
        initialGroups={groups as never}
        courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
