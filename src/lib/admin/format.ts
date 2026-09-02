/**
 * The console's formatting, in one place.
 *
 * These were copied into four screens and had already drifted: the listings
 * list rendered a timestamp as "2 Sept" while the editor rendered the same
 * field as "9/2/2026", because one call passed a locale and the other did not.
 * On a product whose readers are in Lagos, that second string reads as 9
 * February. A shared function cannot disagree with itself.
 *
 * Everything here is pinned to `en-GB`. The console is one product with one
 * date format, not a surface that changes shape with the operator's machine.
 */

const LOCALE = "en-GB";

/**
 * A short date. The current year is dropped, because a list of things touched
 * this week does not need "2026" on every row to be read.
 */
export function shortDate(at: number): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** A full date, for a detail screen where the row is the only one on screen. */
export function fullDate(at: number): string {
  return new Date(at).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Date and time, for a record whose hour matters. */
export function dateTime(at: number): string {
  return new Date(at).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "2h ago", and a date once it stops being useful.
 *
 * Past a week, "9d ago" is arithmetic the reader has to do; a date is not.
 */
export function relative(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(at);
}

/** Up to two initials, for an avatar disc. */
export function initials(name: string, fallback = "?"): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return fallback;
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

/**
 * A status enum, as a person reads it.
 *
 * Listings runs its statuses through `statusLabel` from the contracts package
 * and gets "For Sale"; Enquiries and Journal have no such helper and were
 * printing the raw enum into the same Badge, so a title-case "New" tab sat
 * directly over a column of lower-case "new". One rule, one look.
 */
export function humanise(value: string): string {
  const spaced = value.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
