import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/students.
export default function Deprecated() {
  redirect("/dashboard/students");
}
