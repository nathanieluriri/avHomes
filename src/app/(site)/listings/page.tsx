import { Suspense } from "react";
import Link from "next/link";
import { getProperties } from "@/lib/data";
import { ListingType, PropertyStatus, PropertyType } from "@/lib/types";
import PropertyCard from "@/components/PropertyCard";
import CategoryChips from "@/components/CategoryChips";
import FilterBar from "@/components/FilterBar";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Listings | AVHomes",
  description:
    "Every AVHomes property for sale and to rent across Lagos and Abuja, checked on site before it goes live.",
  /*
   * ONE canonical for every filter permutation. `?type=Villa`, `?beds=5` and
   * `?q=Lekki` all serve near-identical markup over a subset of the same rows,
   * and left uncanonicalised they compete with each other and with the bare
   * page for the same result.
   *
   * The filtered URLs stay perfectly usable and shareable. This says which one
   * of them is the page.
   */
  alternates: { canonical: "/listings" },
};

interface Search {
  q?: string;
  status?: string;
  type?: string;
  beds?: string;
}

/**
 * The URL keeps the reader's vocabulary ("For Sale"), the store keeps the
 * lifecycle and deal type split apart. This is the one place that translates
 * between them, so a listing's status can change shape without breaking a
 * bookmarked or indexed `/listings?status=...` link.
 *
 * A key with no match here (a typo, an old link) filters nothing: see the
 * unmatched branch below.
 */
// TODO(test): every URL_STATUS key returns only rows of its own (listingType, status) pair,
//   an unrecognised ?status= value returns the full list, and ?status=For+Sale is non-empty
//   against the fixtures. This is the regression that shipped; it needs a caller-level test.
const URL_STATUS: Record<string, { listingType: ListingType; status: PropertyStatus }> = {
  "For Sale": { listingType: "sale", status: "live" },
  "For Rent": { listingType: "rent", status: "live" },
  "Under Offer": { listingType: "sale", status: "under-offer" },
  "Let Agreed": { listingType: "rent", status: "under-offer" },
  Sold: { listingType: "sale", status: "closed" },
  Let: { listingType: "rent", status: "closed" },
};

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const all = await getProperties();

  const filtered = all.filter((p) => {
    if (sp.q) {
      const q = sp.q.toLowerCase();
      const haystack = `${p.title} ${p.location} ${p.city} ${p.address}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (sp.status) {
      const target = URL_STATUS[sp.status];
      // Unrecognised value: filter nothing rather than show an empty page.
      if (target && (p.listingType !== target.listingType || p.status !== target.status)) return false;
    }
    if (sp.type && p.type !== (sp.type as PropertyType)) return false;
    if (sp.beds && p.bedrooms < Number(sp.beds)) return false;
    return true;
  });

  // Buy and Rent are the same route with a different status, so the header
  // shifts to make each one read as its own destination.
  const header =
    sp.status === "For Sale"
      ? {
          eyebrow: "Buy",
          lead: "Homes For",
          accent: "Sale",
          sub: "Own it outright. Every sale listing is checked on site before it goes live.",
        }
      : sp.status === "For Rent"
        ? {
            eyebrow: "Rent",
            lead: "Homes To",
            accent: "Rent",
            sub: "Yearly rentals across Lagos and Abuja, with no hidden agency fees.",
          }
        : {
            eyebrow: "Listings",
            lead: "Find A Home That",
            accent: "Fits You",
            sub: "Everything we have on the market right now, to buy and to rent.",
          };

  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
            {header.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
            {header.lead} <span className="accent">{header.accent}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "property" : "properties"}. {header.sub}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <Suspense fallback={<div className="h-16" />}>
          <FilterBar />
        </Suspense>

        <div className="mt-8">
          <Suspense fallback={<div className="h-11" />}>
            <CategoryChips />
          </Suspense>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-mist-200 bg-white px-6 py-10 text-center sm:py-12">
            <p className="text-sm font-semibold text-plum-950">Nothing matches those filters right now.</p>
            <Link
              href="/listings"
              className="mt-4 inline-flex rounded-full bg-wine-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <Reveal key={p.id} delay={(i % 3) * 80}>
                <PropertyCard property={p} priority={i < 3} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
