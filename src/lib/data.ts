import { Property, Testimonial, SiteStat, Insight } from "./types";
import { demoProperties, demoTestimonials, demoStats, demoInsights } from "./demo-data";
import { API_BASE_URL, IS_DEMO, REVALIDATE_SECONDS } from "./api-config";

/**
 * Single data access layer. Pages never import demo data directly, so flipping
 * DATA_MODE in api-config.ts switches the whole site to a live backend with no
 * page edits.
 */
const isDemo = IS_DEMO;

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  if (!API_BASE_URL) return fallback;
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[data] falling back to demo data for ${path}:`, err);
    return fallback;
  }
}

export async function getProperties(): Promise<Property[]> {
  if (isDemo) return demoProperties;
  return apiFetch<Property[]>("/properties", demoProperties);
}

export async function getFeaturedProperties(): Promise<Property[]> {
  return (await getProperties()).filter((p) => p.featured);
}

export async function getPropertyBySlug(slug: string): Promise<Property | undefined> {
  const fallback = demoProperties.find((p) => p.slug === slug);
  if (isDemo) return fallback;
  return apiFetch<Property | undefined>(`/properties/${slug}`, fallback);
}

export async function getSimilarProperties(current: Property, limit = 3): Promise<Property[]> {
  const all = await getProperties();
  const sameType = all.filter((p) => p.id !== current.id && p.type === current.type);
  const sameCity = all.filter(
    (p) => p.id !== current.id && p.city === current.city && p.type !== current.type
  );
  return [...sameType, ...sameCity].slice(0, limit);
}

export async function getTestimonials(): Promise<Testimonial[]> {
  if (isDemo) return demoTestimonials;
  return apiFetch<Testimonial[]>("/testimonials", demoTestimonials);
}

export async function getStats(): Promise<SiteStat[]> {
  if (isDemo) return demoStats;
  return apiFetch<SiteStat[]>("/stats", demoStats);
}

export async function getInsights(): Promise<Insight[]> {
  if (isDemo) return demoInsights;
  return apiFetch<Insight[]>("/insights", demoInsights);
}

export function isDemoMode() {
  return isDemo;
}

/** Naira, no decimals. Rentals are quoted per year. */
export function formatPrice(price: number, status: Property["status"]) {
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
  return status === "For Rent" ? `${formatted}/yr` : formatted;
}

/** Compact form for dense cards: 245000000 becomes 245M. */
export function formatPriceShort(price: number, status: Property["status"]) {
  const abs = Math.abs(price);
  let out: string;
  if (abs >= 1_000_000_000) out = `${(price / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  else if (abs >= 1_000_000) out = `${(price / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  else out = new Intl.NumberFormat("en-NG").format(price);
  return status === "For Rent" ? `₦${out}/yr` : `₦${out}`;
}
