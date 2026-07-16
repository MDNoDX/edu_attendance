import { z } from "zod";

// ----------------------------------------------------------------------------
// AUTH — single self-service role. A teacher registers their own account;
// there is no admin who creates accounts for them.
// ----------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().min(3, "Login kamida 3 ta belgidan iborat bo'lishi kerak"),
  password: z.string().min(4, "Parol kamida 4 ta belgidan iborat bo'lishi kerak"),
});

/** Shared everywhere a username is entered (signup, profile self-service, admin edit). */
export const usernameSchema = z
  .string()
  .min(3, "Login kamida 3 ta belgi")
  .max(32)
  .regex(/^[a-zA-Z0-9_.]+$/, "Login faqat lotin harflar, raqam, _ va . dan iborat bo'lsin");

export const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "Parol kamida 8 ta belgi"),
  fullName: z.string().min(2, "Ism-familiya kiritilishi shart"),
  email: z.string().email("Email noto'g'ri").optional().or(z.literal("")),
  phone: z.string().optional(),
  defaultLessonRate: z.coerce.number().min(0, "Ulush manfiy bo'lishi mumkin emas").default(0),
  specialization: z.string().optional(),
});

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  photoUrl: z.string().optional(),
  defaultLessonRate: z.coerce.number().min(0).optional(),
  specialization: z.string().optional(),
  bio: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Joriy parolni kiriting"),
    newPassword: z.string().min(8, "Yangi parol kamida 8 ta belgi"),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
  });

// ----------------------------------------------------------------------------
// STUDENTS
// ----------------------------------------------------------------------------

export const genderEnum = z.enum(["MALE", "FEMALE"]);
export const studentStatusEnum = z.enum(["ACTIVE", "INACTIVE", "FINISHED"]);

export const studentSchema = z.object({
  firstName: z.string().min(1, "Ism kiritilishi shart"),
  lastName: z.string().min(1, "Familiya kiritilishi shart"),
  middleName: z.string().optional(),
  gender: genderEnum,
  birthDate: z.coerce.date(),
  phone: z.string().optional(),
  parentPhone: z.string().min(5, "Ota-ona telefon raqami kiritilishi shart"),
  address: z.string().optional(),
  passportOrIdNo: z.string().optional(),
  photoUrl: z.string().optional(),
  note: z.string().optional(),
  status: studentStatusEnum.default("ACTIVE"),
  startDate: z.coerce.date(),
  courseId: z.string().min(1, "Kurs tanlanishi shart"),
  groupId: z.string().min(1, "Guruh tanlanishi shart"),
});

// ----------------------------------------------------------------------------
// COURSES & GROUPS — fully self-service, scoped to the logged-in teacher.
// ----------------------------------------------------------------------------

export const courseSchema = z.object({
  name: z.string().min(1, "Kurs nomi kiritilishi shart"),
  subject: z.string().optional(),
  description: z.string().optional(),
  durationMonths: z.coerce.number().int().min(1, "Davomiylik kamida 1 oy"),
  monthlyPrice: z.coerce.number().min(0, "Narx manfiy bo'lishi mumkin emas"),
  lessonsPerMonth: z.coerce.number().int().min(1, "Kamida 1 ta dars bo'lishi kerak"),
  isActive: z.boolean().default(true),
});

export const scheduleSlotSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const groupStatusEnum = z.enum(["ACTIVE", "FINISHED", "PAUSED"]);

export const groupSchema = z.object({
  name: z.string().min(1, "Guruh nomi kiritilishi shart"),
  courseId: z.string().min(1, "Kurs tanlanishi shart"),
  roomName: z.string().min(1, "Xona nomi kiritilishi shart"),
  capacity: z.coerce.number().int().min(1).default(15),
  status: groupStatusEnum.default("ACTIVE"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  teacherLessonRateOverride: z.coerce.number().min(0).optional(),
  scheduleSlots: z.array(scheduleSlotSchema).min(1, "Kamida bitta jadval kiritilishi kerak"),
});

// ----------------------------------------------------------------------------
// ATTENDANCE
// ----------------------------------------------------------------------------

export const attendanceStatusEnum = z.enum([
  "PRESENT",
  "EXCUSED_ABSENT",
  "UNEXCUSED_ABSENT",
  "LATE",
]);

export const markAttendanceSchema = z.object({
  lessonSessionId: z.string().min(1),
  studentId: z.string().min(1),
  status: attendanceStatusEnum,
  note: z.string().optional(),
  /** Actual clock-in time ("HH:mm"), only meaningful when status is LATE. */
  arrivalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Vaqt HH:MM ko'rinishida bo'lishi kerak")
    .optional(),
});

export const bulkMarkAttendanceSchema = z.object({
  lessonSessionId: z.string().min(1),
  marks: z.array(
    z.object({
      studentId: z.string().min(1),
      status: attendanceStatusEnum,
      note: z.string().optional(),
      arrivalTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/, "Vaqt HH:MM ko'rinishida bo'lishi kerak")
        .optional(),
    }),
  ),
});

// ----------------------------------------------------------------------------
// PAYMENTS
// ----------------------------------------------------------------------------

export const paymentMethodEnum = z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]);

export const recordPaymentSchema = z.object({
  studentId: z.string().min(1),
  billingMonth: z.coerce.date(),
  amountDue: z.coerce.number().min(0),
  amount: z.coerce.number().min(0.01, "Summani kiriting"),
  method: paymentMethodEnum.default("CASH"),
  receiptNumber: z.string().optional(),
  note: z.string().optional(),
});

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// SUPER ADMIN — editing/managing teacher accounts from /admin. Separate from
// profileUpdateSchema because an admin can also touch isActive, which a
// teacher can never change about their own account through /dashboard.
// ----------------------------------------------------------------------------

export const adminUpdateTeacherSchema = z.object({
  fullName: z.string().min(2, "Ism-familiya kiritilishi shart").optional(),
  username: usernameSchema.optional(),
  email: z.string().email("Email noto'g'ri").optional().or(z.literal("")),
  phone: z.string().optional(),
  defaultLessonRate: z.coerce.number().min(0).optional(),
  specialization: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Yangi parol kamida 8 ta belgi"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
