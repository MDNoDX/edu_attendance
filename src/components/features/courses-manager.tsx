"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyInput } from "@/components/ui/money-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { courseSchema, type CourseInput } from "@/lib/validations";
import { createCourse, updateCourse, deleteCourse } from "@/app/actions/courses";
import { formatUZS } from "@/lib/utils";

interface CourseRow {
  id: string;
  name: string;
  subject: string | null;
  description: string | null;
  durationMonths: number;
  monthlyPrice: unknown;
  lessonsPerMonth: number;
  groups: { id: string; students: unknown[] }[];
}

export function CoursesManager({ initialCourses }: { initialCourses: CourseRow[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CourseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CourseRow | null>(null);
  const [busy, setBusy] = useState(false);

  const createForm = useForm<CourseInput>({ resolver: zodResolver(courseSchema) });
  const editForm = useForm<CourseInput>({ resolver: zodResolver(courseSchema) });

  async function onCreate(data: CourseInput) {
    const res = await createCourse(data);
    if (!res.ok) {
      toast.error("Xatolik yuz berdi.");
      return;
    }
    toast.success("Kurs yaratildi.");
    setCourses((prev) => [{ ...(res.course as unknown as Record<string, unknown>), groups: [] } as unknown as CourseRow, ...prev]);
    setCreateOpen(false);
    createForm.reset();
  }

  function openEdit(course: CourseRow) {
    setEditTarget(course);
    editForm.reset({
      name: course.name,
      subject: course.subject ?? "",
      description: course.description ?? "",
      durationMonths: course.durationMonths,
      monthlyPrice: Number(course.monthlyPrice),
      lessonsPerMonth: course.lessonsPerMonth,
    });
  }

  async function onEdit(data: CourseInput) {
    if (!editTarget) return;
    const res = await updateCourse(editTarget.id, data);
    if (!res.ok) {
      toast.error("Xatolik yuz berdi.");
      return;
    }
    toast.success("Kurs yangilandi.");
    setEditTarget(null);
    window.location.reload();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await deleteCourse(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCourses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Kurs o'chirildi.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Yangi kurs
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi kurs yaratish</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kurs nomi</Label>
                  <Input {...createForm.register("name")} placeholder="Masalan: IELTS Intensiv" />
                </div>
                <div className="space-y-2">
                  <Label>Fan (ixtiyoriy)</Label>
                  <Input {...createForm.register("subject")} placeholder="Masalan: Ingliz tili" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Davomiyligi (oy)</Label>
                  <Input type="number" {...createForm.register("durationMonths")} placeholder="6" />
                </div>
                <div className="space-y-2">
                  <Label>Oylik narx (talaba to&apos;lovi)</Label>
                  <MoneyInput
                    value={createForm.watch("monthlyPrice")}
                    onChange={(v) => createForm.setValue("monthlyPrice", v ?? 0)}
                    placeholder="720 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Oyiga dars soni</Label>
                  <Input type="number" {...createForm.register("lessonsPerMonth")} placeholder="12" />
                </div>
              </div>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Bu — talabadan olinadigan oylik to&apos;lov, sizning ulushingiz emas. Sizning bir
                darsdan olayotgan summangiz <strong>Guruh</strong> yaratishda alohida belgilanadi.
              </p>
              <div className="space-y-2">
                <Label>Tavsif (ixtiyoriy)</Label>
                <Input {...createForm.register("description")} />
              </div>
              <DialogFooter>
                <Button type="submit">Yaratish</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Kurslar topilmadi" description="Hali birorta kurs yaratilmagan." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{course.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{course.description || course.subject || "Tavsif kiritilmagan"}</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <span>Talaba to&apos;lovi: <strong>{formatUZS(Number(course.monthlyPrice))}</strong>/oy</span>
                  <span>Davomiyligi: <strong>{course.durationMonths} oy</strong></span>
                  <span>Dars/oy: <strong>{course.lessonsPerMonth}</strong></span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {course.groups.reduce((sum, g) => sum + g.students.length, 0)} student
                  </span>
                </div>
                <div className="flex justify-end gap-1 pt-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(course)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(course)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kursni tahrirlash</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kurs nomi</Label>
                <Input {...editForm.register("name")} />
              </div>
              <div className="space-y-2">
                <Label>Fan</Label>
                <Input {...editForm.register("subject")} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Davomiyligi (oy)</Label>
                <Input type="number" {...editForm.register("durationMonths")} />
              </div>
              <div className="space-y-2">
                <Label>Oylik narx (talaba to&apos;lovi)</Label>
                <MoneyInput
                  value={editForm.watch("monthlyPrice")}
                  onChange={(v) => editForm.setValue("monthlyPrice", v ?? 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Oyiga dars soni</Label>
                <Input type="number" {...editForm.register("lessonsPerMonth")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tavsif</Label>
              <Input {...editForm.register("description")} />
            </div>
            <DialogFooter>
              <Button type="submit">Saqlash</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Kursni o'chirish"
        description={`"${deleteTarget?.name}" kursini o'chirmoqchimisiz?`}
        destructive
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
