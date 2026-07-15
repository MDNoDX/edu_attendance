"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { recordPaymentSchema } from "@/lib/validations";
import type { PaymentStatus, Prisma } from "@prisma/client";

function firstOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Ensures a (student, billingMonth) Payment row exists, seeded from the student's course price. Idempotent. */
export async function ensureBillingForStudent(studentId: string, billingMonth: Date) {
  const month = firstOfMonth(billingMonth);
  const existing = await prisma.payment.findUnique({
    where: { studentId_billingMonth: { studentId, billingMonth: month } },
  });
  if (existing) return existing;

  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { course: true } });
  return prisma.payment.create({
    data: {
      userId: student.userId,
      studentId,
      billingMonth: month,
      amountDue: student.course.monthlyPrice,
      amountPaid: 0,
      status: "UNPAID",
    },
  });
}

/** Bulk-generates the current month's billing rows for every active student owned by the teacher. Idempotent. */
export async function generateMonthlyBillingForAllActiveStudents(billingMonth: Date = new Date()) {
  const session = await requireSession();
  const students = await prisma.student.findMany({
    where: { userId: session.sub, status: "ACTIVE", deletedAt: null },
  });
  let created = 0;
  for (const student of students) {
    const month = firstOfMonth(billingMonth);
    const existing = await prisma.payment.findUnique({
      where: { studentId_billingMonth: { studentId: student.id, billingMonth: month } },
    });
    if (!existing) {
      await ensureBillingForStudent(student.id, billingMonth);
      created += 1;
    }
  }
  revalidatePath("/dashboard/payments");
  return { created };
}

export interface PaymentFilters {
  studentId?: string;
  status?: PaymentStatus;
  billingMonth?: Date;
  page?: number;
  pageSize?: number;
}

export async function listPayments(filters: PaymentFilters = {}) {
  const session = await requireSession();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Prisma.PaymentWhereInput = { userId: session.sub, deletedAt: null };
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.status) where.status = filters.status;
  if (filters.billingMonth) where.billingMonth = firstOfMonth(filters.billingMonth);

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { student: true, transactions: { orderBy: { paidAt: "desc" } } },
      orderBy: { billingMonth: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function recordPayment(input: unknown) {
  const session = await requireSession();
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };
  const { studentId, billingMonth, amountDue, amount, method, receiptNumber, note } = parsed.data;

  const student = await prisma.student.findFirst({ where: { id: studentId, userId: session.sub } });
  if (!student) return { ok: false as const, error: "Student topilmadi." };

  const month = firstOfMonth(billingMonth);
  const payment = await prisma.payment.upsert({
    where: { studentId_billingMonth: { studentId, billingMonth: month } },
    create: { userId: session.sub, studentId, billingMonth: month, amountDue, amountPaid: 0, status: "UNPAID" },
    update: {},
  });

  const newAmountPaid = Number(payment.amountPaid) + amount;
  const status: PaymentStatus =
    newAmountPaid >= Number(payment.amountDue) ? "PAID" : newAmountPaid > 0 ? "PARTIAL" : "UNPAID";

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      amountPaid: newAmountPaid,
      status,
      note,
      transactions: {
        create: { amount, method, receiptNumber, note },
      },
    },
    include: { transactions: true },
  });

  revalidatePath("/dashboard/payments");
  return { ok: true as const, payment: updated };
}

export async function getStudentPaymentSummary(studentId: string) {
  const session = await requireSession();
  return prisma.payment.findMany({
    where: { studentId, userId: session.sub, deletedAt: null },
    include: { transactions: true },
    orderBy: { billingMonth: "desc" },
  });
}
