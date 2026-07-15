import { redirect } from "next/navigation";
// Routes flattened: this page now lives at /dashboard. Safe to delete this
// entire src/app/dashboard/teacher directory once you sync locally.
export default function Deprecated() {
  redirect("/dashboard");
}
