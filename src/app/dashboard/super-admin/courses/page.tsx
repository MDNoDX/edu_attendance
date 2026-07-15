import { redirect } from "next/navigation";
// Removed: Super Admin role no longer exists. See /dashboard/courses.
export default function Deprecated() {
  redirect("/dashboard/courses");
}
