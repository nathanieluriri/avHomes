import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Check, MapPin, ArrowUpRight } from "lucide-react";

import {
  getProperties,
  getPropertyBySlug,
  getPropertyDetail,
  formatPrice,
} from "@/lib/data";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);
  return { title: property ? `${property.title} | AVHomes` : "Property | AVHomes" };
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
  if (!detail) notFound();
  const { property, similar } = detail;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    property.address
  )}`;

  return (
    <>
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
                {property.status}
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
              {formatPrice(property.priceMinor, property.status, property.currency)}
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

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-slate-500/30 bg-mist-50 p-4">
                  <MapPin
                    className="mt-0.5 h-5 w-5 shrink-0 text-slate-500"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    An interactive map loads here once this listing is connected to
                    the live API. Use the link below to open the address in Google
                    Maps.
                  </p>
                </div>

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
