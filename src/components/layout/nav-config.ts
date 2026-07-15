import {
  LayoutDashboard,
  Users,
  Layers,
  BookOpen,
  CalendarDays,
  BarChart3,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Ustoz Akademiyasi has a single self-service role: every logged-in account
// is a teacher managing only their own groups, students and money. One flat
// nav list — no role branching.
export function getNavItems(): NavItem[] {
  return [
    { label: "Bosh sahifa", href: "/dashboard", icon: LayoutDashboard },
    { label: "Guruhlarim", href: "/dashboard/groups", icon: Layers },
    { label: "Studentlarim", href: "/dashboard/students", icon: Users },
    { label: "Kurslarim", href: "/dashboard/courses", icon: BookOpen },
    { label: "Jadval", href: "/dashboard/schedule", icon: CalendarDays },
    { label: "To'lov va hisobot", href: "/dashboard/reports", icon: BarChart3 },
    { label: "Profil", href: "/dashboard/profile", icon: UserCircle },
  ];
}
