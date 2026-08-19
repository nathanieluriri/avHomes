import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors PropertyCard geometry so the grid does not jump when data lands. */
export default function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-mist-200 bg-white">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/2" />
        <div className="mt-4 flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-mist-200 pt-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}
