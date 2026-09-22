import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { clientIp, currentDb, readJson, str, type AppEnv } from "@avhomes/core";
import type { SitePulse } from "@avhomes/contracts";
import {
  PULSE_IP_LIMIT,
  PULSE_NEW_IP_LIMIT,
  PULSE_NEW_WINDOW_MS,
  PULSE_WINDOW_MS,
  limit,
} from "@avhomes/identity";

/**
 * @avhomes/analytics
 *
 * The storefront's own visit counter: one public beacon and one aggregate read.
 * It is a package rather than more code inside @avhomes/api because it is a
 * self-contained feature with a public write and an admin read, and it knows
 * about no other feature package.
 */

/**
 * One document per visit session, and NO IP ADDRESS.
 *
 * The rate limiter already keys on the caller's IP, in its own collection, where
 * a TTL sweeps it within the hour. Repeating it here would turn a counter into a
 * page-view log tied to a person, which is a heavier thing to hold, to describe
 * in a cookie policy and to answer a deletion request about.
 */
interface VisitDoc {
  /** Minted by the client and kept for the life of a tab. */
  _id: string;
  /**
   * UTC `YYYY-MM-DD`, written with `$setOnInsert` and never updated, so a
   * session that crosses midnight counts once, on the day it started.
   */
  day: string;
  firstSeen: number;
  lastSeen: number;
  views: number;
  /** Written only so the TTL index can sweep the row. Never read by the app. */
  expiresAtDate: Date;
}

/** Visits are aggregate fuel, not records. Two comparison windows, then gone. */
const VISIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** "Live" is a claim about right now, so the window is minutes, not hours. */
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const SERIES_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function visits(db: Db) {
  return collection<VisitDoc>(db, COLLECTIONS.visits);
}

/**
 * One listing's count for one UTC day.
 *
 * `views` is every arrival. `sessions` is how many distinct visits reached it,
 * which is the number a funnel wants: one person refreshing a page eleven times
 * is one interested buyer, not eleven.
 */
interface ListingViewDoc {
  /** `<listingId>:<day>`. */
  _id: string;
  listingId: string;
  day: string;
  views: number;
  sessions: number;
  /** Written only so the TTL index can sweep the row. Never read by the app. */
  expiresAtDate: Date;
}

function listingViews(db: Db) {
  return collection<ListingViewDoc>(db, COLLECTIONS.listingViews);
}

/**
 * One listing's count for the day, in one upsert.
 *
 * Keyed `<listingId>:<day>`, so there is no read to race and two beacons arriving
 * together both land. It holds NO PERSON, which keeps the position the visit
 * collection's own comment sets out: the rate limiter already keys on an IP in its
 * own collection where a TTL sweeps it within the hour, and repeating that here
 * would turn a counter into a log of who read what.
 */
async function countListingView(
  db: Db,
  listingId: string,
  first: boolean,
  now: number,
): Promise<void> {
  await listingViews(db).updateOne(
    { _id: `${listingId}:${utcDay(now)}` },
    {
      $setOnInsert: {
        listingId,
        day: utcDay(now),
        expiresAtDate: new Date(now + VISIT_TTL_MS),
      },
      $inc: { views: 1, sessions: first ? 1 : 0 },
    },
    { upsert: true },
  );
}

/**
 * What a beacon changes. A heartbeat moves the clock and nothing else, so only
 * an arrival counts as a page view.
 */
function viewUpdate(now: number, arrived: boolean) {
  return arrived
    ? { $set: { lastSeen: now }, $inc: { views: 1 } }
    : { $set: { lastSeen: now } };
}

/** UTC, because a day boundary that moves with the reader makes two dashboards disagree. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last `count` UTC days, oldest first, ending today. */
function recentDays(now: number, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(utcDay(now - i * DAY_MS));
  return out;
}

const PulseBody = z
  .object({
    /**
     * Becomes the `_id`, so it is bounded and character-restricted here rather
     * than trusted: an unbounded string from an anonymous caller is an unbounded
     * document key, and one containing a dot or a dollar is a key no query in
     * this file could address again.
     */
    sid: str()
      .min(16)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/u, "sid"),
    /**
     * True for a page arrival, absent for the keep-alive heartbeat.
     *
     * Without this the two are the same write and `views` counts beacons, so a
     * tab parked on one page for ten minutes reports eleven page views. A
     * figure whose label names a different quantity from the figure is the
     * failure this whole collection exists to avoid.
     */
    nav: z.boolean().optional(),
    /**
     * Which listing this page is, when it is one.
     *
     * Bounded and character-restricted for the same reason `sid` is: it becomes
     * half of a document key. Absent on every page that is not a listing.
     */
    listing: str()
      .min(4)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/u, "listing")
      .optional(),
    /**
     * True the first time this session sees this listing.
     *
     * CLIENT ASSERTED, which is the same trust the client-minted `sid` already
     * carries and is bounded by the same two rate limiters. The alternative, a
     * list of seen listings on the visit row, is an unbounded array on a document
     * written on every single beacon.
     */
    first: z.boolean().optional(),
    /**
     * Count the listing and leave the visit row alone.
     *
     * The site layout's beacon owns sessions and page views, and it cannot know
     * which listing a page is because the layout wraps every route. So the listing
     * page sends its own beacon with this set, and the two never both count the
     * same arrival as a page view.
     */
    only: z.literal("listing").optional(),
  })
  .strict();

