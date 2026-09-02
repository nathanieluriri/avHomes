import { Hono } from "hono";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { currentDb, type AppEnv } from "@avhomes/core";
import { requireAuth } from "@avhomes/identity";
import { enquiryCounts } from "@avhomes/enquiries";
import { sitePulse } from "@avhomes/analytics";

/**
 * The dashboard read.
 *
 * It lives HERE, in the composition root's package, because it is the one read
 * that spans listings, content, enquiries and analytics at once, and no feature
 * package is allowed to know about another. Putting it in any of the four would
 * be the cross-import the layout exists to prevent.
 *
 * There is nothing to inject: every figure is a count over a collection that
 * already exists.
 */
export function dashboardRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/dashboard", requireAuth(), async (c) => {
    const db = await currentDb(c);

    // Issued together. They are independent counts and serialising them would
    // add a round trip to Atlas per tile on the first screen after sign-in.
    const [listings, posts, enquiries, recent, pulse] = await Promise.all([
      countsByStatus(db, COLLECTIONS.properties),
      countsByStatus(db, COLLECTIONS.posts),
      enquiryCounts(db),
      recentEnquiries(db),
      sitePulse(db),
    ]);

    return c.json({ listings, posts, enquiries, recentEnquiries: recent, pulse });
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
