import { PageHeader } from "@/components/shared/page-header";
import { GroupsManager } from "@/components/features/groups-manager";
import { listGroups } from "@/app/actions/groups";
import { getProfile } from "@/app/actions/profile";

export default async function GroupsPage() {
  const [groups, profile] = await Promise.all([listGroups(), getProfile()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Guruhlarim" description="Guruhlaringizni yarating va boshqaring" />
      <GroupsManager initialGroups={groups as never} defaultLessonRate={Number(profile.defaultLessonRate)} />
    </div>
  );
}
