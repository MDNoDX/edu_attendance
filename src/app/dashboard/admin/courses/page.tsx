import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/courses.
export default function Deprecated() {
  redirect("/dashboard/courses");
}
