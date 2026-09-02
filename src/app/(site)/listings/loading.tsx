import PropertyCardSkeleton from "@/components/PropertyCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListingsLoading() {
  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-6 py-14 lg:px-10 lg:py-20">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="mt-4 h-11 w-[min(28rem,90%)] rounded-xl" />
          <Skeleton className="mt-4 h-5 w-[min(22rem,80%)] rounded-full" />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <Skeleton className="h-16 w-full rounded-2xl lg:h-[68px] lg:rounded-full" />

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-24 rounded-full" />
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
