"use client";

import { useState } from "react";
import { Menu, Bell } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

interface DashboardShellProps {
  fullName: string;
  username: string;
  children: React.ReactNode;
}

export function DashboardShell({ fullName, username, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="glass sticky top-0 z-40 flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menyu">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Bildirishnomalar">
              <Bell className="h-[1.1rem] w-[1.1rem]" />
            </Button>
            <ThemeToggle />
            <UserMenu fullName={fullName} username={username} />
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 sm:p-6 animate-in fade-in-0">{children}</main>
      </div>
    </div>
  );
}
