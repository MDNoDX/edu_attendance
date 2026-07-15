import { redirect } from "next/navigation";
// Removed: system settings are now per-teacher profile settings. See /dashboard/profile.
export default function Deprecated() {
  redirect("/dashboard/profile");
}
