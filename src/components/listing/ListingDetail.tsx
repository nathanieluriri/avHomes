import Link from "next/link";
import { ChevronRight, Check, ArrowUpRight } from "lucide-react";
import type { Property } from "@/lib/types";
import {
  BUILD_STAGE_LABELS,
  estateSummary,
  formatPrice,
  isEstate,
  listingLabel,
  TITLE_DOCUMENT_LABELS,
  TITLE_DOCUMENT_SHORT,
} from "@/lib/data";
import PropertyCard from "@/components/PropertyCard";
import Reveal from "@/components/Reveal";
import Gallery from "@/components/Gallery";
import SpecGrid from "@/components/SpecGrid";
import AgentPanel from "@/components/AgentPanel";
import EstateOptions from "@/components/listing/EstateOptions";
import PaymentPlanCard from "@/components/listing/PaymentPlanCard";
import { RentTerms } from "@/components/listing/ListingFacts";
import { EnquiryOptionProvider } from "@/components/listing/EnquiryOption";
import { availabilityLine } from "@/components/listing/estate-text";

/**
 * A listing's page, below the navbar. Data in, markup out, no reads of its own,
 * so the live page and the admin preview render exactly the same thing.
 */
export default function ListingDetail({ property, similar }: { property: Property; similar: Property[] }) {
  const estate = isEstate(property.type);
  const summary = estate ? estateSummary(property.prototypes) : null;
  const heroPriceMinor = summary ? summary.fromMinor : property.priceMinor;
  // A sold out estate already says so in the chip above the title.
  const heroAvailability = summary && !summary.soldOut ? availabilityLine(summary) : null;
  const titleDocument = property.listingType === "sale" ? property.titleDocument : null;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    property.address
  )}`;

  return (
    <>
      {/* The breadcrumb sits inside the hero, directly under the sticky navbar,
          so the page opens on the listing rather than on a band of white. */}
      <section className="border-b border-mist-200 bg-mist-50">
        <nav
          aria-label="Breadcrumb"
          className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto whitespace-nowrap px-6 pt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:pt-8 lg:px-10"
        >
          <Link href="/" className="shrink-0 transition-colors hover:text-wine-600">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <Link href="/listings" className="shrink-0 transition-colors hover:text-wine-600">
            Listings
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <span className="truncate text-plum-950">{property.title}</span>
        </nav>

        <div className="mx-auto max-w-7xl px-6 pb-10 pt-6 sm:pb-14 sm:pt-8 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-wine-50 px-3.5 py-1.5 text-xs font-semibold text-wine-700">
                {summary?.soldOut ? "Sold out" : listingLabel(property.listingType, property.status)}
              </span>
              <span className="inline-flex items-center rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-semibold text-plum-950">
                {property.type}
              </span>
              {estate && property.buildStage && (
                <span className="inline-flex items-center rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-semibold text-plum-950">
                  {BUILD_STAGE_LABELS[property.buildStage]}
                </span>
              )}
              {titleDocument && (
                <span
                  title={TITLE_DOCUMENT_LABELS[titleDocument]}
                  className="inline-flex items-center rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-semibold text-plum-950"
                >
                  <span className="sr-only">Title document: </span>
                  {TITLE_DOCUMENT_SHORT[titleDocument]}
                </span>
              )}
            </div>

            <h1 className="mt-5 text-4xl font-bold leading-[0.98] tracking-tight text-plum-950 sm:text-5xl lg:text-6xl">
              {property.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg font-medium text-muted-foreground sm:text-xl">
              {property.tagline}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{property.address}</p>
          </div>

          {heroPriceMinor > 0 && (
            <div className="mt-8 shrink-0 border-t border-mist-200 pt-6 lg:mt-0 lg:border-t-0 lg:pt-0 lg:text-right">
              {estate && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From</p>
              )}
              <p className="break-words text-3xl font-bold leading-none tracking-tight text-plum-950 sm:text-4xl">
                {formatPrice(heroPriceMinor, {
                  listingType: property.listingType,
                  rentPeriod: property.rentPeriod,
                  currency: property.currency,
                })}
              </p>
              {heroAvailability && (
                <p className="mt-3 text-sm font-semibold text-wine-700">{heroAvailability}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:px-10">
        <Reveal>
          <Gallery images={property.images} title={property.title} />
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-24">
        {/* Shares the option a buyer asks about between the Options list and the agent panel. */}
        <EnquiryOptionProvider>
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

              {estate ? (
                <>
                  {property.prototypes.length > 0 && (
                    <Reveal delay={80}>
                      <div className="mt-12">
                        <EstateOptions property={property} />
                      </div>
                    </Reveal>
                  )}
                  {property.paymentPlan && (
                    <Reveal delay={80}>
                      <div className="mt-12">
                        <PaymentPlanCard property={property} />
                      </div>
                    </Reveal>
                  )}
                </>
              ) : (
                <Reveal delay={80}>
                  <div className="mt-12 space-y-4">
                    <RentTerms property={property} />
                    <SpecGrid property={property} />
                  </div>
                </Reveal>
              )}

              {property.amenities.length > 0 && (
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
              )}

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
        </EnquiryOptionProvider>
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
