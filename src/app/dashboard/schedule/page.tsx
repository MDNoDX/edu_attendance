import { PageHeader } from "@/components/shared/page-header";
import { ScheduleView } from "@/components/features/schedule-view";
import { getScheduleSessions } from "@/app/actions/schedule";
import { startOfDay, endOfDay } from "date-fns";

export default async function SchedulePage() {
  const now = new Date();
  const sessions = await getScheduleSessions({ from: startOfDay(now), to: endOfDay(now) });

  return (
    <div className="space-y-6">
      <PageHeader title="Jadval" description="Darslaringiz jadvali" />
      <ScheduleView initialSessions={sessions as never} />
    </div>
  );
}
