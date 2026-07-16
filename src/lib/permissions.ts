/**
 * Granular capabilities a SUPER_ADMIN account can be given. Managing OTHER
 * admins (promoting a teacher to admin, changing anyone's permissions, or
 * demoting an admin back to teacher) is deliberately NOT a delegatable
 * permission here — it's reserved exclusively for owner-level admin(s)
 * (User.isOwner === true, provisioned only via prisma/create-admin.ts),
 * enforced via requireOwnerAdmin() in src/lib/auth.ts. That prevents any
 * chain of privilege escalation: a limited admin can never grant themselves
 * (or anyone else) more power than the owner explicitly gave them.
 */
export const ADMIN_PERMISSIONS = [
  "MANAGE_TEACHERS",
  "IMPERSONATE",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, { label: string; description: string }> = {
  MANAGE_TEACHERS: {
    label: "O'qituvchilarni boshqarish",
    description: "O'qituvchilar ro'yxatini ko'rish, ma'lumotlarini tahrirlash, parolini tiklash, faol/faolsiz qilish.",
  },
  IMPERSONATE: {
    label: "Nomidan kirish",
    description: "Istalgan o'qituvchi nomidan uning dashboardiga kirish (qo'llab-quvvatlash uchun).",
  },
};

export function isValidAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}
