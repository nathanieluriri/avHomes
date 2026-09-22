import { Hono } from "hono";
import { COLLECTIONS, type Db } from "@avhomes/db";
import { currentDb, currentUser, type AppEnv } from "@avhomes/core";
import { requireAuth } from "@avhomes/identity";
import {
  PUBLIC_PROPERTY_STATUSES,
  hasDomain,
  isAdminRole,
  isScopedRole,
  siteAlerts,
  splitFor,
  visibleAlerts,
  type SiteHealthSnapshot,
} from "@avhomes/contracts";
import { readPublicSettings } from "@avhomes/settings";
import { marketingCounts, readMarketingSettings } from "@avhomes/marketing";
import { soldStillListed } from "./awaiting-close";

/**
 * What the site is currently getting wrong.
 *
 * It lives HERE for the same reason `dashboard.ts` does: it is a read that
 * spans listings, content, enquiries, marketing and settings at once, and no
 * feature package is allowed to know about another. Putting it in any of them
 * would be the cross-import the layout exists to prevent.
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
   *
   * That takes TWO things, and for a while it only had one. `requireAuth()`
   * here is the second; the first is the `domain: null` rule for this path in
   * `packages/identity/src/middleware.ts`. Without it the path fell to the
   * `/api/admin/` catch-all, resolved to `danger`, and 403'd every role except
   * owner and developer, which is the exact set this comment claims to serve.
   * If that rule is ever removed, this comment becomes a lie again.
   */
  routes.get("/admin/health", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    /* Nothing for a role scoped to its own records. Every check here is a count
       over AV Homes' whole site ("your site has no live listings"), which is
       neither a partner's business nor something they can fix. Their own
       listing's gaps are listed on the listing, where they can act on them. */
    if (isScopedRole(user.role)) return c.json({ alerts: [] });
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
  // A suspended company's held listings are off the site, so the health count must not see them either.
  const onSite = {
    status: { $in: [...PUBLIC_PROPERTY_STATUSES] },
    deletedAt: null,
    partnerHold: { $ne: true },
  };

  const [
    publiclyVisible,
    live,
    draft,
    withoutPhotos,
    incomplete,
    withoutMap,
    published,
    postDrafts,
    testimonials,
    siteStats,
    stale,
    settings,
    marketing,
    marketingSettings,
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
    // `mapUrl` post-dates the first listings, so a row written before it is
    // missing the key rather than holding an empty string. Both are "no link".
    properties.countDocuments({
      ...onSite,
      $or: [{ mapUrl: "" }, { mapUrl: { $exists: false } }],
    }),
    posts.countDocuments({ status: "published", deletedAt: null }),
    posts.countDocuments({ status: "draft", deletedAt: null }),
    db.collection(COLLECTIONS.testimonials).countDocuments({ deletedAt: null }),
    db.collection(COLLECTIONS.siteStats).countDocuments({ deletedAt: null }),
    db
      .collection(COLLECTIONS.enquiries)
      .countDocuments({ status: "new", createdAt: { $lt: Date.now() - TWO_DAYS_MS } }),
    readPublicSettings(db),
    marketingCounts(db),
    readMarketingSettings(db),
  ]);

  // The three queues a partner or a marketer is waiting on AV Homes to clear.
  const [submitted, applicationsOpen, soldStill] = await Promise.all([
    properties.countDocuments({ status: "submitted", deletedAt: null }),
    db.collection(COLLECTIONS.partnerApplications).countDocuments({ status: "open" }),
    soldStillListed(db),
  ]);

  return {
    listings: { publiclyVisible, live, draft, withoutPhotos, incomplete, withoutMap, submitted },
    partners: { applicationsOpen },
    posts: { published, draft: postDrafts },
    testimonials,
    siteStats,
    settings,
    enquiries: { stale },
    /* Level 1 is the rate the person who actually closed the deal earns. Zero
       there means the whole split resolves to nothing, whatever the others say.
       Checked on AV Homes' own sale rate, which is the cell every site uses first
       and the only one a brand new site is certain to reach. */
    marketing: {
      ...marketing,
      ratesUnset: splitFor(marketingSettings.commission, "av", "sale").level1 === 0,
      soldStillListed: soldStill.length,
    },
  };
}
