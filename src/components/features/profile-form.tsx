"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  profileUpdateSchema,
  changePasswordSchema,
  type ProfileUpdateInput,
  type ChangePasswordInput,
} from "@/lib/validations";
import { updateProfile, changePassword } from "@/app/actions/profile";

interface ProfileData {
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  defaultLessonRate: unknown;
  specialization: string | null;
  bio: string | null;
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const profileForm = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: profile.fullName,
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      defaultLessonRate: Number(profile.defaultLessonRate),
      specialization: profile.specialization ?? "",
      bio: profile.bio ?? "",
    },
  });

  const passwordForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function onSaveProfile(data: ProfileUpdateInput) {
    const res = await updateProfile(data);
    if (!res.ok) {
      toast.error("Ma'lumotlarni tekshiring.");
      return;
    }
    toast.success("Profil yangilandi.");
  }

  async function onChangePassword(data: ChangePasswordInput) {
    setPasswordBusy(true);
    try {
      const res = await changePassword(data);
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Ma'lumotlarni tekshiring.");
        return;
      }
      toast.success("Parol yangilandi.");
      passwordForm.reset();
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shaxsiy ma&apos;lumotlar</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
            <div className="space-y-2">
              <Label>Login</Label>
              <Input value={profile.username} disabled />
            </div>
            <div className="space-y-2">
              <Label>Ism-familiya</Label>
              <Input {...profileForm.register("fullName")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input {...profileForm.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...profileForm.register("email")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bitta darsga standart ulush (so&apos;m)</Label>
              <Input type="number" {...profileForm.register("defaultLessonRate")} />
              <p className="text-xs text-muted-foreground">
                Har bir guruh uchun alohida override qo&apos;yish mumkin (Guruhlarim bo&apos;limida).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Mutaxassislik</Label>
              <Input {...profileForm.register("specialization")} />
            </div>
            <div className="space-y-2">
              <Label>Bio (ixtiyoriy)</Label>
              <Input {...profileForm.register("bio")} />
            </div>
            <Button type="submit" disabled={profileForm.formState.isSubmitting}>
              Saqlash
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parolni almashtirish</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
            <div className="space-y-2">
              <Label>Joriy parol</Label>
              <Input type="password" {...passwordForm.register("currentPassword")} />
            </div>
            <div className="space-y-2">
              <Label>Yangi parol</Label>
              <Input type="password" {...passwordForm.register("newPassword")} />
            </div>
            <div className="space-y-2">
              <Label>Yangi parolni tasdiqlang</Label>
              <Input type="password" {...passwordForm.register("confirmPassword")} />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Yangilanmoqda..." : "Parolni yangilash"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
