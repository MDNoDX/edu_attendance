import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { AttendanceJournal } from "@/components/features/attendance-journal";
import { TeacherReports } from "@/components/features/teacher-reports";
import { StudentsManager } from "@/components/features/students-manager";
import { getGroupAttendanceJournal } from "@/app/actions/attendance";
import { listStudents } from "@/app/actions/students";

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

  // Scoped to this group only — the group detail page is where a teacher
  // adds students right after creating a group, so the list here should
  // only ever show this group's own roster, not the full Studentlarim list.
  const { students: groupStudents, total: groupStudentTotal } = await listStudents({ groupId, pageSize: 200 });

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
          description={`${journal.group.subject ? journal.group.subject + " · " : ""}${journal.group.roomName}`}
          actions={
            <Badge variant={journal.group.status === "ACTIVE" ? "success" : "secondary"}>
              {journal.group.status === "ACTIVE" ? "Faol" : journal.group.status === "PAUSED" ? "To'xtatilgan" : "Tugagan"}
            </Badge>
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Studentlar {groupStudentTotal > 0 && `(${groupStudentTotal})`}
        </h2>
        <StudentsManager
          initialStudents={groupStudents as never}
          initialTotal={groupStudentTotal}
          groups={[{ id: journal.group.id, name: journal.group.name }]}
          lockGroupId={journal.group.id}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Davomat jurnali</h2>
        <AttendanceJournal
          groupId={groupId}
          initialMonth={monthKey}
          initialStudents={journal.students}
          initialSessions={journal.sessions}
          initialHasScheduleSlots={journal.hasScheduleSlots}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hisobot chiqarish</h2>
        <TeacherReports groups={[{ id: journal.group.id, name: journal.group.name }]} />
      </section>
    </div>
  );
}
