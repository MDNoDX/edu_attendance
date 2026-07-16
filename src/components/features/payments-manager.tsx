"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PaymentStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { recordPaymentSchema, type RecordPaymentInput } from "@/lib/validations";
import { recordPayment, listPayments, generateMonthlyBillingForAllActiveStudents } from "@/app/actions/payments";
import { formatDate, formatUZS } from "@/lib/utils";

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  group: { monthlyPrice: unknown };
}

interface PaymentRow {
  id: string;
  billingMonth: string | Date;
  amountDue: unknown;
  amountPaid: unknown;
  status: string;
  student: { firstName: string; lastName: string };
  transactions: { id: string; amount: unknown; method: string; paidAt: string | Date }[];
}

export function PaymentsManager({ initialPayments, students }: { initialPayments: PaymentRow[]; students: StudentOption[] }) {
  const [payments, setPayments] = useState(initialPayments);
  const [recordOpen, setRecordOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { billingMonth: new Date(), method: "CASH" },
  });

  const selectedStudentId = form.watch("studentId");

  function onStudentChange(id: string) {
    form.setValue("studentId", id);
    const student = students.find((s) => s.id === id);
    if (student) form.setValue("amountDue", Number(student.group.monthlyPrice));
  }

  async function onRecord(data: RecordPaymentInput) {
    const res = await recordPayment(data);
    if (!res.ok) {
      toast.error("Xatolik yuz berdi.");
      return;
    }
    toast.success("To'lov qayd etildi.");
    setRecordOpen(false);
    form.reset({ billingMonth: new Date(), method: "CASH" });
    refresh();
  }

  function refresh() {
    startTransition(async () => {
      const res = await listPayments();
      setPayments(res.payments as never);
    });
  }

  async function handleGenerateBilling() {
    setGenerating(true);
    try {
      const res = await generateMonthlyBillingForAllActiveStudents();
      toast.success(`${res.created} ta yangi hisob yaratildi.`);
      refresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleGenerateBilling} disabled={generating}>
          <RefreshCw className="h-4 w-4" /> Oylik hisoblarni yaratish
        </Button>
        <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> To'lov qabul qilish
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>To'lov qabul qilish</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onRecord)} className="space-y-4">
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={selectedStudentId} onValueChange={onStudentChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.lastName} {s.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Oy (billing)</Label>
                <Input type="date" {...form.register("billingMonth")} />
              </div>
              <div className="space-y-2">
                <Label>Jami summa (so'm)</Label>
                <Input type="number" {...form.register("amountDue")} />
              </div>
              <div className="space-y-2">
                <Label>To'lanayotgan summa (so'm)</Label>
                <Input type="number" {...form.register("amount")} placeholder="720000" />
              </div>
              <div className="space-y-2">
                <Label>To'lov usuli</Label>
                <Select defaultValue="CASH" onValueChange={(v) => form.setValue("method", v as never)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Naqd</SelectItem>
                    <SelectItem value="CARD">Karta</SelectItem>
                    <SelectItem value="TRANSFER">O'tkazma</SelectItem>
                    <SelectItem value="OTHER">Boshqa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chek raqami (ixtiyoriy)</Label>
                <Input {...form.register("receiptNumber")} />
              </div>
              <div className="space-y-2">
                <Label>Izoh (ixtiyoriy)</Label>
                <Input {...form.register("note")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Saqlash
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={Wallet} title="To'lovlar topilmadi" description="Hali birorta to'lov yozuvi mavjud emas." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Oy</TableHead>
              <TableHead>Jami</TableHead>
              <TableHead>To'langan</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead>Oxirgi to'lov</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.student.lastName} {p.student.firstName}
                </TableCell>
                <TableCell>{new Date(p.billingMonth).toLocaleDateString("uz-UZ", { month: "long", year: "numeric" })}</TableCell>
                <TableCell>{formatUZS(Number(p.amountDue))}</TableCell>
                <TableCell>{formatUZS(Number(p.amountPaid))}</TableCell>
                <TableCell>
                  <PaymentStatusBadge status={p.status} />
                </TableCell>
                <TableCell>{p.transactions[0] ? formatDate(p.transactions[0].paidAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {isPending && <p className="text-xs text-muted-foreground">Yuklanmoqda...</p>}
    </div>
  );
}
