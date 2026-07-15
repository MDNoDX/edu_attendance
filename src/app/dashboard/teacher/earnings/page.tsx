import { redirect } from "next/navigation";
// Merged into /dashboard/payments (earnings summary + payments table together).
export default function Deprecated() {
  redirect("/dashboard/payments");
}
