"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Layers, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/ui/money-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { groupSchema, type GroupInput } from "@/lib/validations";
import { createGroup, updateGroup, updateGroupStatus, deleteGroup } from "@/app/actions/groups";
import { formatDate, formatUZS } from "@/lib/utils";

const DAY_LABELS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

interface Option {
  id: string;
  name: string;
}

interface GroupRow {
  id: string;
  name: string;
  status: string;
  capacity: number;
  roomName: string;
  startDate: string | Date;
  teacherLessonRateOverride: unknown;
  course: { id: string; name: string };
  students: unknown[];
  scheduleSlots: { dayOfWeek: number; startTime: string; endTime: string }[];
}

const defaultScheduleSlot = { dayOfWeek: 1, startTime: "09:00", endTime: "10:30" };

function ScheduleSlotsEditor({
  fields,
  register,
  setValue,
  append,
  remove,
}: {
  fields: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
  register: ReturnType<typeof useForm<GroupInput>>["register"];
  setValue: ReturnType<typeof useForm<GroupInput>>["setValue"];
  append: (v: typeof defaultScheduleSlot) => void;
  remove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Haftalik jadval</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => append(defaultScheduleSlot)}>
          <Plus className="h-3.5 w-3.5" /> Qator qo&apos;shish
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <Select
              defaultValue={String(field.dayOfWeek)}
              onValueChange={(v) => setValue(`scheduleSlots.${index}.dayOfWeek`, Number(v))}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="time" {...register(`scheduleSlots.${index}.startTime`)} className="w-28" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="time" {...register(`scheduleSlots.${index}.endTime`)} className="w-28" />
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length === 1}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupsManager({
  initialGroups,
  courses,
  defaultLessonRate,
}: {
  initialGroups: GroupRow[];
  courses: Option[];
  defaultLessonRate: number;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null);
  const [busy, setBusy] = useState(false);

  const createForm = useForm<GroupInput>({
    resolver: zodResolver(groupSchema),
    defaultValues: { capacity: 15, scheduleSlots: [defaultScheduleSlot] },
  });
  const createSlots = useFieldArray({ control: createForm.control, name: "scheduleSlots" });

  const editForm = useForm<GroupInput>({ resolver: zodResolver(groupSchema) });
  const editSlots = useFieldArray({ control: editForm.control, name: "scheduleSlots" });

  async function onCreate(data: GroupInput) {
    const res = await createGroup(data);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
      return;
    }
    toast.success("Guruh yaratildi.");
    setCreateOpen(false);
    createForm.reset({ capacity: 15, scheduleSlots: [defaultScheduleSlot] });
    window.location.reload();
  }

  function openEdit(group: GroupRow) {
    setEditTarget(group);
    editForm.reset({
      name: group.name,
      courseId: group.course.id,
      roomName: group.roomName,
      capacity: group.capacity,
      startDate: new Date(group.startDate),
      teacherLessonRateOverride: group.teacherLessonRateOverride != null ? Number(group.teacherLessonRateOverride) : undefined,
      scheduleSlots: group.scheduleSlots.length ? group.scheduleSlots : [defaultScheduleSlot],
    } as never);
  }

  async function onEdit(data: GroupInput) {
    if (!editTarget) return;
    const res = await updateGroup(editTarget.id, data);
    if (!res.ok) {
      toast.error(typeof res.error === "string" ? res.error : "Ma'lumotlarni tekshiring.");
      return;
    }
    toast.success("Guruh yangilandi.");
    setEditTarget(null);
    window.location.reload();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await deleteGroup(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      toast.success("Guruh o'chirildi.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  async function handleStatusChange(groupId: string, status: "ACTIVE" | "PAUSED" | "FINISHED") {
    await updateGroupStatus(groupId, status);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, status } : g)));
    toast.success("Holat yangilandi.");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Yangi guruh
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Yangi guruh yaratish</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              <div className="space-y-2">
                <Label>Guruh nomi</Label>
                <Input {...createForm.register("name")} placeholder="IELTS-101" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Kurs</Label>
                  <Select onValueChange={(v) => createForm.setValue("courseId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kursni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Xona</Label>
                  <Input {...createForm.register("roomName")} placeholder="masalan: 10-xona" />
                </div>
                <div className="space-y-2">
                  <Label>Sig'im</Label>
                  <Input type="number" {...createForm.register("capacity")} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Sizning bitta darsdan ulushingiz (ixtiyoriy)</Label>
                  <MoneyInput
                    value={createForm.watch("teacherLessonRateOverride")}
                    onChange={(v) => createForm.setValue("teacherLessonRateOverride", v)}
                    placeholder={defaultLessonRate ? formatUZS(defaultLessonRate).replace(" so'm", "") : "18 500"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Bo&apos;sh qoldirsangiz standart ulushingiz ({formatUZS(defaultLessonRate)}) ishlatiladi. Bu
                    summa — talaba to&apos;lovidan mustaqil — har bir o&apos;tilgan darsdan sizga tushadigan pul.
                  </p>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Boshlanish sanasi</Label>
                  <Input type="date" {...createForm.register("startDate")} />
                </div>
              </div>

              <ScheduleSlotsEditor
                fields={createSlots.fields}
                register={createForm.register}
                setValue={createForm.setValue}
                append={createSlots.append}
                remove={createSlots.remove}
              />

              <DialogFooter>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? "Yaratilmoqda..." : "Yaratish"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Layers} title="Guruhlar topilmadi" description="Hali birorta guruh yaratilmagan." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id} className="transition-shadow hover:shadow-md">
              <Link href={`/dashboard/groups/${group.id}`} className="block">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    {group.name}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <Badge variant={group.status === "ACTIVE" ? "success" : group.status === "PAUSED" ? "warning" : "secondary"}>
                    {group.status === "ACTIVE" ? "Faol" : group.status === "PAUSED" ? "To'xtatilgan" : "Tugagan"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>Kurs: <strong>{group.course.name}</strong></p>
                  <p>Xona: <strong>{group.roomName}</strong></p>
                  <p>Studentlar: <strong>{group.students.length}</strong> / {group.capacity}</p>
                  <p>
                    Sizning ulushingiz:{" "}
                    <strong className="text-success">
                      {formatUZS(group.teacherLessonRateOverride != null ? Number(group.teacherLessonRateOverride) : defaultLessonRate)}
                    </strong>
                    /dars
                  </p>
                  <p>Boshlangan: {formatDate(group.startDate)}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {group.scheduleSlots.map((s, i) => (
                      <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {DAY_LABELS[s.dayOfWeek].slice(0, 3)} {s.startTime}-{s.endTime}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Link>
              <CardContent className="flex items-center justify-between gap-2 pt-0">
                <Select value={group.status} onValueChange={(v) => handleStatusChange(group.id, v as never)}>
                  <SelectTrigger className="h-8 w-32 text-xs" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Faol</SelectItem>
                    <SelectItem value="PAUSED">To'xtatilgan</SelectItem>
                    <SelectItem value="FINISHED">Tugagan</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(group)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(group)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Guruhni tahrirlash</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Guruh nomi</Label>
              <Input {...editForm.register("name")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Kurs</Label>
                <Select defaultValue={editTarget?.course.id} onValueChange={(v) => editForm.setValue("courseId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Xona</Label>
                <Input {...editForm.register("roomName")} />
              </div>
              <div className="space-y-2">
                <Label>Sig'im</Label>
                <Input type="number" {...editForm.register("capacity")} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Sizning bitta darsdan ulushingiz (ixtiyoriy)</Label>
                <MoneyInput
                  value={editForm.watch("teacherLessonRateOverride")}
                  onChange={(v) => editForm.setValue("teacherLessonRateOverride", v)}
                  placeholder={defaultLessonRate ? formatUZS(defaultLessonRate).replace(" so'm", "") : "18 500"}
                />
                <p className="text-xs text-muted-foreground">
                  Bo&apos;sh qoldirsangiz standart ulushingiz ({formatUZS(defaultLessonRate)}) ishlatiladi.
                </p>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Boshlanish sanasi</Label>
                <Input type="date" {...editForm.register("startDate")} />
              </div>
            </div>

            <ScheduleSlotsEditor
              fields={editSlots.fields}
              register={editForm.register}
              setValue={editForm.setValue}
              append={editSlots.append}
              remove={editSlots.remove}
            />

            <DialogFooter>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Guruhni o'chirish"
        description={`"${deleteTarget?.name}" guruhini o'chirmoqchimisiz?`}
        destructive
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
