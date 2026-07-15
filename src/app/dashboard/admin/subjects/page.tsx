import { redirect } from "next/navigation";
// Removed: subjects are now a plain field on Course. See /dashboard/courses.
export default function Deprecated() {
  redirect("/dashboard/courses");
}
