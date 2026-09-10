import {
  FEE_KINDS,
  RECURRING_FEE_KINDS,
  type FeeKind,
  type ListingFee,
  type ListingType,
  type PropertyStatus,
  type RentPeriod,
} from "./types";

/**
 * Money is an integer in minor units with its currency beside it. Never a float.
 *
 * 100 kobo per naira, so 245,000,000 naira is 24_500_000_000. That fits a double
 * exactly (well under 2^53), which is why a plain number is safe in both Mongo
 * and the browser.
 */
export const MINOR_UNITS_PER_MAJOR: Record<string, number> = {
  NGN: 100,
  USD: 100,
  GBP: 100,
  EUR: 100,
};

export const DEFAULT_CURRENCY = "NGN";

export function minorUnitsFor(currency: string): number {
  return MINOR_UNITS_PER_MAJOR[currency.toUpperCase()] ?? 100;
}

export type MoneyRefusal =
  | "not_a_number"
  | "negative"
  | "too_precise"
  | "too_large"
  | "unknown_currency";

export type MoneyParse = { ok: true; minor: number } | { ok: false; reason: MoneyRefusal };

/** The ceiling is 2^53 - 1, past which a JS number stops being exact. */
const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

/**
 * Parses a major-unit string ("245000000", "3,000.50") into minor units.
 *
 * Returns a discriminated refusal rather than throwing or coercing, so a form
 * can say WHY an amount was refused instead of silently storing a wrong number.
 */
export function parseMajor(input: string, currency: string = DEFAULT_CURRENCY): MoneyParse {
  if (!(currency.toUpperCase() in MINOR_UNITS_PER_MAJOR)) {
    return { ok: false, reason: "unknown_currency" };
  }
  const cleaned = input.replace(/[\s,_]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d*)?$/.test(cleaned)) {
    return { ok: false, reason: "not_a_number" };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" };
  if (value < 0) return { ok: false, reason: "negative" };

  const scale = minorUnitsFor(currency);
  const scaled = value * scale;
  // Rounding here would silently accept 3000.005 as 3000.01. Refuse instead.
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return { ok: false, reason: "too_precise" };

  const minor = Math.round(scaled);
  if (minor > MAX_SAFE_MINOR) return { ok: false, reason: "too_large" };
  return { ok: true, minor };
}

export function moneyRefusalMessage(reason: MoneyRefusal, currency = DEFAULT_CURRENCY): string {
  switch (reason) {
    case "not_a_number":
      return "Enter a number, using digits only.";
    case "negative":
      return "A price cannot be negative.";
    case "too_precise":
      return `That has more decimal places than ${currency} allows.`;
    case "too_large":
      return "That number is too large to store exactly.";
    case "unknown_currency":
      return `${currency} is not a currency this site prices in.`;
  }
}

/** Minor units back to a plain major-unit string, for populating an input. */
export function plainMajor(minor: number, currency = DEFAULT_CURRENCY): string {
  const scale = minorUnitsFor(currency);
  const major = minor / scale;
  return Number.isInteger(major) ? String(major) : major.toFixed(String(scale).length - 1);
}

export interface PriceShape {
  listingType: ListingType;
  rentPeriod: RentPeriod | null;
  currency?: string;
}

/** year -> "/yr", month -> "/mo", night -> "/night". A sale carries no period, so no suffix. */
// TODO(test): suffixes /yr, /mo, /night, and nothing when period is null (the sale case).
export function periodSuffix(period: RentPeriod | null): string {
  switch (period) {
    case "year":
      return "/yr";
    case "month":
      return "/mo";
    case "night":
      return "/night";
    case null:
      return "";
  }
}

/** Full currency formatting. Suffix comes from the period, not the listing type or status. */
export function formatPrice(minor: number, shape: PriceShape): string {
  const currency = shape.currency ?? DEFAULT_CURRENCY;
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / minorUnitsFor(currency));
  return `${formatted}${periodSuffix(shape.rentPeriod)}`;
}

