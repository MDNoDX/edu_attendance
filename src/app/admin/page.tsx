import { Users, UserCheck, GraduationCap, Layers } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { listAllTeachers, listAllAdmins, getAdminOverview, getMyAdminAccess } from "@/app/actions/admin";
import { TeachersManager } from "@/components/features/teachers-manager";
import { AdminsManager } from "@/components/features/admins-manager";
import { EmptyState } from "@/components/shared/empty-state";

export default async function AdminPage() {
  const access = await getMyAdminAccess();
  const canManageTeachers = access.isOwner || access.permissions.includes("MANAGE_TEACHERS");

  const [overview, teachers, admins] = await Promise.all([
    getAdminOverview(),
    canManageTeachers ? listAllTeachers() : Promise.resolve([]),
    access.isOwner ? listAllAdmins() : Promise.resolve([]),
  ]);

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

      {canManageTeachers ? (
        <TeachersManager initialTeachers={teachers as never} isOwner={access.isOwner} />
      ) : (
        <EmptyState
          icon={Users}
          title="Sizda o'qituvchilarni boshqarish vakolati yo'q"
          description="Bu bo'limni ko'rish uchun owner-adimindan 'O'qituvchilarni boshqarish' vakolatini so'rang."
        />
      )}

      {access.isOwner && <AdminsManager initialAdmins={admins as never} />}
    </div>
  );
}
