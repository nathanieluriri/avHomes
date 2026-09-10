import { Hono } from "hono";
import { COLLECTIONS, type Db } from "@avhomes/db";
import { currentDb, currentUser, type AppEnv } from "@avhomes/core";
import { requireAuth } from "@avhomes/identity";
import {
  PUBLIC_PROPERTY_STATUSES,
  hasDomain,
  isAdminRole,
  siteAlerts,
  visibleAlerts,
  type SiteHealthSnapshot,
} from "@avhomes/contracts";
import { readPublicSettings } from "@avhomes/settings";

/**
 * What the site is currently getting wrong.
 *
 * It lives HERE for the same reason `dashboard.ts` does: it is a read that
 * spans listings, content, enquiries and settings at once, and no feature
 * package is allowed to know about another. Putting it in any of them would be
 * the cross-import the layout exists to prevent.
 *
 * The JUDGEMENT is not here. This file gathers counts and hands them to
 * `siteAlerts` in contracts, which decides what is wrong and how to say it.
 * That split is what lets the console render the same list without a second
 * copy of the rules drifting out of step with this one.
 */

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export function healthRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /*
   * ANY SIGNED-IN member, then filtered to what their role could actually act
   * on. The alternative was an admin-only endpoint, which would leave an agent
   * with no way to see that half their listings have no photographs.
   */
  routes.get("/admin/health", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const snapshot = await gather(db);
    const alerts = visibleAlerts(siteAlerts(snapshot), (domain) =>
      domain === null ? isAdminRole(user.role) : hasDomain(user.role, domain),
    );
    return c.json({ alerts });
  });

  return routes;
}

/**
 * One pass, issued together.
 *
 * Every figure is a count over a collection that already exists, and they are
 * independent, so serialising them would add a round trip to Atlas per check
 * for no gain.
 */
async function gather(db: Db): Promise<SiteHealthSnapshot> {
  const properties = db.collection(COLLECTIONS.properties);
  const posts = db.collection(COLLECTIONS.posts);

  // The same list the public repo reads, so a check can never disagree with the
  // site about what is on it.
  const onSite = { status: { $in: [...PUBLIC_PROPERTY_STATUSES] }, deletedAt: null };

  const [
    publiclyVisible,
    live,
    draft,
    withoutPhotos,
    incomplete,
    published,
    postDrafts,
    testimonials,
    siteStats,
    stale,
    settings,
  ] = await Promise.all([
    properties.countDocuments(onSite),
    properties.countDocuments({ status: "live", deletedAt: null }),
    properties.countDocuments({ status: "draft", deletedAt: null }),
    // `$size: 0` does not match a document with no `images` key at all, and a
    // row written before the field existed has exactly that shape.
    properties.countDocuments({
      ...onSite,
      $or: [{ images: { $size: 0 } }, { images: { $exists: false } }],
    }),
    // Publish gates on a non-empty title and nothing else, so these are the two
    // fields whose absence a visitor actually notices.
    properties.countDocuments({
      ...onSite,
      $or: [{ priceMinor: { $lte: 0 } }, { address: "" }, { address: { $exists: false } }],
    }),
    posts.countDocuments({ status: "published", deletedAt: null }),
    posts.countDocuments({ status: "draft", deletedAt: null }),
    db.collection(COLLECTIONS.testimonials).countDocuments({ deletedAt: null }),
    db.collection(COLLECTIONS.siteStats).countDocuments({ deletedAt: null }),
    db
      .collection(COLLECTIONS.enquiries)
      .countDocuments({ status: "new", createdAt: { $lt: Date.now() - TWO_DAYS_MS } }),
    readPublicSettings(db),
  ]);

  return {
    listings: { publiclyVisible, live, draft, withoutPhotos, incomplete },
    posts: { published, draft: postDrafts },
    testimonials,
    siteStats,
    settings,
    enquiries: { stale },
  };
}
