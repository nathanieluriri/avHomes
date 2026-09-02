import { Suspense } from "react";
import Link from "next/link";
import { getProperties } from "@/lib/data";
import { PropertyStatus, PropertyType } from "@/lib/types";
import PropertyCard from "@/components/PropertyCard";
import CategoryChips from "@/components/CategoryChips";
import FilterBar from "@/components/FilterBar";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Listings | AVHomes",
};

interface Search {
  q?: string;
  status?: string;
  type?: string;
  beds?: string;
}

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
    if (sp.status && p.status !== (sp.status as PropertyStatus)) return false;
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            {header.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
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
          <div className="mt-12 rounded-2xl border border-mist-200 bg-white px-8 py-16 text-center">
            <p className="text-lg font-semibold text-navy-950">No matches yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Nothing fits those filters right now. Try widening the search or clearing
              a filter or two.
            </p>
            <Link
              href="/listings"
              className="mt-6 inline-flex rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
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
