import { Users, UserCheck, GraduationCap, Layers } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { listAllTeachers, getAdminOverview } from "@/app/actions/admin";
import { TeachersManager } from "@/components/features/teachers-manager";

export default async function AdminPage() {
  const [overview, teachers] = await Promise.all([getAdminOverview(), listAllTeachers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platforma boshqaruvi</h1>
        <p className="text-sm text-muted-foreground">
          Barcha ro&apos;yxatdan o&apos;tgan o&apos;qituvchilarni ko&apos;ring, tahrirlang yoki ularning nomidan tizimga kiring.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jami o'qituvchilar" value={overview.teacherCount} icon={Users} tone="default" />
        <StatCard label="Faol o'qituvchilar" value={overview.activeTeacherCount} icon={UserCheck} tone="success" />
        <StatCard label="Jami o'quvchilar" value={overview.studentCount} icon={GraduationCap} tone="info" />
        <StatCard label="Jami guruhlar" value={overview.groupCount} icon={Layers} tone="violet" />
      </div>

      <TeachersManager initialTeachers={teachers as never} />
    </div>
  );
}
