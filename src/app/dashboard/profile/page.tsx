import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/features/profile-form";
import { ActiveSessions } from "@/components/features/active-sessions";
import { getProfile, listMySessions } from "@/app/actions/profile";

export default async function ProfilePage() {
  const [profile, sessions] = await Promise.all([getProfile(), listMySessions()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Profil" description="Hisobingiz ma'lumotlari" />
      <ProfileForm profile={profile} />
      <ActiveSessions initialSessions={sessions} />
    </div>
  );
}
