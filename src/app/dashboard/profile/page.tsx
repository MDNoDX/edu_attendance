import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/features/profile-form";
import { getProfile } from "@/app/actions/profile";

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <div className="space-y-6">
      <PageHeader title="Profil" description="Hisobingiz ma'lumotlari" />
      <ProfileForm profile={profile} />
    </div>
  );
}
