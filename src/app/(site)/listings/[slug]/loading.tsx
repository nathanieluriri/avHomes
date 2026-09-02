import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      {/* Breadcrumb bar */}
      <div className="border-b border-mist-200 bg-white pb-3 pt-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <Skeleton className="h-3 w-56" />
        </div>
      </div>

      {/* Title block */}
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-10">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-[30px] w-24 rounded-full" />
              <Skeleton className="h-[30px] w-20 rounded-full" />
            </div>
            <Skeleton className="mt-5 h-11 w-full max-w-xl sm:h-14" />
            <Skeleton className="mt-4 h-6 w-full max-w-md" />
            <Skeleton className="mt-3 h-4 w-64 max-w-full" />
          </div>

          <div className="mt-8 shrink-0 border-t border-mist-200 pt-6 lg:mt-0 lg:border-t-0 lg:pt-0">
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
      </section>

      {/* Gallery mosaic, mirrors Gallery's grid gap-3 rounded-2xl tiles */}
      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:px-10">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[300px] w-full rounded-2xl md:h-[560px]" />
          <div
            className="grid gap-3 md:h-[560px]"
            style={{ gridTemplateRows: "repeat(3, 1fr)" }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[220px] w-full rounded-2xl md:h-auto" />
            ))}
          </div>
        </div>
      </section>

      {/* Two column body */}
      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div className="min-w-0">
            <div>
              <Skeleton className="h-8 w-40" />
              <div className="mt-4 space-y-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>

            {/* gap-px + bg-mist-200 mirrors SpecGrid's hairline cell grid */}
            <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-200 bg-mist-200 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center gap-2 bg-white px-4 py-7"
                >
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ))}
            </div>

            <div className="mt-12">
              <Skeleton className="h-8 w-32" />
              <div className="mt-5 flex flex-wrap gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-28 rounded-full" />
                ))}
              </div>
            </div>

            <div className="mt-12 rounded-2xl border border-mist-200 p-6 sm:p-8">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mt-3 h-4 w-72 max-w-full" />
              <Skeleton className="mt-5 h-16 w-full rounded-xl" />
              <Skeleton className="mt-5 h-11 w-40 rounded-full" />
            </div>
          </div>

          <div>
            <div className="rounded-2xl border border-mist-200 p-6 sm:p-7">
              <Skeleton className="h-[30px] w-20 rounded-full" />
              <Skeleton className="mt-4 h-10 w-48" />
              <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-6">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="mt-6 h-12 w-full rounded-full" />
              <Skeleton className="mt-3 h-12 w-full rounded-full" />
            </div>
            <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
          </div>
        </div>
      </section>

      {/* Similar properties, card shell matches PropertyCard's card-soft radius */}
      <section className="border-t border-mist-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <Skeleton className="h-8 w-56" />
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-mist-200 bg-white">
                <Skeleton className="aspect-[4/3] w-full" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
