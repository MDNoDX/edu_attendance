import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/groups.
export default function Deprecated() {
  redirect("/dashboard/groups");
}
