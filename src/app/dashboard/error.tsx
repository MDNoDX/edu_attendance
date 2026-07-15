"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches any uncaught error thrown while rendering a dashboard route (e.g.
 * a transient DB hiccup) and shows a friendly, in-brand retry screen instead
 * of Next.js's raw default error page — which looked like the app randomly
 * kicked the teacher out to an unrelated blank screen.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Nimadir xato ketdi</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sahifani yuklashda vaqtinchalik xatolik yuz berdi. Iltimos, qayta urinib ko&apos;ring.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>
          <RotateCw className="h-4 w-4" /> Qayta urinish
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="h-4 w-4" /> Bosh sahifa
          </Link>
        </Button>
      </div>
    </div>
  );
}
