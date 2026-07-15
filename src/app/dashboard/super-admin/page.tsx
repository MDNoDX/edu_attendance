import { redirect } from "next/navigation";
// Removed: Super Admin role no longer exists. See /dashboard.
export default function Deprecated() {
  redirect("/dashboard");
}