/**
 * The beacon.
 *
 * A public MUTATION, so it is mounted BELOW the origin guard and deliberately
 * NOT in the cacheable `/public/*` router, for the same reason the enquiry
 * intake is not: that router's whole safety property is that a shared cache may
 * store its responses.
 */
export function analyticsPublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/public/pulse", async (c) => {
    // Parsed before the limiter, like the enquiry intake: a schema check is
    // free, the limiter is a database write, and every well-formed request below
    // is still counted.
    const body = await readJson(c, PulseBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    await limit(db, `pulse:${ip}`, PULSE_IP_LIMIT, PULSE_WINDOW_MS);

    const now = Date.now();
    const arrived = body.nav === true;

    /*
     * A listing-only beacon stops here, having counted the listing and touched
     * nothing else. It is a separate call from the layout's so that one arrival is
     * never counted as two page views; see `only` on the body.
     */
    if (body.only === "listing") {
      if (body.listing) await countListingView(db, body.listing, body.first === true, now);
      return c.body(null, 204);
    }

    /*
     * THE UPDATE PATH FIRST, WITHOUT UPSERT, and that split is the whole point.
     *
     * A single upsert cannot tell "this session is still here" from "invent a
     * session", so one ceiling has to cover both and the generous one wins. By
     * trying the update alone, a beacon for a session that already exists costs
     * one write and passes only the loose rate ceiling, while CREATING a row is
     * a second, far tighter bucket that a loop minting fresh ids runs into
     * within the minute.
     *
     * The extra round trip is paid once per session, on its first beacon.
     */
    const touched = await visits(db).updateOne({ _id: body.sid }, viewUpdate(now, arrived));

    if (touched.matchedCount === 0) {
      await limit(db, `pulse-new:${ip}`, PULSE_NEW_IP_LIMIT, PULSE_NEW_WINDOW_MS);
      /*
       * Still an upsert rather than an insert. Two tabs of one session opening
       * together both miss above, and an insert would leave the second dead on
       * a duplicate key; an upsert lets it fall through to the update it should
       * have been. `$setOnInsert` carries `views: 0` only on the heartbeat
       * path, because setting a field that `$inc` also touches is a conflict
       * Mongo refuses outright.
       */
      await visits(db).updateOne(
        { _id: body.sid },
        {
          $setOnInsert: {
            day: utcDay(now),
            firstSeen: now,
            expiresAtDate: new Date(now + VISIT_TTL_MS),
            ...(arrived ? {} : { views: 0 }),
          },
          ...viewUpdate(now, arrived),
        },
        { upsert: true },
      );
    }

    // A beacon has nothing to say back and the client never reads the response,
    // so a JSON body here would be bytes on every page view for nobody.
    return c.body(null, 204);
  });

  return routes;
}

/**
 * The storefront's numbers, for the dashboard.
 *
 * Three queries in flight together rather than one `$facet` pipeline: the live
 * count is a range on `lastSeen` and the two window counts are ranges on `day`,
 * so a facet would force all three through whichever index the pipeline's own
 * `$match` chose and turn the rest into collection scans. Serialising them would
 * add three round trips to Atlas to a screen that already waits on four.
 */
