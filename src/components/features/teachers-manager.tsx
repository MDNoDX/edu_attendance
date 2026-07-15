"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Pencil, KeyRound, LogIn, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/money-input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { adminUpdateTeacherSchema, adminResetPasswordSchema } from "@/lib/validations";
import { updateTeacherByAdmin, resetTeacherPassword, impersonateTeacher } from "@/app/actions/admin";
import { formatUZS, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type AdminUpdateTeacherInput = z.infer<typeof adminUpdateTeacherSchema>;
type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

interface TeacherRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  defaultLessonRate: number;
  specialization: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { students: number; groups: number; courses: number };
}

export function TeachersManager({ initialTeachers }: { initialTeachers: TeacherRow[] }) {
  const router = useRouter();
  const [teachers, setTeachers] = useState(initialTeachers);
  const [editTarget, setEditTarget] = useState<TeacherRow | null>(null);
  const [resetTarget, setResetTarget] = useState<TeacherRow | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<TeacherRow | null>(null);
  const [busy, setBusy] = useState(false);

  const editForm = useForm<AdminUpdateTeacherInput>({ resolver: zodResolver(adminUpdateTeacherSchema) });
  const resetForm = useForm<AdminResetPasswordInput>({ resolver: zodResolver(adminResetPasswordSchema) });

  function openEdit(teacher: TeacherRow) {
    setEditTarget(teacher);
    editForm.reset({
      fullName: teacher.fullName,
      username: teacher.username,
      email: teacher.email || "",
      phone: teacher.phone || "",
      defaultLessonRate: teacher.defaultLessonRate,
      specialization: teacher.specialization || "",
      isActive: teacher.isActive,
    });
  }

  async function onEdit(data: AdminUpdateTeacherInput) {
    if (!editTarget) return;
    const res = await updateTeacherByAdmin(editTarget.id, data);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Ma'lumotlarni tekshiring.");
      return;
    }
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === editTarget.id
          ? {
              ...t,
              fullName: data.fullName ?? t.fullName,
              username: data.username ?? t.username,
              email: data.email ?? t.email,
              phone: data.phone ?? t.phone,
              defaultLessonRate: data.defaultLessonRate ?? t.defaultLessonRate,
              specialization: data.specialization ?? t.specialization,
              isActive: data.isActive ?? t.isActive,
            }
          : t,
      ),
    );
    toast.success("O'qituvchi ma'lumotlari yangilandi.");
    setEditTarget(null);
  }

  async function onResetPassword(data: AdminResetPasswordInput) {
    if (!resetTarget) return;
    const res = await resetTeacherPassword(resetTarget.id, data);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
      return;
    }
    toast.success("Yangi parol saqlandi.");
    resetForm.reset();
    setResetTarget(null);
  }

  async function handleQuickToggleActive(teacher: TeacherRow) {
    const res = await updateTeacherByAdmin(teacher.id, { isActive: !teacher.isActive });
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
      return;
    }
    setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, isActive: !t.isActive } : t)));
    toast.success(!teacher.isActive ? "Hisob faollashtirildi." : "Hisob faolsizlantirildi.");
  }

  async function handleImpersonate() {
    if (!impersonateTarget) return;
    setBusy(true);
    try {
      const res = await impersonateTeacher(impersonateTarget.id);
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
      setImpersonateTarget(null);
    }
  }

  if (teachers.length === 0) {
    return <EmptyState icon={UsersIcon} title="O'qituvchilar topilmadi" description="Hali birorta o'qituvchi ro'yxatdan o'tmagan." />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>O&apos;qituvchi</TableHead>
                <TableHead>Aloqa</TableHead>
                <TableHead>Ulush</TableHead>
                <TableHead>Statistika</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>Ro&apos;yxatdan o&apos;tgan</TableHead>
                <TableHead className="text-right">Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials(teacher.fullName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium leading-tight">{teacher.fullName}</p>
                        <p className="text-xs leading-tight text-muted-foreground">@{teacher.username}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <p>{teacher.email || "—"}</p>
                    <p className="text-muted-foreground">{teacher.phone || "—"}</p>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{formatUZS(teacher.defaultLessonRate)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {teacher._count.students} o&apos;quvchi · {teacher._count.groups} guruh · {teacher._count.courses} kurs
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={teacher.isActive} onCheckedChange={() => handleQuickToggleActive(teacher)} />
                      <Badge variant={teacher.isActive ? "success" : "secondary"}>
                        {teacher.isActive ? "Faol" : "Faol emas"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(teacher.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(teacher)} aria-label="Tahrirlash">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setResetTarget(teacher)} aria-label="Parolni tiklash">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setImpersonateTarget(teacher)} aria-label="Nomidan kirish">
                        <LogIn className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>O&apos;qituvchini tahrirlash</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ism-familiya</Label>
                <Input {...editForm.register("fullName")} />
              </div>
              <div className="space-y-2">
                <Label>Login</Label>
                <Input {...editForm.register("username")} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input {...editForm.register("email")} />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input {...editForm.register("phone")} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Standart bitta darsdan ulushi</Label>
                <MoneyInput
                  value={editForm.watch("defaultLessonRate")}
                  onChange={(v) => editForm.setValue("defaultLessonRate", v)}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Mutaxassislik</Label>
                <Input {...editForm.register("specialization")} />
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
                <Label className="cursor-pointer">Hisob faol</Label>
                <Switch
                  checked={editForm.watch("isActive")}
                  onCheckedChange={(v) => editForm.setValue("isActive", v)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Parolni tiklash — {resetTarget?.fullName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-4">
            <div className="space-y-2">
              <Label>Yangi parol</Label>
              <Input type="text" {...resetForm.register("newPassword")} placeholder="Kamida 6 ta belgi" />
              {resetForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">{resetForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetForm.formState.isSubmitting}>
                {resetForm.formState.isSubmitting ? "Saqlanmoqda..." : "Parolni saqlash"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!impersonateTarget}
        onOpenChange={(open) => !open && setImpersonateTarget(null)}
        title="O'qituvchi nomidan kirish"
        description={`"${impersonateTarget?.fullName}" nomidan tizimga kirmoqchimisiz? Chiqish uchun dashboard tepasidagi tugmadan foydalanasiz.`}
        confirmLabel="Kirish"
        loading={busy}
        onConfirm={handleImpersonate}
      />
    </div>
  );
}
