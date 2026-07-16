import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <StatGridSkeleton count={4} />
    </div>
  );
}
