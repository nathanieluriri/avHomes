"use client";

import { Check } from "lucide-react";
import {
  BUILD_STAGE_LABELS,
  TITLE_DOCUMENT_LABELS,
  TITLE_DOCUMENT_SHORT,
  estateSummary,
  formatPrice,
  isEstate,
  listingLabel,
  type Property,
} from "@avhomes/contracts";
import { ChatProvider } from "@/lib/chat/provider";
import PropertyCard from "@/components/PropertyCard";
import Gallery from "@/components/Gallery";
import SpecGrid from "@/components/SpecGrid";
import EstateOptions from "@/components/listing/EstateOptions";
import PaymentPlanCard from "@/components/listing/PaymentPlanCard";
import { RentTerms } from "@/components/listing/ListingFacts";
import { EnquiryOptionProvider } from "@/components/listing/EnquiryOption";
import { availabilityLine } from "@/components/listing/estate-text";

const CHIP = "inline-flex items-center rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-semibold text-plum-950";

/**
 * The unsaved draft, drawn with the public site's own components.
 *
 * A picture, not a page: `inert` takes every link and button out of reach, so
 * the card's link and "Ask about this" cannot navigate away from the editor.
 * The chat provider is only there because the options list reads it.
 */
export function ListingPreview({ property }: { property: Property }) {
  const estate = isEstate(property.type);
  const summary = estate ? estateSummary(property.prototypes) : null;
  const heroPriceMinor = summary ? summary.fromMinor : property.priceMinor;
  const heroAvailability = summary && !summary.soldOut ? availabilityLine(summary) : null;
  const titleDocument = property.listingType === "sale" ? property.titleDocument : null;
  const address = property.slug ? `/listings/${property.slug}` : "No web address until it is published";
  // A draft is previewed as it will read once published.
  const status = property.status === "draft" || property.status === "archived" ? "live" : property.status;

  return (
    <ChatProvider>
      <div inert className="space-y-6">
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            In the listings grid
          </p>
          <div className="max-w-sm">
            {property.images[0] ? (
              <PropertyCard property={property} />
            ) : (
              <p className="rounded-2xl border-2 border-dashed border-mist-200 bg-mist-50 p-6 text-[13px] text-slate-600">
                The card needs a photo. Add one below and it appears here.
              </p>
            )}
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            The listing page
          </p>
          <div className="overflow-hidden rounded-2xl border border-mist-200 bg-white">
            <div className="flex items-center gap-2 border-b border-mist-200 bg-mist-50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-mist-200" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-mist-200" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-mist-200" aria-hidden="true" />
              <span className="ml-2 truncate rounded-md bg-white px-3 py-1 text-xs text-slate-600">{address}</span>
            </div>

            <div className="border-b border-mist-200 bg-mist-50 px-6 py-8 lg:flex lg:items-end lg:justify-between lg:gap-10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-wine-50 px-3.5 py-1.5 text-xs font-semibold text-wine-700">
                    {summary?.soldOut ? "Sold out" : listingLabel(property.listingType, status)}
                  </span>
                  <span className={CHIP}>{property.type}</span>
                  {estate && property.buildStage && <span className={CHIP}>{BUILD_STAGE_LABELS[property.buildStage]}</span>}
                  {titleDocument && (
                    <span title={TITLE_DOCUMENT_LABELS[titleDocument]} className={CHIP}>
                      {TITLE_DOCUMENT_SHORT[titleDocument]}
                    </span>
                  )}
                </div>
                <h2 className="mt-5 text-3xl font-bold leading-[0.98] tracking-tight text-plum-950 sm:text-4xl">
                  {property.title || "Untitled listing"}
                </h2>
                {property.tagline && (
                  <p className="mt-3 max-w-2xl text-lg font-medium text-muted-foreground">{property.tagline}</p>
                )}
                {property.address && <p className="mt-2 text-sm text-muted-foreground">{property.address}</p>}
              </div>
              {heroPriceMinor > 0 && (
                <div className="mt-6 shrink-0 lg:mt-0 lg:text-right">
                  {estate && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From</p>
                  )}
                  <p className="text-3xl font-bold leading-none tracking-tight text-plum-950">
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

            <div className="space-y-10 px-6 py-8">
              {property.images.length > 0 && <Gallery images={property.images} title={property.title} />}

              {property.description && (
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-plum-950">Overview</h3>
                  <p className="mt-4 max-w-[65ch] whitespace-pre-line text-base leading-relaxed text-plum-950/80">
                    {property.description}
                  </p>
                </div>
              )}

              <EnquiryOptionProvider>
                {estate ? (
                  <>
                    <EstateOptions property={property} />
                    {property.paymentPlan && <PaymentPlanCard property={property} />}
                  </>
                ) : (
                  <div className="space-y-4">
                    <RentTerms property={property} />
                    <SpecGrid property={property} />
                  </div>
                )}
              </EnquiryOptionProvider>

              {property.amenities.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-plum-950">Amenities</h3>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {property.amenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="inline-flex items-center gap-2 rounded-full bg-mist-100 px-4 py-2 text-sm font-medium text-plum-950"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-wine-600" strokeWidth={2.5} aria-hidden="true" />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </ChatProvider>
  );
}
