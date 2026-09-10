import Link from "next/link";
import { Home, Search } from "lucide-react";

import { getProperties } from "@/lib/data";
import PropertyCard from "@/components/PropertyCard";

/**
 * The body of the branded 404, which did not exist: Next's default rendered a black slab
 * reading "404 This page could not be found" under a light branded site, with
 * no header, no footer and no route back in. Its first `<title>` was the
 * homepage's, so a tab and most scrapers read it as the front page.
 *
 * It matters more here than on most sites, and it matters MORE THAN IT USED TO.
 * Listings come down constantly, and until the `loading.tsx` fix an unknown or
 * archived listing answered 200 with the not-found body streamed into it, so
 * almost nobody arrived here. Now they do: every stale WhatsApp forward for a
 * delisted property lands on this page, which makes it a real entry point
 * rather than an error screen.
 *
 * So it offers what somebody who wanted a specific house can use: the search,
 * and three properties that are actually available.
 *
 * A COMPONENT rather than the route itself, because Next needs two. A
 * `not-found.tsx` renders inside its own segment's layout, so the one under
 * `(site)` inherits the navbar and footer while the root one, which catches a
 * URL matching no route at all, does not. Both render this.
 */
export default async function NotFoundBody() {
  /*
   * `live` only, not everything public. Somebody who just followed a dead link
   * to a house is the last person to show an under-offer or a sold one.
   */
  const available = (await getProperties())
    .filter((p) => p.status === "live" && p.slug !== null)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
          404
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
          That page is not here
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          The link may be old, or the property may have been let or sold. Listings
          come down when they go, so a link shared a while ago can outlive the
          house it pointed at.
        </p>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/listings"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
          >
            <Search className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Search every listing
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-mist-200 px-7 py-3.5 text-sm font-semibold text-plum-950 transition-colors hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
          >
            <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to the homepage
          </Link>
        </div>
      </div>

      {available.length > 0 && (
        <section aria-labelledby="still-available" className="mt-16 lg:mt-20">
          <h2
            id="still-available"
            className="text-center text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl"
          >
            Still available
          </h2>
          <div className="mx-auto mt-8 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
