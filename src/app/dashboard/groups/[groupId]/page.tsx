import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { AttendanceJournal } from "@/components/features/attendance-journal";
import { TeacherReports } from "@/components/features/teacher-reports";
import { getGroupAttendanceJournal } from "@/app/actions/attendance";

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const now = new Date();

  let journal;
  try {
    journal = await getGroupAttendanceJournal(groupId, now);
  } catch (error) {
    // Only a genuinely missing/foreign group should 404. Any other error
    // (a transient DB hiccup, etc.) should NOT silently swap the whole page
    // to "not found" — that looks like the app randomly kicked the teacher
    // out to an unrelated screen. Let it bubble to the nearest error.tsx
    // boundary instead, which renders in place with a retry option.
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/groups"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Guruhlarim
        </Link>
        <PageHeader
          title={journal.group.name}
          description={`${journal.group.course.name} · ${journal.group.roomName}`}
          actions={
            <Badge variant={journal.group.status === "ACTIVE" ? "success" : "secondary"}>
              {journal.group.status === "ACTIVE" ? "Faol" : journal.group.status === "PAUSED" ? "To'xtatilgan" : "Tugagan"}
            </Badge>
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Davomat jurnali</h2>
        <AttendanceJournal
          groupId={groupId}
          initialMonth={monthKey}
          initialStudents={journal.students}
          initialSessions={journal.sessions}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hisobot chiqarish</h2>
        <TeacherReports groups={[{ id: journal.group.id, name: journal.group.name }]} />
      </section>
    </div>
  );
}
