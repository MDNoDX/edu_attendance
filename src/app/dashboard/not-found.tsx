import Link from "next/link";
import { SearchX, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Branded 404 for anything inside /dashboard (e.g. a deleted or
 * not-yours group id) — replaces Next.js's raw default 404 page, which
 * looked jarringly out of place next to the rest of the app.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Topilmadi</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Siz izlagan sahifa yoki ma&apos;lumot topilmadi, o&apos;chirilgan yoki sizga tegishli emas.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">
          <Home className="h-4 w-4" /> Bosh sahifaga qaytish
        </Link>
      </Button>
    </div>
  );
}
