import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import {
  getProperties,
  getPropertyDetail,
  estateSummary,
  formatPrice,
  isEstate,
  listingSeoDescription,
  listingSeoTitle,
} from "@/lib/data";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import JsonLd from "@/components/JsonLd";
import ListingDetail from "@/components/listing/ListingDetail";

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

  const estate = isEstate(property.type);
  const summary = estate ? estateSummary(property.prototypes) : null;
  const price = formatPrice(summary ? summary.fromMinor : property.priceMinor, property);
  // Written in the editor's search listing card, or assembled from the facts.
  const title = listingSeoTitle(property);
  const description = listingSeoDescription(property);
  /*
   * The CITY here, not the full trail. This is read in a chat list where the
   * line is truncated, so it carries the two things that decide whether anybody
   * opens it. A written search title wins, since somebody chose those words.
   */
  const headline =
    property.seoTitle.trim() ||
    `${[property.title, property.city].filter(Boolean).join(", ")}${estate ? `, from ${price}` : ` at ${price}`}`;

  const canonical = `/listings/${property.slug}`;
  const hero = property.images[0] ? absolute(property.images[0]) : null;

  return {
    title,
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
  // Reached through an address the listing used to have: send the reader, and
  // the link's search ranking, to the current one.
  if (property.slug && property.slug !== slug) permanentRedirect(`/listings/${property.slug}`);
  const estate = isEstate(property.type);
  const summary = estate ? estateSummary(property.prototypes) : null;

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
  const canonical = absolute(`/listings/${property.slug}`);
  const availability = summary?.soldOut
    ? "https://schema.org/SoldOut"
    : property.status === "live"
      ? "https://schema.org/InStock"
      : property.status === "under-offer"
        ? "https://schema.org/LimitedAvailability"
        : "https://schema.org/SoldOut";
  /*
   * An estate is several offers at once, so it is an AggregateOffer over its
   * options, and it states no bedroom count or floor size: its stored ones are
   * the largest available option's, which describe no single home on the page.
   */
  const offers = summary
    ? {
        "@type": "AggregateOffer",
        lowPrice: summary.fromMinor / 100,
        highPrice: summary.toMinor / 100,
        offerCount: summary.availableCount > 0 ? summary.availableCount : summary.count,
        priceCurrency: property.currency,
        availability,
      }
    : {
        "@type": "Offer",
        price: property.priceMinor / 100,
        priceCurrency: property.currency,
        availability,
      };
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
    ...(estate
      ? {}
      : {
          numberOfBedrooms: property.bedrooms,
          numberOfBathroomsTotal: property.bathrooms,
          floorSize: { "@type": "QuantitativeValue", value: property.areaSqft, unitCode: "FTK" },
        }),
    offers,
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
      <ListingDetail property={property} similar={similar} />
    </>
  );
}
