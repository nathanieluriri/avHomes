import { BLOG_API, BLOG_IS_DEMO, DETAIL_REVALIDATE, LIST_REVALIDATE } from "./config";
import type { PublicPost, PublicPostDetail, PublicPostList } from "./types";
import { demoPostDetails, demoPosts } from "./demo-posts";

export class BlogAPIError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "BlogAPIError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

interface FetchOptions {
  query?: Record<string, string | number | null | undefined>;
  revalidate?: number;
  tags?: string[];
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function blogFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { query, revalidate, tags, retries = 3, timeoutMs = 8000 } = options;

  const url = new URL(`${BLOG_API}${path}`);
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
        headers: { Accept: "application/json" },
        signal: controller.signal,
        next: { revalidate, tags },
      });

      // A 4xx is an answer, not an outage. Retrying burns the timeout budget
      // to arrive at the same response.
      if (res.status >= 400 && res.status < 500) {
        throw new BlogAPIError(`Blog API ${res.status} for ${path}`, res.status, endpoint);
      }
      if (!res.ok) {
        throw new BlogAPIError(`Blog API ${res.status} for ${path}`, res.status, endpoint);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error;

      if (error instanceof BlogAPIError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      if (attempt === retries) break;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 5000));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof BlogAPIError) throw lastError;
  // Network and abort failures have no HTTP status of their own.
  throw new BlogAPIError(
    `Blog API request failed for ${path}: ${String(lastError)}`,
    502,
    endpoint
  );
}

/** null for both absent and unpublished. The API makes them one 404. */
export async function getPostBySlug(slug: string): Promise<PublicPostDetail | null> {
  if (BLOG_IS_DEMO) {
    return demoPostDetails.find((p) => p.slug === slug) ?? null;
  }
  try {
    const { post } = await blogFetch<{ post: PublicPostDetail }>(
      `/posts/${encodeURIComponent(slug)}`,
      { revalidate: DETAIL_REVALIDATE, tags: ["posts", `post-${slug}`] }
    );
    return post;
  } catch (error) {
    if (error instanceof BlogAPIError && error.status === 404) return null;
    throw error;
  }
}

export async function listPosts(limit = 50): Promise<PublicPost[]> {
  if (BLOG_IS_DEMO) return demoPosts.slice(0, limit);
  const { items } = await blogFetch<PublicPostList>("/posts", {
    query: { limit },
    revalidate: LIST_REVALIDATE,
    tags: ["posts"],
  });
  return items;
}

/**
 * The blog may be empty or unreachable at build time. Returning an empty list
 * lets pages render on demand instead of failing the build.
 */
export async function listPostSlugs(limit = 50): Promise<{ slug: string }[]> {
  try {
    const items = await listPosts(limit);
    return items.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}
