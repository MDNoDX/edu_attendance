"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function AdminShell({ fullName, children }: { fullName: string; children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">NadirEdu — Super Admin</p>
            <p className="text-xs leading-tight text-muted-foreground">{fullName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Chiqish" onClick={handleLogout} disabled={loading}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="space-y-6 p-4 sm:p-6 animate-in fade-in-0">{children}</main>
    </div>
  );
}
