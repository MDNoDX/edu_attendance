"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Laptop, LogOut, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revokeMySession } from "@/app/actions/profile";
import { parseUserAgent, formatDateTime } from "@/lib/utils";

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

/**
 * "Faol qurilmalar" — shows every device/browser currently signed into this
 * account (see the Session model in prisma/schema.prisma) and lets the
 * teacher forget one they no longer recognize or trust, e.g. a shared
 * computer they logged into once. Purely informational/visibility-focused —
 * see the doc comment on SessionPayload.tokenId (src/lib/auth.ts) for why
 * "forgetting" a device here doesn't instantly kill that browser's session.
 */
export function ActiveSessions({ initialSessions }: { initialSessions: SessionRow[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onForget(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await revokeMySession(id);
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Qurilma ro'yxatdan olib tashlandi.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Faol qurilmalar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha kuzatilayotgan qurilmalar yo&apos;q.</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Laptop className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {parseUserAgent(s.userAgent)}
                    {s.isCurrent && (
                      <Badge variant="success" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Shu qurilma
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    So&apos;nggi faollik: {formatDateTime(s.lastSeenAt)}
                    {s.ip && ` · ${s.ip}`}
                  </p>
                </div>
              </div>
              {!s.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onForget(s.id)}
                  disabled={busyId === s.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" /> Chiqarish
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
