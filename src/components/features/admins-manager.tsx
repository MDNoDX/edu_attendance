"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Crown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { updateAdminPermissions, demoteAdmin } from "@/app/actions/admin";
import { ADMIN_PERMISSIONS, ADMIN_PERMISSION_LABELS, type AdminPermission } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";

interface AdminRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isOwner: boolean;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

export function AdminsManager({ initialAdmins }: { initialAdmins: AdminRow[] }) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [editTarget, setEditTarget] = useState<AdminRow | null>(null);
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [demoteTarget, setDemoteTarget] = useState<AdminRow | null>(null);
  const [busy, setBusy] = useState(false);

  function openEdit(admin: AdminRow) {
    setEditTarget(admin);
    setEditPermissions(new Set(admin.permissions));
  }

  function togglePermission(p: AdminPermission) {
    setEditPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function saveEdit() {
    if (!editTarget) return;
    setBusy(true);
    try {
      const res = await updateAdminPermissions(editTarget.id, Array.from(editPermissions));
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
        return;
      }
      setAdmins((prev) =>
        prev.map((a) => (a.id === editTarget.id ? { ...a, permissions: Array.from(editPermissions) } : a)),
      );
      toast.success("Vakolatlar yangilandi.");
      setEditTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDemote() {
    if (!demoteTarget) return;
    setBusy(true);
    try {
      const res = await demoteAdmin(demoteTarget.id);
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
        return;
      }
      setAdmins((prev) => prev.filter((a) => a.id !== demoteTarget.id));
      toast.success("Administratorlikdan chetlashtirildi — endi oddiy o'qituvchi.");
    } finally {
      setBusy(false);
      setDemoteTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <ShieldCheck className="h-5 w-5 text-violet" /> Adminlar
        </h2>
        <p className="text-sm text-muted-foreground">
          Kim admin ekanini, ularga qanday vakolatlar berilganini shu yerdan boshqarasiz.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Vakolatlar</TableHead>
                <TableHead>Admin bo&apos;lgan sana</TableHead>
                <TableHead className="text-right">Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials(admin.fullName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="flex items-center gap-1.5 font-medium leading-tight">
                          {admin.fullName}
                          {admin.isOwner && <Crown className="h-3.5 w-3.5 text-warning" />}
                        </p>
                        <p className="text-xs leading-tight text-muted-foreground">@{admin.username}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {admin.isOwner ? (
                      <Badge variant="default">Owner — barcha vakolatlar</Badge>
                    ) : admin.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Vakolat berilmagan</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {admin.permissions.map((p) => (
                          <Badge key={p} variant="secondary">
                            {ADMIN_PERMISSION_LABELS[p as AdminPermission]?.label ?? p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(admin.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {!admin.isOwner && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(admin)} aria-label="Vakolatlarni tahrirlash">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDemoteTarget(admin)}
                        >
                          Chetlashtirish
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget?.fullName} — vakolatlar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {ADMIN_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer">
                <Checkbox
                  checked={editPermissions.has(p)}
                  onCheckedChange={() => togglePermission(p)}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <Label className="cursor-pointer">{ADMIN_PERMISSION_LABELS[p].label}</Label>
                  <p className="text-xs text-muted-foreground">{ADMIN_PERMISSION_LABELS[p].description}</p>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!demoteTarget}
        onOpenChange={(open) => !open && setDemoteTarget(null)}
        title="Administratorlikdan chetlashtirish"
        description={`"${demoteTarget?.fullName}" endi admin panelga kira olmaydi — oddiy o'qituvchi hisobiga qaytadi.`}
        confirmLabel="Chetlashtirish"
        destructive
        loading={busy}
        onConfirm={handleDemote}
      />
    </div>
  );
}
