/**
 * API configuration, committed to the repo on purpose.
 *
 * The base URL is a public endpoint, not a credential, so there is nothing to
 * hide and no reason to route it through an environment variable. Editing this
 * file is the whole switch. If a real secret is ever needed (an API key, a
 * token) that still belongs in .env.local, which stays gitignored.
 *
 * The site currently runs in DEMO MODE: every getter in data.ts serves the
 * bundled fixtures from demo-data.ts and no network request is made, so
 * API_BASE_URL below is unused until DATA_MODE flips to "api".
 */

export type DataMode = "demo" | "api";

/**
 * "demo" serves bundled fixtures. "api" fetches from API_BASE_URL.
 * Widened with `as DataMode` so TypeScript does not narrow this to the literal
 * "demo" and then flag every mode comparison below as unreachable.
 */
export const DATA_MODE = "demo" as DataMode;

/** Local backend. Ignored entirely while DATA_MODE is "demo". */
export const API_BASE_URL = "http://localhost:8000";

export const IS_DEMO = DATA_MODE !== "api";

/** Seconds the fetch layer caches an API response. */
export const REVALIDATE_SECONDS = 60;
