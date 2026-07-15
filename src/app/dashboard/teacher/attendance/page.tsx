import { redirect } from "next/navigation";
// Attendance is now marked inside each group's Attendance Journal
// (see /dashboard/groups/[groupId]), not on a separate page.
export default function Deprecated() {
  redirect("/dashboard/groups");
}
