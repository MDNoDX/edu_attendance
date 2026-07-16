"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhotoUpload } from "@/components/features/photo-upload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentStatusBadge } from "@/components/shared/status-badge";
import { studentSchema, type StudentInput } from "@/lib/validations";
import { createStudent, updateStudent, deleteStudent, listStudents, type StudentFilters } from "@/app/actions/students";
import { formatDate, initials } from "@/lib/utils";

interface GroupOption {
  id: string;
  name: string;
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
  photoUrl?: string | null;
  group: { id: string; name: string; roomName: string };
}

export function StudentsManager({
  initialStudents,
  initialTotal,
  groups,
  /** When set, the create dialog opens pre-locked to this group (used from the group detail page's "student qo'shish" shortcut) — the group picker is hidden entirely instead of just pre-selected, since there's nothing to choose from that view. */
  lockGroupId,
}: {
  initialStudents: StudentRow[];
  initialTotal: number;
  groups: GroupOption[];
  lockGroupId?: string;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const createForm = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: { status: "ACTIVE", groupId: lockGroupId },
  });
  const editForm = useForm<StudentInput>({ resolver: zodResolver(studentSchema) });

  function refetch(filters: StudentFilters) {
    startTransition(async () => {
      const res = await listStudents(filters);
      setStudents(res.students as never);
      setTotal(res.total);
    });
  }

  function currentFilters(overrides: Partial<{ search: string; status: string; groupId: string }> = {}) {
    const nextSearch = overrides.search ?? search;
    const nextStatus = overrides.status ?? statusFilter;
    // A group-scoped view (lockGroupId set) always stays scoped to that one
    // group — there's no filter UI to change it, so the group filter state
    // (which defaults to "ALL") must never override the lock here, or every
    // refetch after a create/edit would silently widen back out to every
    // student across every group.
    const nextGroup = lockGroupId ?? (overrides.groupId ?? groupFilter);
    return {
      search: nextSearch,
      status: nextStatus === "ALL" ? undefined : (nextStatus as never),
      groupId: nextGroup === "ALL" ? undefined : nextGroup,
    };
  }

  function onSearchChange(value: string) {
    setSearch(value);
    refetch(currentFilters({ search: value }));
  }

  function onStatusFilterChange(value: string) {
    setStatusFilter(value);
    refetch(currentFilters({ status: value }));
  }

  function onGroupFilterChange(value: string) {
    setGroupFilter(value);
    refetch(currentFilters({ groupId: value }));
  }

  async function onCreate(data: StudentInput) {
    const res = await createStudent(data);
    if (!res.ok) {
      const message = typeof res.error === "string" ? res.error : res.error.formErrors?.[0];
      toast.error(message ?? "Ma'lumotlarni tekshiring.");
      return;
    }
    toast.success("Student qo'shildi.");
    setCreateOpen(false);
    createForm.reset({ status: "ACTIVE", groupId: lockGroupId });
    refetch(currentFilters());
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
      groupId: student.group.id,
      photoUrl: student.photoUrl ?? "",
    } as never);
  }

  async function onEdit(data: StudentInput) {
    if (!editTarget) return;
    const res = await updateStudent(editTarget.id, data);
    if (!res.ok) return toast.error("Ma'lumotlarni tekshiring.");
    toast.success("Ma'lumotlar yangilandi.");
    setEditTarget(null);
    refetch(currentFilters());
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
          {/* On a group-scoped view (opened from inside a group's own page) every
              row already belongs to that one group, so a group filter here would
              just be confusing clutter — only show it on the full Studentlarim list. */}
          {!lockGroupId && (
            <Select value={groupFilter} onValueChange={onGroupFilterChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Guruh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Barcha guruhlar</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
              <div className="col-span-2 space-y-2">
                <Label>Rasm (ixtiyoriy)</Label>
                <PhotoUpload
                  value={createForm.watch("photoUrl")}
                  onChange={(dataUrl) => createForm.setValue("photoUrl", dataUrl ?? "")}
                  fallbackText={initials(`${createForm.watch("firstName") || ""} ${createForm.watch("lastName") || ""}`) || "?"}
                />
              </div>
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
                <Label>Jinsi (ixtiyoriy)</Label>
                <Select onValueChange={(v) => createForm.setValue("gender", v as never)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlanmagan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Erkak</SelectItem>
                    <SelectItem value="FEMALE">Ayol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tug'ilgan sana (ixtiyoriy)</Label>
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
              {!lockGroupId && (
                <div className="space-y-2">
                  <Label>Guruh</Label>
                  <Select onValueChange={(v) => createForm.setValue("groupId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
              <TableHead>Guruh</TableHead>
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
                    {student.photoUrl ? (
                      <AvatarImage src={student.photoUrl} alt={`${student.firstName} ${student.lastName}`} />
                    ) : null}
                    <AvatarFallback>{initials(`${student.firstName} ${student.lastName}`)}</AvatarFallback>
                  </Avatar>
                  {student.lastName} {student.firstName}
                </TableCell>
                <TableCell>{student.group.name}</TableCell>
                <TableCell className="text-sm">{student.group.roomName}</TableCell>
                <TableCell>{student.phone || student.parentPhone}</TableCell>
                <TableCell>
                  <StudentStatusBadge status={student.status} />
                </TableCell>
                <TableCell>{formatDate(student.startDate)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(student)}
                      aria-label={`${student.lastName} ${student.firstName}ni tahrirlash`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(student)}
                      aria-label={`${student.lastName} ${student.firstName}ni o'chirish`}
                    >
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
            <div className="col-span-2 space-y-2">
              <Label>Rasm (ixtiyoriy)</Label>
              <PhotoUpload
                value={editForm.watch("photoUrl")}
                onChange={(dataUrl) => editForm.setValue("photoUrl", dataUrl ?? "")}
                fallbackText={initials(`${editTarget?.firstName ?? ""} ${editTarget?.lastName ?? ""}`) || "?"}
              />
            </div>
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
            <div className="col-span-2 space-y-2">
              <Label>Guruh</Label>
              <Select defaultValue={editTarget?.group.id} onValueChange={(v) => editForm.setValue("groupId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
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
