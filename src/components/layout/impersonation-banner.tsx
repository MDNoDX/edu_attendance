"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { stopImpersonation } from "@/app/actions/admin";

/** Shown across the teacher dashboard only while a SUPER_ADMIN is "logged in as" this teacher. */
export function ImpersonationBanner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStop() {
    setLoading(true);
    try {
      const res = await stopImpersonation();
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Xatolik yuz berdi.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>Siz hozir o&apos;qituvchi nomidan kirgansiz (admin rejimi).</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 bg-background" onClick={handleStop} disabled={loading}>
        {loading ? "Chiqilmoqda..." : "O'z hisobimga qaytish"}
      </Button>
    </div>
  );
}
