import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Check, ArrowUpRight } from "lucide-react";

import {
  getProperties,
  getPropertyDetail,
  formatPrice,
  listingLabel,
} from "@/lib/data";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import JsonLd from "@/components/JsonLd";
import PropertyCard from "@/components/PropertyCard";
import Reveal from "@/components/Reveal";
import Gallery from "@/components/Gallery";
import SpecGrid from "@/components/SpecGrid";
import AgentPanel from "@/components/AgentPanel";

export async function generateStaticParams() {
  const properties = await getProperties();
  return properties
    .filter((property): property is typeof property & { slug: string } => property.slug !== null)
    .map((property) => ({ slug: property.slug }));
}

/** Absolute, because an og:image or a structured-data URL resolves nothing. */
function absolute(path: string): string {
  return path.startsWith("http") ? path : `${SITE_DOMAIN}${path}`;
}

/**
 * What a listing says about itself when it is not being looked at directly.
 *
 * This used to be a title and nothing else. No og tags, no twitter card, no
 * canonical, so a listing forwarded on WhatsApp arrived as a bare blue link
 * with no photograph, no price and no address, which is most of how property
 * moves here. The description was inherited from the root layout, so all
 * twenty-odd listings and the homepage shared one sentence.
 *
 * The shape follows the post route, which already did all of this. The one
 * difference is what goes in the description: a post has an excerpt somebody
 * wrote, and a listing has facts, so it is assembled from the ones a reader
 * decides on. Price first, because that is the question.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getPropertyDetail(slug);
  // Empty object lets the page itself produce the 404.
  if (!detail) return {};
  const { property } = detail;

  const price = formatPrice(property.priceMinor, property);
  const deal = listingLabel(property.listingType, property.status);
  /*
   * `location` is authored as a whole trail, "Banana Island, Ikoyi, Lagos", and
   * on every row it already ends with the city. Appending the city produced
   * "Banana Island, Ikoyi, Lagos, Lagos", so it is added only when genuinely
   * absent rather than assumed missing.
   */
  const where = property.city && !property.location.includes(property.city)
    ? [property.location, property.city].filter(Boolean).join(", ")
    : property.location;
  const description = [
    `${deal} at ${price}.`,
    `${property.bedrooms} bed, ${property.bathrooms} bath ${property.type.toLowerCase()} in ${where}.`,
    property.tagline,
  ]
    .filter(Boolean)
    .join(" ");
  /*
   * The CITY here, not the full trail. This is read in a chat list where the
   * line is truncated, so it carries the two things that decide whether anybody
   * opens it, and the title usually names the neighbourhood already.
   */
  const headline = `${[property.title, property.city].filter(Boolean).join(", ")} at ${price}`;

  const canonical = `/listings/${property.slug}`;
  const hero = property.images[0] ? absolute(property.images[0]) : null;

  return {
    title: property.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      // Carries the price, because a forwarded link is read in a chat list
      // where the title is often the only line that survives.
      title: headline,
      description,
      url: absolute(canonical),
      siteName: SITE_NAME,
      ...(hero ? { images: [{ url: hero, alt: property.title }] } : {}),
    },
    twitter: {
      card: hero ? "summary_large_image" : "summary",
      title: headline,
      description,
      ...(hero ? { images: [hero] } : {}),
    },
  };
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // One request: the detail route answers with its similar listings, so the
  // page does not pay a second round trip to render the strip at the bottom.
  const detail = await getPropertyDetail(slug);
  /*
   * DO NOT ADD A `loading.tsx` AT THIS SEGMENT OR AT `/listings`.
   *
   * Either one wraps this page in a Suspense boundary, and Next commits the
   * HTTP status the moment it flushes that boundary's shell. The `notFound()`
   * below then runs too late to be anything but streamed markup, and the
   * response has already gone out as 200.
   *
   * Measured, with a slug that does not exist:
   *
   *   [slug]/loading.tsx   /listings/loading.tsx   status
   *   present              present                 200
   *   removed              present                 200
   *   present              removed                 200
   *   removed              removed                 404
   *
   * Both had to go. This is not only about unknown slugs: an archived or
   * trashed listing takes the same path, because the public read excludes it
   * and returns null, so every one of them answered 200 forever and stayed
   * indexable after being taken down.
   *
   * The cost is that neither page has a skeleton any more. If that needs to
   * come back, the boundary has to sit INSIDE this page around something that
   * is not the existence check, or the two routes have to be split into
   * separate route groups so `/listings`'s boundary no longer encloses this one.
   */
  if (!detail) notFound();
  const { property, similar } = detail;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    property.address
  )}`;

  /*
   * RealEstateListing, not Product.
   *
   * Product plus Offer is the tempting shape because the price maps cleanly,
   * but it describes something with a stock level that ships, and it invites
   * rich results this page cannot honour. RealEstateListing is the type Google
   * documents for exactly this, and the fields it wants are ones the page is
   * already rendering: the address, the room counts, the floor area and the
   * price are all on screen a few lines below.
   *
   * `availability` follows the lifecycle rather than being hardcoded, so a
   * listing marked under offer or closed does not keep telling a crawler it is
   * for sale. That is the same class of bug as the archived listing that stayed
   * indexable, and getting it wrong here would put the lie in structured data
   * where a person cannot see it.
   */
  const price = formatPrice(property.priceMinor, property);
  const canonical = absolute(`/listings/${property.slug}`);
  const listingJsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    description: property.description || property.tagline,
    url: canonical,
    datePosted: property.publishedAt ? new Date(property.publishedAt).toISOString() : undefined,
    image: property.images.map(absolute),
    address: {
      "@type": "PostalAddress",
      streetAddress: property.address,
      addressLocality: property.city,
      addressCountry: "NG",
    },
    numberOfBedrooms: property.bedrooms,
    numberOfBathroomsTotal: property.bathrooms,
    floorSize: { "@type": "QuantitativeValue", value: property.areaSqft, unitCode: "FTK" },
    offers: {
      "@type": "Offer",
      price: property.priceMinor / 100,
      priceCurrency: property.currency,
      availability:
        property.status === "live"
          ? "https://schema.org/InStock"
          : property.status === "under-offer"
            ? "https://schema.org/LimitedAvailability"
            : "https://schema.org/SoldOut",
    },
  };

  /*
   * Matching the breadcrumb the page actually draws, three lines down. A
   * BreadcrumbList that disagrees with the visible trail is worse than none:
   * it is the one piece of structured data a reader can check by looking.
   */
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: "Listings", item: absolute("/listings") },
      { "@type": "ListItem", position: 3, name: property.title, item: canonical },
    ],
  };

  return (
    <>
      <JsonLd data={listingJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <nav
        aria-label="Breadcrumb"
        className="border-b border-mist-200 bg-white pb-3 pt-24"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto whitespace-nowrap px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:px-10">
          <Link href="/" className="shrink-0 transition-colors hover:text-wine-600">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <Link href="/listings" className="shrink-0 transition-colors hover:text-wine-600">
            Listings
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <span className="truncate text-plum-950">{property.title}</span>
        </div>
      </nav>

      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-wine-50 px-3.5 py-1.5 text-xs font-semibold text-wine-700">
                {listingLabel(property.listingType, property.status)}
              </span>
              <span className="inline-flex items-center rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-semibold text-plum-950">
                {property.type}
              </span>
            </div>

            <h1 className="mt-5 text-4xl font-bold leading-[0.98] tracking-tight text-plum-950 sm:text-5xl lg:text-6xl">
              {property.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg font-medium text-muted-foreground sm:text-xl">
              {property.tagline}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{property.address}</p>
          </div>

          <div className="mt-8 shrink-0 border-t border-mist-200 pt-6 lg:mt-0 lg:border-t-0 lg:pt-0 lg:text-right">
            <p className="break-words text-3xl font-bold leading-none tracking-tight text-plum-950 sm:text-4xl">
              {formatPrice(property.priceMinor, {
                listingType: property.listingType,
                rentPeriod: property.rentPeriod,
                currency: property.currency,
              })}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:px-10">
        <Reveal>
          <Gallery images={property.images} title={property.title} />
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div className="min-w-0">
            <Reveal>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
                  Overview
                </h2>
                <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-plum-950/80 sm:text-lg sm:leading-[1.75]">
                  {property.description}
                </p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="mt-12">
                <SpecGrid property={property} />
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="mt-12">
                <h2 className="text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
                  Amenities
                </h2>
                <div className="mt-5 flex flex-wrap gap-3">
                  {property.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="inline-flex items-center gap-2 rounded-full bg-mist-100 px-4 py-2 text-sm font-medium text-plum-950"
                    >
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-wine-600"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <div className="mt-12 rounded-2xl border border-mist-200 bg-white p-6 sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-plum-950 sm:text-2xl">
                  Location
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {property.address}
                </p>

                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-mist-200 px-7 py-3.5 text-sm font-semibold text-plum-950 transition-colors duration-200 hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
                >
                  Get directions
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal delay={80}>
            <AgentPanel property={property} />
          </Reveal>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="border-t border-mist-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
                Similar properties
              </h2>
            </Reveal>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((p, i) => (
                <Reveal key={p.id} delay={i * 90}>
                  <PropertyCard property={p} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