/** Compact form for dense cards: 245000000 naira becomes 245M. */
export function formatPriceShort(minor: number, shape: PriceShape): string {
  const currency = shape.currency ?? DEFAULT_CURRENCY;
  const price = minor / minorUnitsFor(currency);
  const abs = Math.abs(price);
  let out: string;
  if (abs >= 1_000_000_000) out = `${(price / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  else if (abs >= 1_000_000) out = `${(price / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  else out = new Intl.NumberFormat("en-NG").format(price);
  const symbol = currency === "NGN" ? "₦" : "";
  return `${symbol}${out}${periodSuffix(shape.rentPeriod)}`;
}

/** The badge label for lifecycle alone. Admin only; see listingLabel for what the public reads. */
export function statusLabel(status: PropertyStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "live":
      return "Live";
    case "under-offer":
      return "Under offer";
    case "closed":
      return "Closed";
    case "archived":
      return "Archived";
  }
}

/**
 * A Record over every (status, type) pair rather than a switch with a fallback,
 * so a status added without its labels here is a compile error, not a raw
 * status string leaking onto the public site.
 */
const LISTING_LABELS: Record<PropertyStatus, Record<ListingType, string>> = {
  draft: { sale: "Draft", rent: "Draft" },
  live: { sale: "For Sale", rent: "For Rent" },
  "under-offer": { sale: "Under Offer", rent: "Let Agreed" },
  closed: { sale: "Sold", rent: "Let" },
  archived: { sale: "Archived", rent: "Archived" },
};

/** The reader's vocabulary. Every public surface renders this, never a raw status. */
// TODO(test): listingLabel returns the right phrase for all ten type/status pairs.
export function listingLabel(type: ListingType, status: PropertyStatus): string {
  return LISTING_LABELS[status][type];
}

/** Derived from kind, never stored: a stored flag could disagree with the kind beside it. */
export function isRecurringFee(kind: FeeKind): boolean {
  return RECURRING_FEE_KINDS.includes(kind);
}

/** At most one fee per kind, last wins. Output order follows FEE_KINDS, not input order. */
// TODO(test): a fee list with two agency entries de-duplicates last-wins.
export function normalizeFees(fees: readonly ListingFee[]): ListingFee[] {
  const byKind = new Map<FeeKind, ListingFee>();
  for (const fee of fees) byKind.set(fee.kind, fee);
  const out: ListingFee[] = [];
  for (const kind of FEE_KINDS) {
    const fee = byKind.get(kind);
    if (fee) out.push(fee);
  }
  return out;
}

/**
 * Rent for one period plus every non-recurring fee in the listing currency.
 * A fee in another currency is named in `excluded` rather than summed: there is
 * no FX in this system, and inventing a rate is how a buyer gets quoted a number
 * nobody honours.
 */
// TODO(test): excludes recurring fees (service-charge) from the total.
// TODO(test): excludes foreign-currency fees from the total and names them in excluded.
export function moveInTotalMinor(input: {
  priceMinor: number;
  currency: string;
  listingType: ListingType;
  fees: readonly ListingFee[];
}): { minor: number; excluded: FeeKind[] } {
  let minor = input.listingType === "rent" ? input.priceMinor : 0;
  const excluded: FeeKind[] = [];
  for (const fee of normalizeFees(input.fees)) {
    if (isRecurringFee(fee.kind)) continue;
    if (fee.currency !== input.currency) {
      excluded.push(fee.kind);
      continue;
    }
    minor += fee.amountMinor;
  }
  return { minor, excluded };
}

/** Legacy rows have no rentPeriod key; a rental without one is per year. A sale never has one. */
export function readRentPeriod(
  stored: RentPeriod | null | undefined,
  listingType: ListingType,
): RentPeriod | null {
  if (listingType === "sale") return null;
  return stored ?? "year";
}
