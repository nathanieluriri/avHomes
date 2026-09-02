import type { PropertyStatus } from "./types";

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

/** Full currency formatting. Rentals are quoted per year. */
export function formatPrice(
  minor: number,
  status: PropertyStatus,
  currency = DEFAULT_CURRENCY,
): string {
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / minorUnitsFor(currency));
  return status === "for-rent" ? `${formatted}/yr` : formatted;
}

/** Compact form for dense cards: 245000000 naira becomes 245M. */
export function formatPriceShort(
  minor: number,
  status: PropertyStatus,
  currency = DEFAULT_CURRENCY,
): string {
  const price = minor / minorUnitsFor(currency);
  const abs = Math.abs(price);
  let out: string;
  if (abs >= 1_000_000_000) out = `${(price / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  else if (abs >= 1_000_000) out = `${(price / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  else out = new Intl.NumberFormat("en-NG").format(price);
  const symbol = currency === "NGN" ? "₦" : "";
  return status === "for-rent" ? `${symbol}${out}/yr` : `${symbol}${out}`;
}

/** The label a badge shows for a status. Draft and archived never reach the site. */
export function statusLabel(status: PropertyStatus): string {
  switch (status) {
    case "for-sale":
      return "For Sale";
    case "for-rent":
      return "For Rent";
    case "sold":
      return "Sold";
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
  }
}
