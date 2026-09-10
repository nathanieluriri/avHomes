import type {
  ClientLogo,
  Office,
  Page,
  PriceChange,
  Property,
  SiteStat,
  Testimonial,
} from "@avhomes/contracts";
import { apiBase, DETAIL_REVALIDATE, LIST_REVALIDATE } from "./api-config";
import { demoProperties, demoStats, demoTestimonials } from "./demo-data";

/**
 * The single data access layer. Pages never fetch directly, so what the site
 * reads and how it reads it stay one decision.
 *
 * A FAILED READ FALLS BACK TO THE BUNDLED FIXTURES, BUT ONLY OUTSIDE
 * PRODUCTION, and the second half of that sentence is the important one.
 *
 * The fixtures exist so `npm run dev` is useful before a database is wired and
 * so `next build` is a gate that tests the code rather than the environment.
 * What they must never do is reach a visitor. This file used to fall back
 * unconditionally, and the comment here asserted that "a deployed site with a
 * working database never reaches it", which turned out to be exactly the wrong
 * guarantee to rely on: the API answered 501 for a missing MONGODB_URI, every
 * read failed, and the live site advertised three invented luxury properties in
 * Lekki and Ikoyi. On a real estate site that is not a cosmetic bug. A buyer
 * can open one, send an enquiry about it, and be answered about a house that
 * does not exist.
 *
 * So in production a failure yields EMPTY rather than fiction. An empty
 * storefront is a true statement about a site with no listings yet, and a
 * caller who wants to know why has the warning below in the runtime log.
 */

/*
 * `NODE_ENV`, not a variable of our own, because the two moments that need
 * fixtures are exactly the two where Next sets this to something other than
 * "production": `next dev`, and a test runner. `next build` sets it to
 * "production", so a build with no database now prerenders an empty site
 * instead of a fake one, which is still a passing gate and a more honest
 * artifact.
 */
const FIXTURES_ALLOWED = process.env.NODE_ENV !== "production";

interface FetchOptions {
  revalidate: number;
  tags?: string[];
}

/**
 * `fallback` is the fixture shape and `empty` is the same shape with nothing in
 * it. Two arguments rather than one, because only the caller knows what "none
 * of these" looks like for its own payload: a list read wants
 * `{ items: [], nextCursor: null }` and a detail read wants null.
 */
async function apiGet<T>(path: string, fallback: T, empty: T, options: FetchOptions): Promise<T> {
  const url = `${apiBase()}/api/public${path}`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: options.revalidate, ...(options.tags ? { tags: options.tags } : {}) },
    });
    if (!res.ok) {
      // The body carries the error table's own diagnosis, including a requestId
      // that ties this line to the server's log entry for the same failure.
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (FIXTURES_ALLOWED) {
      console.warn(`[data] ${path} unavailable, serving bundled fixtures:`, reason);
      return fallback;
    }
    // Loud, and an error rather than a warning: in production this is the site
    // showing a visitor less than it holds, and the line has to be findable in
    // a log that is filtered to errors.
    console.error(`[data] ${path} unavailable, serving nothing:`, reason);
    return empty;
  }
}

export async function getProperties(): Promise<Property[]> {
  const page = await apiGet<Page<Property>>(
    "/properties?limit=48",
    { items: demoProperties, nextCursor: null },
    { items: [], nextCursor: null },
    { revalidate: LIST_REVALIDATE, tags: ["properties"] },
  );
  return page.items;
}

export async function getFeaturedProperties(): Promise<Property[]> {
  const page = await apiGet<Page<Property>>(
    "/properties?featured=1&limit=6",
    { items: demoProperties.filter((p) => p.featured), nextCursor: null },
    { items: [], nextCursor: null },
    { revalidate: LIST_REVALIDATE, tags: ["properties"] },
  );
  return page.items;
}

export interface PropertyDetail {
  property: Property;
  similar: Property[];
}

