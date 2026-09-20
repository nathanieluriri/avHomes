import Link from "next/link";
import type { Metadata } from "next";

import JsonLd from "@/components/JsonLd";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import { getListingUniverse } from "@/lib/data";
import { fromPriceLabel, placesWithStock, type PlaceSummary } from "@/lib/places";

/**
 * Every place with something on the market, on one page.
 *
 * IT IS HERE FOR THE CRAWLER AS MUCH AS THE READER. Each place page links its
 * neighbours, but a tree whose branches only point sideways is one a crawler
 * walks into and out of once. This is the single page that names all of them, it
 * is linked from the listings index, and it is what turns a pile of place pages
 * into something with a route in from the front door.
 *
 * It also has to exist for a duller reason: `/listings/in` is two segments, and
 * without a page here it would resolve against `/listings/[slug]` and go looking
 * for a property whose web address is "in".
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Property by Area Across Nigeria | ${SITE_NAME}`,
  description:
    "Every city and neighbourhood AVHomes has property in right now, with what is on the market in each. Checked on the ground before it goes live, for buyers at home and abroad.",
  alternates: { canonical: "/listings/in" },
};

/** Cities first, then what sits inside them, so the list reads as a map. */
function group(places: PlaceSummary[]): { city: PlaceSummary; areas: PlaceSummary[] }[] {
  const cities = places.filter((p) => p.within === "");
  return cities.map((city) => ({
    city,
    // A place is in this city when it names it, or when it names something that
    // names it. Two levels is as deep as the stock goes: Banana Island sits in
    // Ikoyi, and Ikoyi sits in Lagos.
    areas: places.filter((p) => {
      if (p.within === "") return false;
      if (p.within === city.name) return true;
      const parent = places.find((other) => other.name === p.within);
      return parent?.within === city.name;
    }),
  }));
}

export default async function AreasPage() {
  const places = placesWithStock(await getListingUniverse());
  const groups = group(places);
  /* Named somewhere other than a city we drew: a listing whose trail stops at a
     neighbourhood nobody placed. Better loose at the bottom than missing. */
  const placed = new Set(groups.flatMap((g) => [g.city.slug, ...g.areas.map((a) => a.slug)]));
  const loose = places.filter((p) => !placed.has(p.slug));

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_DOMAIN}/` },
      { "@type": "ListItem", position: 2, name: "Listings", item: `${SITE_DOMAIN}/listings` },
      { "@type": "ListItem", position: 3, name: "Areas", item: `${SITE_DOMAIN}/listings/in` },
    ],
  };

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />

      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">Areas</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
            Where We Have <span className="accent">Property</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            {places.length} {places.length === 1 ? "place" : "places"} across Nigeria with
            something on the market today. Every one of them is a place we have actually been to,
            because nothing reaches this list until a listing in it does.
          </p>
          <Link
            href="/buying-from-abroad"
            className="mt-6 inline-flex text-sm font-semibold text-wine-600 transition-colors hover:text-wine-700"
          >
            Buying from another country?
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        {places.length === 0 ? (
          <div className="rounded-2xl border border-mist-200 bg-white px-6 py-10 text-center sm:py-12">
            <p className="text-sm font-semibold text-plum-950">
              Nothing is on the market right now.
            </p>
            <Link
              href="/listings"
              className="mt-4 inline-flex rounded-full bg-wine-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
            >
              Back to listings
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ city, areas }) => (
              <section key={city.slug} className="rounded-2xl border border-mist-200 bg-white p-6">
                <Link
                  href={`/listings/in/${city.slug}`}
                  className="text-lg font-bold tracking-tight text-plum-950 transition-colors hover:text-wine-700"
                >
                  {city.name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {city.count} {city.count === 1 ? "property" : "properties"}
                  {city.fromMinor > 0 ? `, from ${fromPriceLabel(city)}` : ""}
                </p>
                {areas.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {areas.map((area) => (
                      <li key={area.slug}>
                        <Link
                          href={`/listings/in/${area.slug}`}
                          className="inline-flex rounded-full border border-mist-200 px-3 py-1.5 text-[13px] text-plum-950 transition-colors hover:border-wine-500 hover:text-wine-700"
                        >
                          {area.name}
                          <span className="ml-1.5 text-slate-600">{area.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        {loose.length > 0 && (
          <section className="mt-12 border-t border-mist-200 pt-10">
            <h2 className="text-lg font-bold tracking-tight text-plum-950">Elsewhere</h2>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {loose.map((place) => (
                <li key={place.slug}>
                  <Link
                    href={`/listings/in/${place.slug}`}
                    className="inline-flex rounded-full border border-mist-200 bg-white px-3 py-1.5 text-[13px] text-plum-950 transition-colors hover:border-wine-500 hover:text-wine-700"
                  >
                    {place.name}
                    <span className="ml-1.5 text-slate-600">{place.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
