import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import JsonLd from "@/components/JsonLd";
import ListingGrid from "@/components/ListingGrid";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import { getListingUniverse } from "@/lib/data";
import {
  fromPriceLabel,
  listingsIn,
  nearbyPlaces,
  placesWithStock,
  type PlaceSummary,
} from "@/lib/places";

/**
 * One place, and everything on the market in it.
 *
 * WHY THIS EXISTS. Property search starts with a place name, and the site had no
 * page that answered one. "Houses for sale in Lekki" landed either on
 * `/listings`, which is about everywhere, or on one property, which is about one
 * house. A filtered URL is not the answer either: `/listings?q=Lekki` is
 * canonicalised to `/listings` on purpose, so by design it can never rank.
 *
 * EVERY PAGE HERE HAS STOCK ON IT. The slugs come from the listings rather than
 * from the typeahead universe in `locations.ts`, so there is no way to reach a
 * page for a place the company has nothing in. See `placesWithStock`.
 *
 * `/listings/in/...` rather than `/listings/...`, because `/listings/[slug]` is
 * already a property. Two dynamic segments cannot be siblings, and a place
 * competing with a listing for one path is a bug waiting on the first estate
 * somebody names Lekki.
 */

/*
 * Matching LIST_REVALIDATE, which is what the read inside costs anyway. Written
 * as a literal because Next reads this value statically and cannot follow an
 * import to find it.
 */
export const revalidate = 300;

export async function generateStaticParams() {
  const places = placesWithStock(await getListingUniverse());
  return places.map((place) => ({ place: place.slug }));
}

async function load(slug: string) {
  const properties = await getListingUniverse();
  const all = placesWithStock(properties);
  const place = all.find((p) => p.slug === slug) ?? null;
  if (place === null) return null;
  return { all, place, listings: listingsIn(properties, slug) };
}

/** "For Sale And Rent In", or only the half of it that is true. */
function offer(place: PlaceSummary): string {
  if (place.forSale > 0 && place.forRent > 0) return "For Sale And Rent In";
  if (place.forSale > 0) return "For Sale In";
  return "To Rent In";
}

/** "Lekki, Lagos", or just the city when there is nothing above it. */
function where(place: PlaceSummary): string {
  return place.within === "" ? place.name : `${place.name}, ${place.within}`;
}


/** Sentence case for the title tag, where "For Sale And Rent In" reads as shouting. */
function offerPhrase(place: PlaceSummary): string {
  return offer(place).toLowerCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ place: string }>;
}): Promise<Metadata> {
  const { place: slug } = await params;
  const data = await load(slug);
  if (data === null) return { title: `Area not found | ${SITE_NAME}` };
  const { place } = data;

  const from = fromPriceLabel(place);
  const title = `Property ${offerPhrase(place)} ${where(place)} | ${SITE_NAME}`;
  const description = [
    `${place.count} ${place.count === 1 ? "property" : "properties"} in ${where(place)}:`,
    `${place.forSale} to buy and ${place.forRent} to rent.`,
    from ? `Sales from ${from}.` : "",
    "Each one checked on the ground before it went live, wherever you are buying from.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description,
    alternates: { canonical: `/listings/in/${place.slug}` },
    openGraph: { title, description, url: `${SITE_DOMAIN}/listings/in/${place.slug}` },
  };
}

export default async function PlacePage({ params }: { params: Promise<{ place: string }> }) {
  const { place: slug } = await params;
  const data = await load(slug);
  /*
   * A place with nothing in it gets the same answer as a place that never
   * existed, and that is the point rather than an omission. See the note on
   * `placesWithStock`.
   */
  if (data === null) notFound();
  const { all, place, listings } = data;

  const parent = all.find((other) => other.name === place.within) ?? null;
  const near = nearbyPlaces(all, place);
  const from = fromPriceLabel(place);

  /*
   * ONE ARRAY, drawn twice. The visible trail below and the BreadcrumbList
   * below that are built from this, because a BreadcrumbList that disagrees
   * with the trail on the page is the one piece of structured data a reader can
   * check by looking.
   */
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Listings", href: "/listings" },
    ...(parent ? [{ name: parent.name, href: `/listings/in/${parent.slug}` }] : []),
    { name: place.name, href: `/listings/in/${place.slug}` },
  ];

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${SITE_DOMAIN}${crumb.href}`,
    })),
  };

  /*
   * The listings, in the order the grid draws them, and only the ones with a web
   * address. A published listing always has a slug and a draft never reaches
   * this page, so the filter changes nothing today; it is what keeps that a fact
   * rather than an assumption the day the public read widens.
   */
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Property in ${where(place)}`,
    url: `${SITE_DOMAIN}/listings/in/${place.slug}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listings.length,
      itemListElement: listings
        .filter((p) => p.slug !== null)
        .map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_DOMAIN}/listings/${p.slug}`,
          name: p.title,
        })),
    },
  };

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={collectionJsonLd} />

      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-20">
          <nav aria-label="Breadcrumb" className="text-xs text-slate-600">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((crumb, i) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page" className="font-semibold text-plum-950">
                      {crumb.name}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="transition-colors hover:text-wine-600">
                      {crumb.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
              {place.within === "" ? "Listings" : place.within}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
              Property {offer(place)} <span className="accent">{place.name}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              {place.count} {place.count === 1 ? "property" : "properties"} in {where(place)}
              {place.forSale > 0 && place.forRent > 0
                ? `, ${place.forSale} to buy and ${place.forRent} to rent`
                : ""}
              .{from ? ` Sales from ${from}.` : ""} Every one was checked on the ground before it
              went live, which is the part you cannot do for yourself from another country.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <ListingGrid properties={listings} priorityCount={3} />

        {near.length > 0 && (
          <section className="mt-16 border-t border-mist-200 pt-10">
            <h2 className="text-lg font-bold tracking-tight text-plum-950">
              {place.within === "" ? `Areas of ${place.name}` : `Near ${place.name}`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Other places we have something on the market right now.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {near.map((other) => (
                <Link
                  key={other.slug}
                  href={`/listings/in/${other.slug}`}
                  className="rounded-full border border-mist-200 bg-white px-4 py-2 text-sm text-plum-950 transition-colors hover:border-wine-500 hover:text-wine-700"
                >
                  {other.name}
                  <span className="ml-1.5 text-slate-600">{other.count}</span>
                </Link>
              ))}
            </div>
            <Link
              href="/listings/in"
              className="mt-6 inline-flex text-sm font-semibold text-wine-600 transition-colors hover:text-wine-700"
            >
              Every area we cover
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
