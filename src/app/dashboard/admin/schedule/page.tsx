import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/schedule.
export default function Deprecated() {
  redirect("/dashboard/schedule");
}
