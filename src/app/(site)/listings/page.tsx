import { Suspense } from "react";
import Link from "next/link";
import { estateSummary, getEstates, getProperties, isEstate, prototypeLabel } from "@/lib/data";
import { ESTATE_TYPE, ListingType, Property, PropertyStatus, PropertyType } from "@/lib/types";
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
  const [latest, estateRows] = await Promise.all([getProperties(), getEstates()]);
  // The main read is the newest 48 of everything, so estates past it come from their own read.
  const seen = new Set(latest.map((p) => p.id));
  const all = [...latest, ...estateRows.filter((p) => !seen.has(p.id))];

  const filtered = all.filter((p) => {
    if (sp.q) {
      const q = sp.q.toLowerCase();
      // An estate's options are searchable by name, so "plot" or "3 bedroom" finds the estate.
      const options = p.prototypes.map(prototypeLabel).join(" ");
      const haystack = `${p.title} ${p.location} ${p.city} ${p.address} ${options}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (sp.status) {
      const target = URL_STATUS[sp.status];
      // Unrecognised value: filter nothing rather than show an empty page.
      if (target && (p.listingType !== target.listingType || p.status !== target.status)) return false;
    }
    if (sp.type && p.type !== (sp.type as PropertyType)) return false;
    // An estate counts its largest AVAILABLE option, read live like its card, so "3+ beds"
    // finds one still offering a 3 bed and not one whose only 4 bed has sold.
    const beds = isEstate(p.type) ? estateSummary(p.prototypes).bedroomsMax : p.bedrooms;
    if (sp.beds && beds < Number(sp.beds)) return false;
    return true;
  });

  /*
   * With no type chosen the page reads as two sets, estates first, because an
   * estate is a development with several homes inside it and a card for one
   * does not compare like for like with a card for a single house. A chosen
   * type is already one set, so it gets one grid.
   */
  const estates = filtered.filter((p) => isEstate(p.type));
  const homes = filtered.filter((p) => !isEstate(p.type));
  const estateOnly = sp.type === ESTATE_TYPE;
  const grouped = !sp.type && estates.length > 0;
  const one = filtered.length === 1;
  const noun = estateOnly ? (one ? "estate" : "estates") : one ? "property" : "properties";

  // Buy and Rent are the same route with a different status, so the header
  // shifts to make each one read as its own destination.
  const header = estateOnly
    ? {
        eyebrow: "Estates",
        lead: "Land And New Homes In",
        accent: "Planned Estates",
        sub: "Plots and house types inside one development, each one priced on its own.",
      }
    : sp.status === "For Sale"
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
            {filtered.length} {noun}. {header.sub}
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
        ) : grouped ? (
          <>
            <ListingGroup
              id="estates"
              title="Estates"
              count={estates.length}
              sub="Developments with several homes or plots inside, each priced on its own."
              properties={estates}
              priorityCount={3}
              more={{ href: onlyEstatesHref(sp), label: "Estates only" }}
              className="mt-10"
            />
            {homes.length > 0 && (
              <ListingGroup
                id="homes"
                title="Homes"
                count={homes.length}
                sub="Houses and apartments, each a listing of its own."
                properties={homes}
                priorityCount={Math.max(0, 3 - estates.length)}
                className="mt-16"
              />
            )}
          </>
        ) : (
          <ListingGrid properties={filtered} priorityCount={3} className="mt-10" />
        )}
      </div>
    </>
  );
}

function ListingGrid({
  properties,
  priorityCount,
  className,
}: {
  properties: Property[];
  priorityCount: number;
  className: string;
}) {
  return (
    <div className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {properties.map((p, i) => (
        <Reveal key={p.id} delay={(i % 3) * 80}>
          <PropertyCard property={p} priority={i < priorityCount} />
        </Reveal>
      ))}
    </div>
  );
}

function ListingGroup({
  id,
  title,
  count,
  sub,
  properties,
  priorityCount,
  more,
  className,
}: {
  id: string;
  title: string;
  count: number;
  sub: string;
  properties: Property[];
  priorityCount: number;
  more?: { href: string; label: string };
  className: string;
}) {
  return (
    <section aria-labelledby={`group-${id}`} className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-mist-200 pb-4">
        <div className="min-w-0">
          <h2
            id={`group-${id}`}
            className="flex items-center gap-3 text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl"
          >
            {title}
            <span className="inline-flex items-center rounded-full bg-mist-100 px-3 py-1 text-xs font-semibold text-plum-950">
              {count}
            </span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
        </div>
        {more && (
          <Link
            href={more.href}
            className="inline-flex shrink-0 items-center rounded-full border border-mist-200 px-5 py-2.5 text-sm font-semibold text-plum-950 transition-colors duration-200 hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
          >
            {more.label}
          </Link>
        )}
      </div>
      <ListingGrid properties={properties} priorityCount={priorityCount} className="mt-8" />
    </section>
  );
}

/** The current search narrowed to estates, keeping whatever else was chosen. */
function onlyEstatesHref(sp: Search): string {
  const next = new URLSearchParams();
  if (sp.q) next.set("q", sp.q);
  if (sp.status) next.set("status", sp.status);
  if (sp.beds) next.set("beds", sp.beds);
  next.set("type", ESTATE_TYPE);
  return `/listings?${next.toString()}`;
}
