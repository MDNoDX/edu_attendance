"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  profileUpdateSchema,
  changePasswordSchema,
  type ProfileUpdateInput,
  type ChangePasswordInput,
} from "@/lib/validations";
import { updateProfile, changePassword } from "@/app/actions/profile";
import { checkUsernameAvailable } from "@/app/actions/username";

type UsernameStatus = "idle" | "checking" | "available" | "taken";

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
      username: profile.username,
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
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const usernameValue = profileForm.watch("username");

  useEffect(() => {
    // No need to check anything if it's unchanged from what they already have.
    if (!usernameValue || usernameValue === profile.username || profileForm.formState.errors.username) {
      setUsernameStatus("idle");
      return;
    }
    let cancelled = false;
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(usernameValue);
        if (cancelled) return;
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        if (!cancelled) setUsernameStatus("idle");
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameValue, profile.username, profileForm.formState.errors.username]);

  async function onSaveProfile(data: ProfileUpdateInput) {
    if (usernameStatus === "taken") {
      toast.error("Bu login band. Boshqa login tanlang.");
      return;
    }
    const res = await updateProfile(data);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Ma'lumotlarni tekshiring.");
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
              <div className="relative">
                <Input autoComplete="username" className="pr-9" {...profileForm.register("username")} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {usernameStatus === "available" && <Check className="h-4 w-4 text-success" />}
                  {usernameStatus === "taken" && <X className="h-4 w-4 text-destructive" />}
                </span>
              </div>
              {profileForm.formState.errors.username ? (
                <p className="text-xs text-destructive">{profileForm.formState.errors.username.message}</p>
              ) : usernameStatus === "taken" ? (
                <p className="text-xs text-destructive">Bu login band — boshqasini tanlang.</p>
              ) : usernameStatus === "available" ? (
                <p className="text-xs text-success">Bu login bo&apos;sh, saqlashingiz mumkin.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Tizimga shu login bilan kirasiz.</p>
              )}
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
              <MoneyInput
                value={profileForm.watch("defaultLessonRate")}
                onChange={(v) => profileForm.setValue("defaultLessonRate", v ?? 0)}
                placeholder="18 500"
              />
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
