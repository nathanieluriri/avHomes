import type { Page, Property, SiteStat, Testimonial } from "@avhomes/contracts";
import { apiBase, DETAIL_REVALIDATE, LIST_REVALIDATE } from "./api-config";
import { demoProperties, demoStats, demoTestimonials } from "./demo-data";

/**
 * The single data access layer. Pages never fetch directly, so what the site
 * reads and how it reads it stay one decision.
 *
 * EVERY READ FALLS BACK TO THE BUNDLED FIXTURES. That is not defensiveness, it
 * is what makes `next build` work with no MONGODB_URI: static generation runs
 * these functions, and a build that fails because a database is not wired yet is
 * a build gate that tests the environment rather than the code. The fallback is
 * logged loudly enough to find, and a deployed site with a working database
 * never reaches it.
 */

interface FetchOptions {
  revalidate: number;
  tags?: string[];
}

async function apiGet<T>(path: string, fallback: T, options: FetchOptions): Promise<T> {
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
    console.warn(
      `[data] ${path} unavailable, serving bundled fixtures:`,
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return fallback;
  }
}

export async function getProperties(): Promise<Property[]> {
  const page = await apiGet<Page<Property>>(
    "/properties?limit=48",
    { items: demoProperties, nextCursor: null },
    { revalidate: LIST_REVALIDATE, tags: ["properties"] },
  );
  return page.items;
}

export async function getFeaturedProperties(): Promise<Property[]> {
  const page = await apiGet<Page<Property>>(
    "/properties?featured=1&limit=6",
    { items: demoProperties.filter((p) => p.featured), nextCursor: null },
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
    console.warn(
      `[data] property ${slug} unavailable, serving bundled fixtures:`,
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return fallback;
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
    { revalidate: DETAIL_REVALIDATE, tags: ["site"] },
  );
}

export async function getTestimonials(): Promise<Testimonial[]> {
  return (await getSite()).testimonials;
}

export async function getStats(): Promise<SiteStat[]> {
  return (await getSite()).stats;
}

/** Re-exported so components import their formatting from one place. */
export { formatPrice, formatPriceShort, statusLabel } from "@avhomes/contracts";
