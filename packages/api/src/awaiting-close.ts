import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { currentDb, readQuery, str, type AppEnv } from "@avhomes/core";
import type { AwaitingClose, DealKind, PropertyStatus } from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";

/**
 * Sold, and still advertised.
 *
 * HERE, in the composition root, because the question spans two packages: the
 * deal is marketing's and whether its listing is still up is listings'. Neither
 * may read the other's collection, and the version that lived in marketing could
 * only return every approved deal and leave the listing half of the question to a
 * caller that never existed.
 *
 * Only the two statuses a buyer can still act on count. A sold house sitting in
 * draft or the archive is off the market already; closing it would make it
 * public again as a sold listing, which is a different decision.
 */

const ON_THE_MARKET: readonly PropertyStatus[] = ["live", "under-offer"];

interface DealRow {
  _id: string;
  listingId: string;
  listingTitle?: string;
  listingType: DealKind;
  unitKey?: string;
  amountMinor: number;
  currency: string;
  closerName?: string;
  reporterName?: string;
  reviewedAt?: number;
  createdAt: number;
}

export async function soldStillListed(
  db: Db,
  filter: { listingId?: string; dealId?: string } = {},
): Promise<AwaitingClose[]> {
  /* One approved deal per listing and unit is the partial unique index's rule,
     so this list is bounded by the number of single listings ever sold: small,
     and read without a limit so the oldest forgotten one is never the one cut. */
  const deals = await collection<DealRow>(db, COLLECTIONS.marketingDeals)
    .find(
      {
        status: "approved",
        // A deal written before units existed has no key at all, and it was one thing.
        $or: [{ unitKey: "" }, { unitKey: { $exists: false } }],
        ...(filter.listingId ? { listingId: filter.listingId } : {}),
        ...(filter.dealId ? { _id: filter.dealId } : {}),
      },
      {
        projection: {
          _id: 1,
          listingId: 1,
          listingTitle: 1,
          listingType: 1,
          amountMinor: 1,
          currency: 1,
          closerName: 1,
          reporterName: 1,
          reviewedAt: 1,
          createdAt: 1,
        },
      },
    )
    .toArray();
  if (deals.length === 0) return [];

  const open = await collection<{ _id: string; title?: string }>(db, COLLECTIONS.properties)
    .find(
      {
        _id: { $in: [...new Set(deals.map((deal) => deal.listingId))] },
        status: { $in: [...ON_THE_MARKET] },
        deletedAt: null,
      },
      { projection: { _id: 1, title: 1 } },
    )
    .toArray();
  const titles = new Map(open.map((row) => [row._id, row.title ?? ""]));

  return deals
    .filter((deal) => titles.has(deal.listingId))
    .map((deal) => ({
      dealId: deal._id,
      listingId: deal.listingId,
      // The listing's own title now, falling back to the deal's snapshot of it.
      listingTitle: titles.get(deal.listingId) || deal.listingTitle || "",
      closerName: deal.closerName || deal.reporterName || "",
      kind: deal.listingType,
      amountMinor: deal.amountMinor,
      currency: deal.currency,
      approvedAt: deal.reviewedAt ?? deal.createdAt,
    }))
    .sort((a, b) => a.approvedAt - b.approvedAt);
}

const Query = z
  .object({ listingId: str().max(120).optional(), dealId: str().max(120).optional() })
  .strict();

/** Under `/admin/marketing`, so the domain gate asks for `marketing`: the same people who can close one. */
export function awaitingCloseRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/admin/marketing/awaiting-close", requireAuth(), async (c) => {
    const q = readQuery(c, Query);
    return c.json({ items: await soldStillListed(await currentDb(c), q) });
  });
  return routes;
}
