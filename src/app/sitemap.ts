import type { MetadataRoute } from "next";

import { SITE_DOMAIN } from "@/lib/api-config";
import { getProperties } from "@/lib/data";
import { listPosts } from "@/lib/blog/client";

/**
 * The crawl map, which did not exist: `/sitemap.xml` answered 404.
 *
 * It matters more here than on most sites. The homepage's featured grid resolves
 * inside a Suspense boundary that bails to client rendering, so the server HTML
 * a crawler receives contains ZERO links to any listing. Without this file there
 * was no path from the front door to a single property, and property search in
 * Nigeria starts in a search engine.
 *
 * BUILT FROM THE PUBLIC READS, not from the database, so it can only ever name
 * pages the site would actually serve. `getProperties` returns what
 * `/api/public/properties` returns, which is already filtered to
 * PUBLIC_PROPERTY_STATUSES and to rows that are not deleted. A sitemap assembled
 * from a wider query is how a draft or an archived listing gets submitted for
 * indexing, and this codebase has already been bitten once by an archived
 * listing staying reachable.
 *
 * A failed read yields an empty list rather than throwing, by the same rule as
 * every other read in `data.ts`: in production a failure serves nothing rather
 * than fiction. A sitemap missing its listings is a bad day; a sitemap that
 * fails the whole route is a 500 where a crawler expected XML.
 */
/**
 * Hourly, because a sitemap generated once at build time is wrong for a site
 * whose stock is published from an admin screen.
 *
 * Without this the route is prerendered and frozen: a listing published on
 * Tuesday is absent from the crawl map until somebody deploys, and one taken
 * down stays in it just as long. The inner reads carry their own shorter
 * revalidate, but that only refreshes the DATA, not this route, so the route
 * has to say it too.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [properties, posts] = await Promise.all([getProperties(), listPosts(200)]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_DOMAIN}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_DOMAIN}/listings`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_DOMAIN}/posts`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_DOMAIN}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_DOMAIN}/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_DOMAIN}/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];

  /*
   * A listing with no slug has never been published, so it has no URL to name.
   * The slug is derived at publish and is null until then.
   */
  const listings: MetadataRoute.Sitemap = properties
    .filter((p): p is typeof p & { slug: string } => p.slug !== null)
    .map((p) => ({
      url: `${SITE_DOMAIN}/listings/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const journal: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_DOMAIN}/posts/${post.slug}`,
    lastModified: new Date(post.publishedAt ?? post.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...listings, ...journal];
}
