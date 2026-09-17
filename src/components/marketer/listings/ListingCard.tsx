"use client";

import Image from "next/image";
import { useState } from "react";
import { MapPin, Share2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import {
  estateSummary,
  formatPrice,
  isAnimatedImageUrl,
  isEstate,
  isVideoUrl,
  videoPosterUrl,
  type Property,
  type RentPeriod,
} from "@avhomes/contracts";
import { IconListings } from "../icons3d";
import { Button, ButtonLink, Money, Skeleton } from "../ui";

/**
 * One home a marketer can share: its photo, where it is, what it costs, and
 * the two things to do with it.
 *
 * `next/image` rather than a plain img. Listing photos are the same Cloudinary
 * and local addresses the storefront and the Updates cards already optimise,
 * and a screen of full size photos is the costliest thing this app can ask of
 * a phone on mobile data.
 */

const PERIOD: Record<RentPeriod, string> = {
  year: "a year",
  month: "a month",
  night: "a night",
};

/** The first still; a Cloudinary video's own poster when a listing has only video. */
export function listingPhoto(property: Property): string | null {
  const still = property.images.find((url) => !isVideoUrl(url));
  if (still) return still;
  const first = property.images[0];
  return first ? videoPosterUrl(first) : null;
}

/** "Lekki, Lagos", or the city alone when the area says nothing more. */
export function listingPlace(property: Property): string {
  const area = property.location.trim();
  const city = property.city.trim();
  if (area === "" || area.toLowerCase() === city.toLowerCase()) return city;
  if (city === "" || area.toLowerCase().includes(city.toLowerCase())) return area;
  return `${area}, ${city}`;
}

/** An estate is priced from its cheapest option still for sale. */
export function listingPrice(property: Property): { minor: number; from: boolean } {
  if (!isEstate(property.type)) return { minor: property.priceMinor, from: false };
  const summary = estateSummary(property.prototypes);
  return summary.fromMinor > 0
    ? { minor: summary.fromMinor, from: true }
    : { minor: property.priceMinor, from: false };
}

/** The price as one line of a message: "From ₦12,000,000", "₦24,000,000/yr". */
export function listingPriceText(property: Property): string {
  const { minor, from } = listingPrice(property);
  if (minor <= 0) return "Price on request";
  const text = formatPrice(minor, {
    listingType: property.listingType,
    rentPeriod: property.listingType === "rent" ? (property.rentPeriod ?? "year") : null,
    currency: property.currency,
  });
  return from ? `From ${text}` : text;
}

export function ListingCard({
  property,
  canShare,
  shareReady,
  canReport = true,
  onShare,
  spotlight,
}: {
  property: Property;
  /** The phone has a share sheet. Without one the button opens WhatsApp. */
  canShare: boolean;
  /** The marketer's code has loaded, so a shared link can carry it. */
  shareReady: boolean;
  /** False for a paused or closed account, which the API refuses a deal from. */
  canReport?: boolean;
  onShare: () => void;
  /** Set on the one card a link pointed at. */
  spotlight?: (node: HTMLElement | null) => void;
}) {
  const [broken, setBroken] = useState(false);
  const photo = listingPhoto(property);
  const { minor, from } = listingPrice(property);
  const place = listingPlace(property);
  const estate = isEstate(property.type);
  const href = property.slug ? `/listings/${property.slug}` : null;

  const picture = (
    <span className="relative block aspect-[16/10] overflow-hidden bg-m-raised">
      {photo && !broken ? (
        <Image
          src={photo}
          alt=""
          fill
          sizes="(min-width: 40rem) 30rem, 100vw"
          // The optimiser flattens a GIF to its first frame.
          unoptimized={isAnimatedImageUrl(photo)}
          onError={() => setBroken(true)}
          className="object-cover"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <IconListings size={88} />
        </span>
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgb(14_6_9/0.55)_0%,transparent_100%)]"
      />
      <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-[rgb(20_11_14/0.62)] px-3 text-[12px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm">
        {estate ? "Estate" : property.type}
      </span>
    </span>
  );

  return (
    <article ref={spotlight} className="m-card m-card--lg overflow-hidden">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`See ${property.title} on the website`}
          className="block active:opacity-85"
        >
          {picture}
        </a>
      ) : (
        picture
      )}

      <div className="p-4">
        <h3 className="line-clamp-2 text-[17px] font-bold leading-snug tracking-[-0.01em] text-m-text">
          {property.title}
        </h3>
        {place !== "" && (
          <p className="mt-1 flex items-center gap-1 text-[13px] text-m-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{place}</span>
          </p>
        )}

        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-m-text">
          {minor > 0 ? (
            <>
              {from && <span className="text-[13px] font-semibold text-m-muted">From</span>}
              <Money minor={minor} currency={property.currency} size="lg" />
              {property.listingType === "rent" && (
                <span className="text-[13px] font-semibold text-m-muted">
                  {PERIOD[property.rentPeriod ?? "year"]}
                </span>
              )}
            </>
          ) : (
            <span className="text-[15px] font-semibold text-m-muted">Price on request</span>
          )}
        </p>

        <div className={`mt-4 grid gap-3 ${canReport ? "grid-cols-2" : "grid-cols-1"}`}>
          <Button
            variant="secondary"
            disabled={!shareReady || href === null}
            onClick={onShare}
            aria-label={`Share ${property.title}`}
          >
            {canShare ? (
              <Share2 className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <FaWhatsapp className="h-[18px] w-[18px]" aria-hidden />
            )}
            Share
          </Button>
          {canReport && (
            <ButtonLink
              href={`/m/deals/new?listing=${encodeURIComponent(property.id)}`}
              variant="quiet"
            >
              Report a deal
            </ButtonLink>
          )}
        </div>
      </div>
    </article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="m-card m-card--lg overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[16/10] w-full" radius="0" />
      <div className="p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-2 h-3.5 w-1/3" />
        <Skeleton className="mt-4 h-6 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Skeleton className="h-11" radius="16px" />
          <Skeleton className="h-11" radius="16px" />
        </div>
      </div>
    </div>
  );
}
