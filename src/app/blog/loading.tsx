import { Skeleton } from "@/components/ui/skeleton";

export default function BlogLoading() {
  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-6 py-14 lg:px-10 lg:py-20">
          <Skeleton className="h-4 w-20 rounded-full" />
          <Skeleton className="mt-4 h-11 w-[min(26rem,90%)] rounded-xl" />
          <Skeleton className="mt-4 h-5 w-[min(22rem,80%)] rounded-full" />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-24 rounded-full" />
          ))}
        </div>

        <div className="card-soft mt-12 grid gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-10 md:p-8">
          <Skeleton className="aspect-[16/10] w-full rounded-xl" />
          <div className="flex flex-col justify-center">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="mt-4 h-8 w-full rounded-lg" />
            <Skeleton className="mt-2 h-8 w-4/5 rounded-lg" />
            <Skeleton className="mt-4 h-4 w-full rounded-full" />
            <Skeleton className="mt-2 h-4 w-3/4 rounded-full" />
            <div className="mt-8 flex items-center gap-3 border-t border-mist-200 pt-6">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40 rounded-full" />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-mist-200 bg-white">
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="p-5">
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
                <div className="mt-4 flex items-center gap-3 border-t border-mist-200 pt-4">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
