import type { EstateSummary, PaymentPlan, Property } from "@/lib/types";
import { formatPrice, formatSqm, isPlaza, paymentPlanFor } from "@/lib/data";

export interface EstateFacts {
  options: string | null;
  beds: string | null;
  plots: string | null;
}

/**
 * The pieces of "3 of 4 available · 2 to 3 bed · plots from 500 sqm". A piece with
 * nothing to say is null. The ranges cover available options only (`estateSummary`),
 * so the count does too whenever something has sold.
 */
export function estateFacts(s: EstateSummary, noun = "option"): EstateFacts {
  return {
    options:
      s.count === 0
        ? null
        : !s.soldOut && s.availableCount < s.count
          ? `${s.availableCount} of ${s.count} available`
          : `${s.count} ${s.count === 1 ? noun : `${noun}s`}`,
    beds:
      s.hasHouses && s.bedroomsMax > 0
        ? s.bedroomsMin === s.bedroomsMax || s.bedroomsMin === 0
          ? `${s.bedroomsMax} bed`
          : `${s.bedroomsMin} to ${s.bedroomsMax} bed`
        : null,
    plots: s.plotSqmMin > 0 ? `plots from ${formatSqm(s.plotSqmMin)}` : null,
  };
}

/** "2 to 3 bed · plots from 500 sqm", for a place that states availability on its own. */
export function estateRangeLine(s: EstateSummary): string {
  const f = estateFacts(s);
  return [f.beds, f.plots].filter(Boolean).join(" · ");
}

/** "Sold out", or "Fully let" for a building whose units are let. */
export function allTakenLabel(property: Pick<Property, "listingType">): string {
  return property.listingType === "rent" ? "Fully let" : "Sold out";
}

/** "14 units available", or "Sold out" once nothing is left. */
export function availabilityLine(
  s: EstateSummary,
  property?: Pick<Property, "listingType" | "type">,
): string | null {
  if (s.count === 0) return null;
  if (s.soldOut) return property ? allTakenLabel(property) : "Sold out";
  return unitsLine(s.unitsAvailable, property);
}

/** "1 unit available", "6 shops available". */
export function unitsLine(units: number, property?: Pick<Property, "type">): string {
  const noun = property && isPlaza(property.type) ? "shop" : "unit";
  return `${units} ${noun}${units === 1 ? "" : "s"} available`;
}

/** A sale price with no period suffix, in the listing's own currency. */
export function saleMoney(minor: number, property: Pick<Property, "currency">): string {
  return formatPrice(minor, { listingType: "sale", rentPeriod: null, currency: property.currency });
}

/** "₦3,600,000 deposit, then ₦700,000 a month for 12 months". */
export function planLine(priceMinor: number, plan: PaymentPlan, property: Pick<Property, "currency">): string {
  const { depositMinor, monthlyMinor } = paymentPlanFor(priceMinor, plan);
  const deposit = `${saleMoney(depositMinor, property)} deposit`;
  if (monthlyMinor <= 0) return `${deposit}, paid in full`;
  const months = `${plan.months} ${plan.months === 1 ? "month" : "months"}`;
  return `${deposit}, then ${saleMoney(monthlyMinor, property)} a month for ${months}`;
}
