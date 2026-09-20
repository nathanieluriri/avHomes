import type { MetadataRoute } from "next";

import { SITE_DOMAIN } from "@/lib/api-config";
import { getListingUniverse } from "@/lib/data";
import { placesWithStock } from "@/lib/places";
import { listPosts } from "@/lib/blog/client";

/**
 * Revalidating, because a sitemap generated once at build time is wrong for a
 * site whose stock is published from an admin screen. Without it the route is
 * prerendered and frozen: a listing published on Tuesday is absent from the
 * crawl map until somebody deploys, and one taken down stays in it just as
 * long.
 *
 * The EFFECTIVE interval is 300s, not this number. Next takes the lowest
 * revalidate across a route, and the inner property read carries
 * `LIST_REVALIDATE = 300`. This is a ceiling that nothing currently reaches;
 * it stays as the route's own statement of intent, and the manifest is the
 * place to check what actually happens.
 */
export const revalidate = 3600;

/**
 * The crawl map, which did not exist: `/sitemap.xml` answered 404.
 *
 * It matters more here than on most sites. The homepage's featured grid used to
 * resolve inside a Suspense boundary that bailed to client rendering, so the
 * server HTML a crawler received contained ZERO links to any listing. That
 * boundary is gone and the grid now renders six of them server side, which is
 * six out of everything on the market. This file is still the only complete
 * path from the front door to every property, and property search in Nigeria
 * starts in a search engine.
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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * 100, not 200. `clampLimit` refuses anything above MAX_PAGE_LIMIT, so a
   * limit of 200 was a guaranteed 400 that `listPosts` caught and turned into
   * an empty array. The sitemap could never have contained a single post, and
   * nothing said so: the journal is empty today, so the hole was invisible.
   */
  /*
   * `getListingUniverse`, not `getProperties`. The plain read is the newest 48
   * and estates have their own, so an estate older than the 48th listing was
   * absent from this file entirely: it had a detail page, a URL anybody could
   * share, and no entry in the crawl map.
   */
  const [properties, posts] = await Promise.all([getListingUniverse(), listPosts(100)]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_DOMAIN}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_DOMAIN}/listings`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_DOMAIN}/listings/in`, changeFrequency: "weekly", priority: 0.7 },
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

  /*
   * One entry per place that has stock, derived from the SAME rows as the
   * listings above. A crawl map that names a place page the site would answer
   * 404 for is worse than one that names none: see `placesWithStock`, which is
   * also what decides the pages exist at all.
   */
  const places: MetadataRoute.Sitemap = placesWithStock(properties).map((place) => ({
    url: `${SITE_DOMAIN}/listings/in/${place.slug}`,
    changeFrequency: "weekly" as const,
    // Broader than a listing and narrower than the index it sits under. A place
    // page outranking the listing it is trying to send people to helps nobody.
    priority: 0.7,
  }));

  return [...staticPages, ...places, ...listings, ...journal];
}
