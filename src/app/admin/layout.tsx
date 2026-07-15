import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Defense in depth: middleware already blocks non-SUPER_ADMIN at the edge,
  // but this re-checks server-side in case the JWT claim and DB ever drift.
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  return <AdminShell fullName={session.fullName}>{children}</AdminShell>;
}
