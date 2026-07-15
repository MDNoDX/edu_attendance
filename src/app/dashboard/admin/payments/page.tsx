import { redirect } from "next/navigation";
// Removed: Admin role no longer exists. See /dashboard/payments.
export default function Deprecated() {
  redirect("/dashboard/payments");
}