/**
 * The detail read returns its similar listings in the same response, so a
 * property page is one round trip rather than two.
 */
export async function getPropertyDetail(slug: string): Promise<PropertyDetail | null> {
  const fallbackProperty = demoProperties.find((p) => p.slug === slug);
  const fallback: PropertyDetail | null = fallbackProperty
    ? {
        property: fallbackProperty,
        similar: demoProperties
          .filter((p) => p.id !== fallbackProperty.id && p.type === fallbackProperty.type)
          .slice(0, 3),
      }
    : null;

  const url = `${apiBase()}/api/public/properties/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: DETAIL_REVALIDATE, tags: ["properties", `property-${slug}`] },
    });
    // A 404 is an ANSWER, not an outage. Falling back to a fixture here would
    // resurrect a listing the operator deliberately unpublished.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as PropertyDetail;
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (FIXTURES_ALLOWED) {
      console.warn(`[data] property ${slug} unavailable, serving bundled fixtures:`, reason);
      return fallback;
    }
    // Null, which the page renders as a 404. A fixture here would be a detail
    // page for a house nobody is selling, with a working enquiry form on it.
    console.error(`[data] property ${slug} unavailable, serving nothing:`, reason);
    return null;
  }
}

export async function getPropertyBySlug(slug: string): Promise<Property | undefined> {
  return (await getPropertyDetail(slug))?.property;
}

interface SitePayload {
  testimonials: Testimonial[];
  stats: SiteStat[];
}

async function getSite(): Promise<SitePayload> {
  return apiGet<SitePayload>(
    "/site",
    { testimonials: demoTestimonials, stats: demoStats },
    { testimonials: [], stats: [] },
    { revalidate: DETAIL_REVALIDATE, tags: ["site"] },
  );
}

export async function getTestimonials(): Promise<Testimonial[]> {
  return (await getSite()).testimonials;
}

export async function getStats(): Promise<SiteStat[]> {
  return (await getSite()).stats;
}

const PRICE_REDUCED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** True when the newest priceHistory entry cut the price, and did so within the last 90 days. */
// TODO(test): false on an empty history, false when the newest entry raised the price, false
//   once `at` is more than 90 days old, true at exactly the boundary.
export function isPriceReduced(
  priceHistory: readonly PriceChange[],
  now: number = Date.now(),
): boolean {
  const newest = priceHistory[priceHistory.length - 1];
  if (!newest) return false;
  return newest.toMinor < newest.fromMinor && now - newest.at <= PRICE_REDUCED_WINDOW_MS;
}

export interface PublicSettings {
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  offices: Office[];
  clientLogos: ClientLogo[];
}

/**
 * The contact facts, which have NO fixture and never will.
 *
 * Every other read in this file has a bundled fallback so `npm run dev` is
 * useful before a database exists. This one deliberately does not: a phone
 * number is the exact kind of value that must never be invented, and the site
 * already shipped `+234 800 000 0000` once. Both arms return empty, and every
 * surface treats empty as "hide the block".
 */
const NO_SETTINGS: PublicSettings = {
  contactPhone: "",
  contactEmail: "",
  whatsappNumber: "",
  offices: [],
  clientLogos: [],
};

export async function getSiteSettings(): Promise<PublicSettings> {
  const payload = await apiGet<{ settings: PublicSettings }>(
    "/settings",
    { settings: NO_SETTINGS },
    { settings: NO_SETTINGS },
    { revalidate: DETAIL_REVALIDATE, tags: ["settings"] },
  );
  return payload.settings;
}

/** `wa.me/<digits>` with the enquiry already typed, or null when unset. */
export function whatsappHref(number: string, message: string): string | null {
  if (number.trim() === "") return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Re-exported so components import their formatting from one place. */
export {
  formatPrice,
  formatPriceShort,
  listingLabel,
  moveInTotalMinor,
  normalizeFees,
  statusLabel,
} from "@avhomes/contracts";
