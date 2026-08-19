/**
 * Blog configuration, committed on purpose. None of this is secret: the public
 * blog API is read only and unauthenticated, and the site domain is public.
 *
 * BLOG_MODE mirrors DATA_MODE in src/lib/api-config.ts. "demo" serves the
 * bundled fixture posts so the reader works with no network at all. "api"
 * fetches from BLOG_API. Flip the one constant to go live.
 */
import type { ReadingTemplate } from "./types";

export type BlogMode = "demo" | "api";

export const BLOG_MODE = "demo" as BlogMode;
export const BLOG_IS_DEMO = BLOG_MODE !== "api";

export const BLOG_API_BASE = "https://blog-admin-app-gold.vercel.app";
export const BLOG_API = `${BLOG_API_BASE}/api/public`;

/** Production domain. Canonical, og:url and the sitemap must name this
 *  wherever they render, never the request origin. */
export const SITE_DOMAIN = "https://avhomes.uririnathaniel.workers.dev";
export const SITE_NAME = "AVHomes";

/** A published post rarely changes. Lists move often. */
export const DETAIL_REVALIDATE = 3600;
export const LIST_REVALIDATE = 300;

export const BLOG_DEFAULT_TEMPLATE: ReadingTemplate = "magazine";
export const SHOW_READING_TIME = true;
