import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/shared/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