export async function sitePulse(db: Db, now: number = Date.now()): Promise<SitePulse> {
  const days = recentDays(now, SERIES_DAYS);
  const from = days[0];
  const previousFrom = utcDay(now - (SERIES_DAYS * 2 - 1) * DAY_MS);

  const [live, current, previousSessions] = await Promise.all([
    visits(db).countDocuments({ lastSeen: { $gte: now - LIVE_WINDOW_MS } }),
    visits(db)
      .aggregate<{ _id: string; sessions: number; views: number }>([
        { $match: { day: { $gte: from } } },
        { $group: { _id: "$day", sessions: { $sum: 1 }, views: { $sum: "$views" } } },
      ])
      .toArray(),
    // The previous 30 days, so the dashboard can claim a trend from two measured
    // windows instead of from one number and a feeling.
    visits(db).countDocuments({ day: { $gte: previousFrom, $lt: from } }),
  ]);

  const byDay = new Map(current.map((row) => [row._id, row.sessions]));
  /*
   * ZERO-FILLED to exactly SERIES_DAYS entries. A sparkline drawn from only the
   * days that saw traffic is a lie about the shape of the data: three busy days
   * out of thirty would draw as a flat, healthy line rather than three spikes in
   * a desert.
   */
  const series = days.map((day) => ({ day, sessions: byDay.get(day) ?? 0 }));

  return {
    live,
    sessions: series.reduce((total, entry) => total + entry.sessions, 0),
    previousSessions,
    series,
    views: current.reduce((total, row) => total + row.views, 0),
  };
}

/* ═════════════════════════════════════════════════════ PER LISTING COUNTS ══ */

/** UTC `YYYY-MM-DD` for a timestamp, for callers assembling a day range. */
export function dayOf(ms: number): string {
  return utcDay(ms);
}

/**
 * Views and sessions per listing over a day range, for the listings funnel.
 *
 * Takes the ids rather than reading every row in the window, because the funnel is
 * drawn for a PAGE of listings and this collection holds a row per listing per
 * day: a month of a busy site is thirty times the catalogue. An empty
 * `listingIds` returns an empty map rather than everything, which is the safe
 * direction for a scoped caller whose own list came back empty.
 */
export async function listingViewCounts(
  db: Db,
  input: { listingIds: readonly string[]; from: string; to: string },
): Promise<Map<string, { views: number; sessions: number }>> {
  const out = new Map<string, { views: number; sessions: number }>();
  if (input.listingIds.length === 0) return out;

  const rows = await listingViews(db)
    .aggregate<{ _id: string; views: number; sessions: number }>([
      {
        $match: {
          listingId: { $in: [...input.listingIds] },
          day: { $gte: input.from, $lte: input.to },
        },
      },
      {
        $group: {
          _id: "$listingId",
          views: { $sum: "$views" },
          sessions: { $sum: "$sessions" },
        },
      },
    ])
    .toArray();

  for (const row of rows) out.set(row._id, { views: row.views, sessions: row.sessions });
  return out;
}

/**
 * The most looked at listings in a window.
 *
 * Returns ids and counts only. Which of those a caller may SEE is answered where
 * the scope lives, because this package knows nothing about who owns a listing.
 */
export async function topViewedListings(
  db: Db,
  input: {
    from: string;
    to: string;
    limit: number;
    /**
     * Ranks only these. Filtered BEFORE the limit, so a partner gets their own ten
     * best rather than whichever of theirs made the whole site's top ten, which
     * for most partners is none.
     */
    listingIds?: readonly string[];
  },
): Promise<{ listingId: string; views: number; sessions: number }[]> {
  const match: Record<string, unknown> = { day: { $gte: input.from, $lte: input.to } };
  if (input.listingIds) match.listingId = { $in: [...input.listingIds] };
  const rows = await listingViews(db)
    .aggregate<{ _id: string; views: number; sessions: number }>([
      { $match: match },
      {
        $group: {
          _id: "$listingId",
          views: { $sum: "$views" },
          sessions: { $sum: "$sessions" },
        },
      },
      { $sort: { views: -1 } },
      { $limit: input.limit },
    ])
    .toArray();
  return rows.map((row) => ({
    listingId: row._id,
    views: row.views,
    sessions: row.sessions,
  }));
}

/**
 * One listing's daily views, ZERO FILLED across the window.
 *
 * The rule `sitePulse` already holds, for the same reason: a chart drawn from only
 * the days that saw traffic is a lie about the shape of the data.
 */
export async function listingViewSeries(
  db: Db,
  input: { listingId: string; days: number; now?: number },
): Promise<{ day: string; views: number }[]> {
  const now = input.now ?? Date.now();
  const days = recentDays(now, input.days);
  const from = days[0] ?? utcDay(now);
  const rows = await listingViews(db)
    .find({ listingId: input.listingId, day: { $gte: from } })
    .toArray();
  const byDay = new Map(rows.map((row) => [row.day, row.views]));
  return days.map((day) => ({ day, views: byDay.get(day) ?? 0 }));
}

// TODO(test): a heartbeat carrying a listing id increments nothing; only an arrival does.
// TODO(test): `first` absent leaves sessions alone while views still climbs.
// TODO(test): listingViewCounts with an empty id list returns an empty map.
