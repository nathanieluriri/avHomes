import { Hono } from "hono";
import { z } from "zod";
import {
  NotFoundError,
  assertCursorSort,
  clampLimit,
  currentDb,
  pathParam,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import { PROPERTY_TYPES } from "@avhomes/contracts";
import {
  getPropertyBySlug,
  getSimilarProperties,
  listProperties,
  listSiteStats,
  listTestimonials,
} from "../repo";
import { PROPERTY_SORT_NAMES } from "../schema";

/**
 * The public listing reads.
 *
 * MOUNTED ABOVE sessionMiddleware, and that placement is the security property,
 * not a performance one. Every response here carries `Cache-Control: public`, so
 * a shared cache may store one and hand it to a different reader. A cacheable
 * response that is ABLE to vary by cookie is one edit away from serving one
 * visitor's view to another.
 *
 * Mounted here, `c.get('user')` is undefined on every request that reaches this
 * router: the middleware that would resolve a session has not run and cannot be
 * reached from inside. Cookieless by CONSTRUCTION, not by review.
 *
 * There is NO MUTATION in this file, and there must never be one. The enquiry
 * POST is public too and lives below the origin guard for exactly that reason.
 */

const ListQuery = z
  .object({
    sort: z.enum(PROPERTY_SORT_NAMES).default("newest"),
    limit: str().optional(),
    cursor: str().max(600).optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    city: str().max(120).optional(),
    bedrooms: z.coerce.number().int().min(0).max(50).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    featured: z.enum(["1", "0"]).optional(),
    status: z.enum(["for-sale", "for-rent", "sold"]).optional(),
    q: str().max(200).optional(),
  })
  .strict();

/** Public reads may be cached; the numbers are the site's ISR window, not a guess. */
const LIST_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const DETAIL_CACHE = "public, max-age=60, s-maxage=600, stale-while-revalidate=3600";

export function listingsPublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/public/properties", async (c) => {
    const q = readQuery(c, ListQuery);
    // Every refusal this request can earn is decided BEFORE a client is built,
    // so a malformed cursor or limit costs no round trip to Atlas.
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, q.sort);

    const page = await listProperties(await currentDb(c), {
      sort: q.sort,
      limit,
      cursor: q.cursor,
      type: q.type,
      city: q.city,
      bedrooms: q.bedrooms,
      minPriceMinor: q.minPrice,
      maxPriceMinor: q.maxPrice,
      featured: q.featured === undefined ? undefined : q.featured === "1",
      status: q.status,
      q: q.q,
      includeHidden: false,
    });
    c.header("cache-control", LIST_CACHE);
    return c.json(page);
  });

  /**
   * The detail read, with its similar listings in the same response.
   *
   * One request rather than two, because the page renders both together and a
   * second round trip from the site's server component is a second cold read
   * against Atlas for one screen.
   */
  routes.get("/public/properties/:slug", async (c) => {
    const db = await currentDb(c);
    const slug = pathParam(c, "slug");
    const property = await getPropertyBySlug(db, slug);
    if (!property) throw new NotFoundError(`property ${slug}`);
    const similar = await getSimilarProperties(db, property);
    c.header("cache-control", DETAIL_CACHE);
    return c.json({ property, similar });
  });

  /**
   * Testimonials and counters in one call.
   *
   * They are two collections and one section of one page. Splitting them into
   * two routes would make the landing page pay two round trips to render a strip
   * of numbers and three quotes.
   */
  routes.get("/public/site", async (c) => {
    const db = await currentDb(c);
    const [testimonials, stats] = await Promise.all([listTestimonials(db), listSiteStats(db)]);
    c.header("cache-control", DETAIL_CACHE);
    return c.json({ testimonials, stats });
  });

  return routes;
}
