import { redirect } from "next/navigation";

// Removed: "Kurslarim" no longer exists as a separate section — course
// fields (name, subject, monthly price) are now set directly on a Group.
// Safe to delete this entire src/app/dashboard/courses directory.
export default function Deprecated() {
  redirect("/dashboard/groups");
}
