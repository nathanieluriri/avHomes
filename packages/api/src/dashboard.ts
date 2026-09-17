import { Hono } from "hono";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { currentDb, currentUser, type AppEnv } from "@avhomes/core";
import { hasDomain } from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import { enquiryCounts } from "@avhomes/enquiries";
import { sitePulse } from "@avhomes/analytics";
import { marketingCounts } from "@avhomes/marketing";

/**
 * The dashboard read.
 *
 * It lives HERE, in the composition root's package, because it is the one read
 * that spans listings, content, enquiries, marketing and analytics at once, and
 * no feature package is allowed to know about another. Putting it in any of the
 * five would be the cross-import the layout exists to prevent.
 *
 * There is nothing to inject: every figure is a count over a collection that
 * already exists.
 */
export function dashboardRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/dashboard", requireAuth(), async (c) => {
    const db = await currentDb(c);
    /*
     * The one block on this route that is NOT the same for every caller.
     *
     * The path is gated to `analytics`, which an agent and support both hold,
     * and what a marketer is owed is somebody's pay rather than a site number.
     * So it is read only for the roles whose tile can draw it, and those roles
     * are the ones that would be allowed to open the screen behind it anyway.
     */
    const canSeeMarketing = hasDomain(currentUser(c).role, "marketing");

    // Issued together. They are independent counts and serialising them would
    // add a round trip to Atlas per tile on the first screen after sign-in.
    const [listings, posts, enquiries, recent, pulse, counts] = await Promise.all([
      countsByStatus(db, COLLECTIONS.properties),
      countsByStatus(db, COLLECTIONS.posts),
      enquiryCounts(db),
      recentEnquiries(db),
      sitePulse(db),
      canSeeMarketing ? marketingCounts(db) : null,
    ]);

    return c.json({
      listings,
      posts,
      enquiries,
      recentEnquiries: recent,
      pulse,
      // Four of the five counts. `monthDue` belongs to the alert that names the
      // month, and a tile that repeats it is a second place to keep correct.
      marketing: counts
        ? {
            dealsWaiting: counts.dealsWaiting,
            issuesOpen: counts.issuesOpen,
            owedMinor: counts.owedMinor,
            marketersActive: counts.marketersActive,
          }
        : null,
    });
  });

  return routes;
}

async function countsByStatus(db: Db, name: string): Promise<Record<string, number>> {
  const rows = await db
    .collection(name)
    .aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  const out: Record<string, number> = {};
  for (const row of rows) out[row._id] = row.count;
  return out;
}

async function recentEnquiries(
  db: Db,
): Promise<{ id: string; name: string; status: string; createdAt: number }[]> {
  const rows = await collection<{
    _id: string;
    name: string;
    status: string;
    createdAt: number;
  }>(db, COLLECTIONS.enquiries)
    .find({}, { projection: { _id: 1, name: 1, status: 1, createdAt: 1 }, sort: { createdAt: -1 }, limit: 5 })
    .toArray();
  return rows.map((r) => ({ id: r._id, name: r.name, status: r.status, createdAt: r.createdAt }));
}
