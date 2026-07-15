"use client";

import { useState, useTransition, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentStatusBadge } from "@/components/shared/status-badge";
import { studentSchema, type StudentInput } from "@/lib/validations";
import { createStudent, updateStudent, deleteStudent, listStudents, type StudentFilters } from "@/app/actions/students";
import { formatDate, initials } from "@/lib/utils";

interface CourseOption {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
}

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  parentPhone: string;
  status: string;
  startDate: string | Date;
  course: { id: string; name: string };
  group: { id: string; name: string; roomName: string };
}

export function StudentsManager({
  initialStudents,
  initialTotal,
  courses,
}: {
  initialStudents: StudentRow[];
  initialTotal: number;
  courses: CourseOption[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const createForm = useForm<StudentInput>({ resolver: zodResolver(studentSchema), defaultValues: { status: "ACTIVE" } });
  const editForm = useForm<StudentInput>({ resolver: zodResolver(studentSchema) });

  const selectedCreateCourseId = createForm.watch("courseId");
  const selectedEditCourseId = editForm.watch("courseId");

  const createGroupOptions = useMemo(
    () => courses.find((c) => c.id === selectedCreateCourseId)?.groups ?? [],
    [courses, selectedCreateCourseId],
  );
  const editGroupOptions = useMemo(
    () => courses.find((c) => c.id === selectedEditCourseId)?.groups ?? [],
    [courses, selectedEditCourseId],
  );

  function refetch(filters: StudentFilters) {
    startTransition(async () => {
      const res = await listStudents(filters);
      setStudents(res.students as never);
      setTotal(res.total);
    });
  }

  function onSearchChange(value: string) {
    setSearch(value);
    refetch({ search: value, status: statusFilter === "ALL" ? undefined : (statusFilter as never) });
  }

  function onStatusFilterChange(value: string) {
    setStatusFilter(value);
    refetch({ search, status: value === "ALL" ? undefined : (value as never) });
  }

  async function onCreate(data: StudentInput) {
    const res = await createStudent(data);
    if (!res.ok) {
      toast.error(res.error.formErrors?.[0] ?? "Ma'lumotlarni tekshiring.");
      return;
    }
    toast.success("Student qo'shildi.");
    setCreateOpen(false);
    createForm.reset({ status: "ACTIVE" });
    refetch({ search, status: statusFilter === "ALL" ? undefined : (statusFilter as never) });
  }

  function openEdit(student: StudentRow) {
    setEditTarget(student);
    editForm.reset({
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName ?? "",
      phone: student.phone ?? "",
      parentPhone: student.parentPhone,
      status: student.status as never,
      startDate: new Date(student.startDate),
      courseId: student.course.id,
      groupId: student.group.id,
    } as never);
  }

  async function onEdit(data: StudentInput) {
    if (!editTarget) return;
    const res = await updateStudent(editTarget.id, data);
    if (!res.ok) return toast.error("Ma'lumotlarni tekshiring.");
    toast.success("Ma'lumotlar yangilandi.");
    setEditTarget(null);
    refetch({ search, status: statusFilter === "ALL" ? undefined : (statusFilter as never) });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteStudent(deleteTarget.id);
      setStudents((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setTotal((t) => t - 1);
      toast.success("Student o'chirildi.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Ism, familiya yoki telefon..." className="pl-9" value={search} onChange={(e) => onSearchChange(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Barchasi</SelectItem>
              <SelectItem value="ACTIVE">Faol</SelectItem>
              <SelectItem value="INACTIVE">Nofaol</SelectItem>
              <SelectItem value="FINISHED">Tugatgan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Yangi student
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Yangi student qo'shish</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ism</Label>
                <Input {...createForm.register("firstName")} />
              </div>
              <div className="space-y-2">
                <Label>Familiya</Label>
                <Input {...createForm.register("lastName")} />
              </div>
              <div className="space-y-2">
                <Label>Sharif (ixtiyoriy)</Label>
                <Input {...createForm.register("middleName")} />
              </div>
              <div className="space-y-2">
                <Label>Jinsi</Label>
                <Select onValueChange={(v) => createForm.setValue("gender", v as never)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Erkak</SelectItem>
                    <SelectItem value="FEMALE">Ayol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tug'ilgan sana</Label>
                <Input type="date" {...createForm.register("birthDate")} />
              </div>
              <div className="space-y-2">
                <Label>Boshlagan sana</Label>
                <Input type="date" {...createForm.register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label>Telefon (ixtiyoriy)</Label>
                <Input {...createForm.register("phone")} placeholder="+998 90 000 00 00" />
              </div>
              <div className="space-y-2">
                <Label>Ota-ona telefon</Label>
                <Input {...createForm.register("parentPhone")} placeholder="+998 90 000 00 00" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Manzil (ixtiyoriy)</Label>
                <Input {...createForm.register("address")} />
              </div>
              <div className="space-y-2">
                <Label>Passport / ID (ixtiyoriy)</Label>
                <Input {...createForm.register("passportOrIdNo")} />
              </div>
              <div className="space-y-2">
                <Label>Holati</Label>
                <Select defaultValue="ACTIVE" onValueChange={(v) => createForm.setValue("status", v as never)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Faol</SelectItem>
                    <SelectItem value="INACTIVE">Nofaol</SelectItem>
                    <SelectItem value="FINISHED">Tugatgan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kurs</Label>
                <Select onValueChange={(v) => createForm.setValue("courseId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
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
                <Label>Guruh</Label>
                <Select onValueChange={(v) => createForm.setValue("groupId", v)} disabled={!selectedCreateCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Avval kursni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {createGroupOptions.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Izoh (ixtiyoriy)</Label>
                <Input {...createForm.register("note")} />
              </div>
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? "Saqlanmoqda..." : "Qo'shish"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={Users} title="Studentlar topilmadi" description="Qidiruv shartlariga mos student topilmadi." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Kurs / Guruh</TableHead>
              <TableHead>Xona</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead>Boshlagan</TableHead>
              <TableHead className="text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials(`${student.firstName} ${student.lastName}`)}</AvatarFallback>
                  </Avatar>
                  {student.lastName} {student.firstName}
                </TableCell>
                <TableCell>
                  {student.course.name}
                  <br />
                  <span className="text-xs text-muted-foreground">{student.group.name}</span>
                </TableCell>
                <TableCell className="text-sm">{student.group.roomName}</TableCell>
                <TableCell>{student.phone || student.parentPhone}</TableCell>
                <TableCell>
                  <StudentStatusBadge status={student.status} />
                </TableCell>
                <TableCell>{formatDate(student.startDate)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(student)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(student)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground">
        Jami: {total} ta student {isPending && "· yangilanmoqda..."}
      </p>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Studentni tahrirlash</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ism</Label>
              <Input {...editForm.register("firstName")} />
            </div>
            <div className="space-y-2">
              <Label>Familiya</Label>
              <Input {...editForm.register("lastName")} />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input {...editForm.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label>Ota-ona telefon</Label>
              <Input {...editForm.register("parentPhone")} />
            </div>
            <div className="space-y-2">
              <Label>Holati</Label>
              <Select defaultValue={editTarget?.status} onValueChange={(v) => editForm.setValue("status", v as never)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Faol</SelectItem>
                  <SelectItem value="INACTIVE">Nofaol</SelectItem>
                  <SelectItem value="FINISHED">Tugatgan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
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
            <div className="col-span-2 space-y-2">
              <Label>Guruh</Label>
              <Select defaultValue={editTarget?.group.id} onValueChange={(v) => editForm.setValue("groupId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(editGroupOptions.length ? editGroupOptions : courses.find((c) => c.id === editTarget?.course.id)?.groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="col-span-2">
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Studentni o'chirish"
        description={`"${deleteTarget?.lastName} ${deleteTarget?.firstName}" ni o'chirmoqchimisiz?`}
        destructive
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
