import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/reports.
export default function Deprecated() {
  redirect("/dashboard/reports");
}
