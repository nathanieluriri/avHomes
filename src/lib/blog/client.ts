import type { Page, PublicPost, PublicPostDetail } from "@avhomes/contracts";
import { apiBase } from "../api-config";
import { POST_DETAIL_REVALIDATE, POST_LIST_REVALIDATE } from "./config";
import { demoPostDetails, demoPosts } from "./demo-posts";

/**
 * The blog's read client.
 *
 * Same origin as the site, and the same fall-back-to-fixtures contract the
 * property reads use: `next build` runs these during static generation, and a
 * build that fails because a database is not wired yet tests the environment
 * rather than the code.
 *
 * THAT CONTRACT IS GATED ON `NODE_ENV`, and this file used to say it followed
 * `src/lib/data.ts` while doing the older, unconditional thing. `data.ts` was
 * changed because an API returning 501 made the site advertise three invented
 * properties in Lekki; the same shape here served fifteen invented posts, and
 * once a sitemap existed it offered every one of them to a crawler as a real
 * URL. Less alarming than a fake house, the same broken promise.
 *
 * So in production a failed read yields NOTHING rather than fiction. Outside
 * production the fixtures are unchanged, which is the case they exist for.
 */

/*
 * `NODE_ENV`, not a variable of our own, for the reason `data.ts` gives: the
 * two moments that need fixtures are exactly the two where Next sets this to
 * something other than "production", which are `next dev` and a test runner.
 */
const FIXTURES_ALLOWED = process.env.NODE_ENV !== "production";

export class BlogAPIError extends Error {
  override readonly name = "BlogAPIError";
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.status = status;
    this.endpoint = endpoint;
  }
}

interface FetchOptions {
  query?: Record<string, string | number | null | undefined>;
  revalidate: number;
  tags?: string[];
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function blogFetch<T>(path: string, options: FetchOptions): Promise<T> {
  const { query, revalidate, tags, retries = 2, timeoutMs = 8000 } = options;

  const url = new URL(`${apiBase()}/api/public${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const endpoint = url.toString();

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        next: { revalidate, ...(tags ? { tags } : {}) },
      });

      // A 4xx is an ANSWER, not an outage. Retrying burns the timeout budget to
      // arrive at the same response.
      if (res.status >= 400) {
        const body = await res.text().catch(() => "");
        const error = new BlogAPIError(
          `blog API ${res.status} for ${path}: ${body.slice(0, 300)}`,
          res.status,
          endpoint,
        );
        if (res.status < 500) throw error;
        lastError = error;
      } else {
        return (await res.json()) as T;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof BlogAPIError && error.status < 500) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(400 * attempt);
  }

  if (lastError instanceof BlogAPIError) throw lastError;
  // Network and abort failures carry no HTTP status of their own.
  throw new BlogAPIError(`blog API request failed for ${path}: ${String(lastError)}`, 502, endpoint);
}

/** null for both absent and unpublished. The API makes them one 404. */
export async function getPostBySlug(slug: string): Promise<PublicPostDetail | null> {
  try {
    const { post } = await blogFetch<{ post: PublicPostDetail }>(
      `/posts/${encodeURIComponent(slug)}`,
      { revalidate: POST_DETAIL_REVALIDATE, tags: ["posts", `post-${slug}`] },
    );
    return post;
  } catch (error) {
    if (error instanceof BlogAPIError && error.status === 404) return null;
    if (FIXTURES_ALLOWED) {
      console.warn(`[blog] post ${slug} unavailable, serving bundled fixtures:`, String(error));
      return demoPostDetails.find((p) => p.slug === slug) ?? null;
    }
    // Null, which the page renders as a 404. An error rather than a warning:
    // in production this is the site showing a reader less than it holds.
    console.error(`[blog] post ${slug} unavailable, serving nothing:`, String(error));
    return null;
  }
}

export async function listPosts(limit = 50): Promise<PublicPost[]> {
  try {
    const page = await blogFetch<Page<PublicPost>>("/posts", {
      query: { limit },
      revalidate: POST_LIST_REVALIDATE,
      tags: ["posts"],
    });
    return page.items;
  } catch (error) {
    if (FIXTURES_ALLOWED) {
      console.warn("[blog] list unavailable, serving bundled fixtures:", String(error));
      return demoPosts.slice(0, limit);
    }
    console.error("[blog] list unavailable, serving nothing:", String(error));
    return [];
  }
}

/**
 * The blog may be empty or unreachable at build time. Returning an empty list
 * lets pages render on demand instead of failing the build.
 */
export async function listPostSlugs(limit = 50): Promise<{ slug: string }[]> {
  try {
    return (await listPosts(limit)).map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}
