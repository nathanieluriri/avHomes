import type { MetadataRoute } from "next";

import { SITE_DOMAIN } from "@/lib/api-config";

/**
 * There was no robots.txt at all, so `/robots.txt` answered 404 and the console
 * was as crawlable as the storefront.
 *
 * `/admin` is disallowed here AND carries `robots: { index: false }` in its own
 * layout metadata, which is not redundant. This file is a request not to crawl,
 * honoured only by a crawler that reads it and asked for on a path the crawler
 * has to find first; the meta tag is a request not to INDEX, and it travels with
 * the page for anything that reaches it by a link rather than by this file. The
 * console also answers a 200 HTML shell to an anonymous request, so a crawler
 * that ignored both would find a page rather than a redirect.
 *
 * `/api` is disallowed for a duller reason: every route under it answers JSON
 * or 401, and a crawl budget spent on 401s is a crawl budget not spent on the
 * listings.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${SITE_DOMAIN}/sitemap.xml`,
    host: SITE_DOMAIN,
  };
}
