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
 * ON A PRODUCTION DEPLOYMENT THIS IS THE PUBLIC ALIAS, NOT `VERCEL_URL`, and
 * the distinction is not cosmetic. `VERCEL_URL` is the deployment's own
 * immutable host (`avhomes-a1b2c3.vercel.app`), and Vercel Authentication
 * protects deployment URLs while leaving the production alias public. With
 * protection on, a server component fetching its own `VERCEL_URL` is answered
 * by a 401 login page rather than by the API, so every read on the site fails
 * at once while the same endpoint works perfectly from a browser. That failure
 * is silent by design here, because the layer above it catches and degrades.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the stable alias and is public whenever
 * the site is. Previews deliberately keep `VERCEL_URL`: a preview should read
 * its own data rather than production's, and a preview being behind
 * authentication is the point of a preview.
 */
export function apiBase(): string {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** A published listing rarely changes. Lists move more often. */
export const LIST_REVALIDATE = 300;
export const DETAIL_REVALIDATE = 600;

/**
 * The canonical public origin, taken from the deployment itself.
 *
 * NOTHING IS CONFIGURED HERE ANY MORE. Vercel publishes two hosts and the order
 * below matters: `VERCEL_PROJECT_PRODUCTION_URL` is the STABLE production
 * domain and is what a canonical URL, an og:url or a sitemap entry has to name,
 * while `VERCEL_URL` is this particular deployment's own immutable host, which
 * is right for a preview and wrong as a canonical link because it changes on
 * every push.
 *
 * Synchronous on purpose. `ShareLinks` uses this as the server snapshot of a
 * `useSyncExternalStore` whose client snapshot is `window.location.origin`, so
 * a promise here would have to be resolved before render and the two halves
 * would stop agreeing.
 */
export const SITE_DOMAIN = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT ?? 3000}`;

export const SITE_NAME = "AVHomes";
