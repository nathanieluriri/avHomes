import Link from "next/link";
import Image from "next/image";
import { Bed, Bath, Maximize, Layers, LandPlot, Sofa } from "lucide-react";
import { Property } from "@/lib/types";
import {
  estateSummary,
  formatPriceShort,
  formatSqm,
  FURNISHING_LABELS,
  isEstate,
  isPriceReduced,
  listingLabel,
  sqftToSqm,
} from "@/lib/data";
import { estateFacts } from "@/components/listing/estate-text";

export default function PropertyCard({
  property,
  priority = false,
}: {
  property: Property;
  priority?: boolean;
}) {
  const estate = isEstate(property.type);
  // An estate's from-price moves when options sell or change, which is not a price cut.
  const reduced = !estate && isPriceReduced(property.priceHistory);
  const summary = estate ? estateSummary(property.prototypes) : null;
  const facts = summary ? estateFacts(summary) : null;
  const soldOut = summary?.soldOut ?? false;
  // An estate's own price column is its "from" price; the summary is the same number, read live.
  const priceMinor = summary ? summary.fromMinor : property.priceMinor;

  return (
    <Link
      href={`/listings/${property.slug}`}
      className="card-soft group flex h-full flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={property.images[0]}
          alt={property.title}
          fill
          priority={priority}
          sizes="(min-width:1280px) 30vw, (min-width:768px) 45vw, 92vw"
          className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-plum-950 backdrop-blur">
            {/* "For Sale" beside nothing left to buy would contradict itself. */}
            {soldOut ? "Sold out" : listingLabel(property.listingType, property.status)}
          </span>
          {estate && (
            <span className="rounded-full bg-plum-950 px-3 py-1 text-xs font-semibold text-white">
              Estate
            </span>
          )}
        </div>
        {reduced && (
          <span className="absolute right-3 top-3 rounded-full bg-wine-600 px-3 py-1 text-xs font-semibold text-white">
            Price reduced
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold tracking-tight text-plum-950">
          {property.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{property.location}</p>

        {facts ? (
          (facts.options || facts.beds || facts.plots) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
              {facts.options && (
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                  {facts.options}
                </span>
              )}
              {facts.beds && (
                <span className="inline-flex items-center gap-1.5">
                  <Bed className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                  {facts.beds}
                </span>
              )}
              {facts.plots && (
                <span className="inline-flex items-center gap-1.5">
                  <LandPlot className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                  {facts.plots}
                </span>
              )}
            </div>
          )
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
              {property.bedrooms} Beds
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
              {property.bathrooms} Baths
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Maximize className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
              {formatSqm(sqftToSqm(property.areaSqft))}
            </span>
            {property.listingType === "rent" && property.furnishing && (
              <span className="inline-flex items-center gap-1.5">
                <Sofa className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                {FURNISHING_LABELS[property.furnishing]}
              </span>
            )}
          </div>
        )}

        {/* The gap sits on a wrapper: `mt-auto` and `mt-5` on one element fight, and auto won. */}
        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-3 border-t border-mist-200 pt-4">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {priceMinor > 0 && (
                <span
                  className={`text-lg font-bold tracking-tight ${soldOut ? "text-slate-500" : "text-plum-950"}`}
                >
                  {estate && "From "}
                  {formatPriceShort(priceMinor, {
                    listingType: property.listingType,
                    rentPeriod: property.rentPeriod,
                    currency: property.currency,
                  })}
                </span>
              )}
              {estate && property.paymentPlan && !soldOut && (
                <span className="rounded-full bg-wine-50 px-2.5 py-0.5 text-xs font-semibold text-wine-700">
                  Payment plan
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm font-medium text-wine-600 transition-transform duration-200 group-hover:translate-x-1">
              View
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
