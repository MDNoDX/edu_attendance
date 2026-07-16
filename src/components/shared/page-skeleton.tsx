import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

/**
 * Route-level loading skeletons, used by src/app/**\/loading.tsx files.
 *
 * Every dashboard page is a Server Component that awaits a DB fetch before
 * rendering — without a `loading.tsx`, Next.js shows nothing extra during
 * that fetch (the previous page just sits there until the new one is fully
 * ready), which reads as unresponsive on a slow connection or a heavier
 * query. These give instant visual feedback that navigation registered,
 * shaped roughly like the real page so there's no layout jump once the
 * actual content arrives.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Generic list-page loading skeleton: header + optional stat row + table. */
export function ListPageSkeleton({
  statCount = 0,
  rows = 6,
  cols = 5,
}: {
  statCount?: number;
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {statCount > 0 && <StatGridSkeleton count={statCount} />}
      <div className="rounded-xl border border-border bg-card p-4">
        <TableSkeleton rows={rows} cols={cols} />
      </div>
    </div>
  );
}

/** Detail-page loading skeleton (group detail / attendance journal): header + a grid-shaped block. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="flex gap-3">
            <Skeleton className="h-8 w-40 shrink-0" />
            {Array.from({ length: 6 }).map((_, c) => (
              <Skeleton key={c} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
