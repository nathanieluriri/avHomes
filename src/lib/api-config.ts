/**
 * Where the site's server components fetch from, committed to the repo on
 * purpose. None of this is a credential.
 *
 * The API is now part of THIS application, mounted at `/api`, so these fetches
 * are same-origin. They still go over HTTP rather than importing the repository
 * functions directly, and that is deliberate: the public read routes are mounted
 * ABOVE the session middleware, which is what makes them structurally incapable
 * of varying by cookie. A direct function call has no such guarantee, only a
 * convention that somebody eventually breaks by passing a user in.
 *
 * The cost is one self-invocation per revalidate window, not per visitor,
 * because every fetch below carries `next: { revalidate }`.
 */

/**
 * An absolute base, because `fetch("/api/...")` has no origin to resolve
 * against inside a server component.
 *
 * VERCEL_URL is the deployment's own host and is present on every Vercel
 * runtime, including preview builds, which is what makes this work without an
 * environment variable per environment.
 */
export function apiBase(): string {
  const explicit = process.env.SITE_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** A published listing rarely changes. Lists move more often. */
export const LIST_REVALIDATE = 300;
export const DETAIL_REVALIDATE = 600;

/** The canonical public origin for metadata, sitemaps and og:url. */
export const SITE_DOMAIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? process.env.SITE_ORIGIN ?? "https://avhomes.example.com";
export const SITE_NAME = "AVHomes";
