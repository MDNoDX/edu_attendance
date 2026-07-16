import { ListPageSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return <ListPageSkeleton statCount={4} rows={8} cols={6} />;
}
