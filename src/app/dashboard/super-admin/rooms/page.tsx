import { redirect } from "next/navigation";
// Removed: rooms are now a plain field on Group. See /dashboard/groups.
export default function Deprecated() {
  redirect("/dashboard/groups");
}
