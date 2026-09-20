import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  clampLimit,
  currentDb,
  currentUser,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  CLOSER_KINDS,
  DEAL_KINDS,
  DEFAULT_CURRENCY,
  DEFAULT_PERIOD_KEY,
  FUNNEL_SORTS,
  OWNERSHIPS,
  PERIOD_KEYS,
  hasDomain,
  isPeriodKey,
  isScopedRole,
  quarterFinished,
  quarterOf,
  quarterRange,
  ratePerson,
  resolvePeriod,
  type AnalyticsOverview,
  type CloserKind,
  type DealKind,
  type FunnelSort,
  type ListingFunnelPage,
  type ListingFunnelRow,
  type MoneyOverview,
  type Ownership,
  type PartnerMoney,
  type PartnerSaleRow,
  type PeoplePage,
  type Period,
  type PersonRow,
  type PropertyStatus,
  type RatingTops,
  type RewardOutlook,
  type RewardStanding,
  type TrafficReport,
  type TransactionPage,
  type TransactionRow,
  type ValuePoint,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import {
  dayOf,
  listingViewCounts,
  sitePulse,
  topViewedListings,
} from "@avhomes/analytics";
import { fundBalances, getAward } from "@avhomes/funds";
import { readMarketingSettings } from "@avhomes/marketing";

/**
 * The analytics section's reads.
 *
 * They live HERE, beside `dashboard.ts`, for the reason that file states: these are
 * the reads that span listings, marketing, funds, enquiries and the visit counters
 * at once, and no feature package is allowed to know about another. Putting them in
 * any one of the five would be the cross-import the layout exists to prevent.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO RULES HOLD EVERY ROUTE IN THIS FILE.
 *
 * 1. **The scope is resolved once, by `scopeFor`, and every query applies it.**
 *    A partner reads their own listings and nothing else, and that has to be
 *    true of a page somebody adds next month without reading this comment.
 *
 * 2. **Every response ECHOES the period it resolved.** A screen captions its
 *    figures from what came back, not from what it asked for. A figure whose
 *    label names a different quantity from the figure is the failure this whole
 *    section exists to avoid, and the way it happens is a screen asking for 30
 *    days, getting something else, and captioning it from the request.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════════════════════ SCOPE ══ */

interface Scope {
  /** Null means every listing. A list means only these. */
  listingIds: string[] | null;
  /** False hides every money figure: the caller holds analytics but not marketing. */
  money: boolean;
  /** True renders the partner's reduced money shape instead of the full one. */
  partner: boolean;
}

/**
 * What this caller may count.
 *
 * A partner's own listing ids are resolved ONCE per request and passed to every
 * query, rather than each query joining against the properties collection. The set
 * is small, it is their own stock, and a `$lookup` per figure would be six of them
 * on the overview alone.
 *
 * An empty list is a real answer, not a missing filter: a partner with no listings
 * counts nothing, which is why every reader here treats `[]` as "match nothing"
 * rather than "match everything".
 */
async function scopeFor(db: Db, user: ReturnType<typeof currentUser>): Promise<Scope> {
  const scoped = isScopedRole(user.role);
  if (!scoped) {
    return { listingIds: null, money: hasDomain(user.role, "marketing"), partner: false };
  }
  const rows = await collection<{ _id: string }>(db, COLLECTIONS.properties)
    .find({ agentUserId: user.id }, { projection: { _id: 1 } })
    .toArray();
  return { listingIds: rows.map((row) => row._id), money: true, partner: true };
}

/** The listing filter a scope adds, as a Mongo fragment. */
function listingFilter(scope: Scope, field: string): Record<string, unknown> {
  if (scope.listingIds === null) return {};
  return { [field]: { $in: scope.listingIds } };
}

/* ══════════════════════════════════════════════════════════════════ PERIOD ══ */

const PeriodQuery = z
  .object({ period: z.enum(PERIOD_KEYS).optional() })
  .strict();

function periodFrom(raw: string | undefined): Period {
  return resolvePeriod(raw && isPeriodKey(raw) ? raw : DEFAULT_PERIOD_KEY);
}

/** A settled deal inside the window, as every money read matches it. */
function dealMatch(period: Period, scope: Scope): Record<string, unknown> {
  return {
    status: "approved",
    closedOn: { $gte: period.from, $lt: period.to },
    ...listingFilter(scope, "listingId"),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every UTC day in the window, oldest first, so a series can be zero filled. */
function daysBetween(from: number, to: number): string[] {
  const out: string[] = [];
  /* Capped, because "all time" would otherwise draw a point per day since the
     site opened and a sparkline cannot say anything with four thousand of them. */
  const start = Math.max(from, to - 180 * DAY_MS);
  for (let at = start; at < to + DAY_MS; at += DAY_MS) out.push(dayOf(at));
  return out;
}

/* ════════════════════════════════════════════════════════════════════ MONEY ══ */

interface DealRow {
  _id: string;
  closedOn: number;
  listingId: string;
  listingTitle?: string;
  ownership?: Ownership;
  listingType: DealKind;
  amountMinor: number;
  currency: string;
  closerKind?: CloserKind;
  closerId?: string;
  closerName?: string;
  source?: "app" | "console";
  status: string;
  shares?: { marketerId: string; marketerName: string; code: string; level: 1 | 2 | 3; rate: number; amountMinor: number }[];
  fundShares?: { fund: "reward" | "foundation"; rate: number; amountMinor: number }[];
  keptMinor?: number;
  proof?: string[];
}

function deals(db: Db) {
  return collection<DealRow>(db, COLLECTIONS.marketingDeals);
}

function zeroByKey<K extends string>(keys: readonly K[]): Record<K, { valueMinor: number; deals: number }> {
  const out = {} as Record<K, { valueMinor: number; deals: number }>;
  for (const key of keys) out[key] = { valueMinor: 0, deals: 0 };
  return out;
}

/**
 * What the business did in the window.
 *
 * One pass over the settled deals rather than an aggregation per breakdown. The
 * set is bounded by the period and every figure below is a sum over the same rows,
 * so six pipelines would be six scans of one answer.
 */
async function moneyOverview(
  db: Db,
  period: Period,
  scope: Scope,
  currency: string,
): Promise<MoneyOverview> {
  const rows = await deals(db).find(dealMatch(period, scope)).toArray();

  const byOwnership = zeroByKey(OWNERSHIPS);
  const byKind = zeroByKey(DEAL_KINDS);
  const byCloser = zeroByKey(CLOSER_KINDS);
  const byDay = new Map<string, { valueMinor: number; deals: number }>();

  let valueMinor = 0;
  let commissionMinor = 0;
  let keptMinor = 0;
  let rewardMinor = 0;
  let foundationMinor = 0;

  for (const row of rows) {
    valueMinor += row.amountMinor;
    commissionMinor += (row.shares ?? []).reduce((sum, share) => sum + share.amountMinor, 0);
    keptMinor += row.keptMinor ?? 0;
    for (const share of row.fundShares ?? []) {
      if (share.fund === "reward") rewardMinor += share.amountMinor;
      else foundationMinor += share.amountMinor;
    }

    const ownership = row.ownership ?? "av";
    byOwnership[ownership].valueMinor += row.amountMinor;
    byOwnership[ownership].deals += 1;
    byKind[row.listingType].valueMinor += row.amountMinor;
    byKind[row.listingType].deals += 1;
    const closer = row.closerKind ?? "marketer";
    byCloser[closer].valueMinor += row.amountMinor;
    byCloser[closer].deals += 1;

    const day = dayOf(row.closedOn);
    const found = byDay.get(day) ?? { valueMinor: 0, deals: 0 };
    byDay.set(day, {
      valueMinor: found.valueMinor + row.amountMinor,
      deals: found.deals + 1,
    });
  }

  /*
   * The previous window, counted rather than guessed, and NULL when there is none.
   *
   * "All time" has nothing before it, so it reports null and the screen says "first
   * activity in this window" instead of dividing by zero and drawing an arrow.
   */
  let previousValueMinor: number | null = null;
  let previousDeals: number | null = null;
  if (period.previousFrom !== null) {
    const before = await deals(db)
      .find({
        status: "approved",
        closedOn: { $gte: period.previousFrom, $lt: period.from },
        ...listingFilter(scope, "listingId"),
      })
      .toArray();
    previousValueMinor = before.reduce((sum, row) => sum + row.amountMinor, 0);
    previousDeals = before.length;
  }

  /* ZERO FILLED across the window. A chart drawn from only the days that saw a
     deal is a lie about the shape of the data, the rule sitePulse already holds. */
  const series: ValuePoint[] = daysBetween(period.from, period.to).map((day) => {
    const found = byDay.get(day);
    return { day, valueMinor: found?.valueMinor ?? 0, deals: found?.deals ?? 0 };
  });

  return {
    currency,
    valueMinor,
    deals: rows.length,
    previousValueMinor,
    previousDeals,
    commissionMinor,
    keptMinor,
    rewardMinor,
    foundationMinor,
    byOwnership,
    byKind,
    byCloser,
    series,
  };
}

/* ═══════════════════════════════════════════════════════════════ STANDINGS ══ */

/**
 * The league, from the deals a window settled.
 *
 * Grouped by the CLOSER, not the reporter, which is the whole reason that field
 * exists: a deal an admin recorded has an admin as its reporter, and ranking by
 * that would credit the person who typed it in.
 */
async function standingsFor(
  db: Db,
  window: { from: number; to: number },
  scope: Scope,
): Promise<RewardStanding[]> {
  const rows = await deals(db)
    .find({
      status: "approved",
      closedOn: { $gte: window.from, $lt: window.to },
      ...listingFilter(scope, "listingId"),
    })
    .toArray();

  const byPerson = new Map<
    string,
    { kind: "marketer" | "staff"; id: string; name: string; code: string; deals: number; valueMinor: number }
  >();

  for (const row of rows) {
    const kind = row.closerKind ?? "marketer";
    // A walk-in has nobody to rank. Its value still counts in the money figures.
    if (kind === "direct") continue;
    const id = row.closerId ?? "";
    if (id === "") continue;
    const key = `${kind}:${id}`;
    const found = byPerson.get(key) ?? {
      kind: kind === "staff" ? ("staff" as const) : ("marketer" as const),
      id,
      name: row.closerName ?? "",
      code: "",
      deals: 0,
      valueMinor: 0,
    };
    found.deals += 1;
    found.valueMinor += row.amountMinor;
    if (found.name === "") found.name = row.closerName ?? "";
    byPerson.set(key, found);
  }

  /* Ranked on VALUE CLOSED and nothing else. It is the one number nobody can
     argue with, which is what a prize needs. The score is shown beside it. */
  return [...byPerson.values()]
    .sort((a, b) => b.valueMinor - a.valueMinor || b.deals - a.deals)
    .map((person, index) => ({
      rank: index + 1,
      kind: person.kind,
      personId: person.id,
      name: person.name,
      code: person.code,
      deals: person.deals,
      valueMinor: person.valueMinor,
      score: 0,
    }));
}

/** The current quarter's prize, and whether it can be closed yet. */
async function rewardOutlook(
  db: Db,
  scope: Scope,
  potMinor: number,
  currency: string,
): Promise<RewardOutlook> {
  const quarter = quarterOf(Date.now());
  const range = quarterRange(quarter);
  const [standings, award] = await Promise.all([
    standingsFor(db, range, scope),
    getAward(db, quarter),
  ]);
  return {
    quarter,
    label: quarter,
    potMinor,
    currency,
    standings: standings.slice(0, 10),
    closable: quarterFinished(quarter),
    award,
  };
}

/* ══════════════════════════════════════════════════════════════════ ROUTES ══ */

export function analyticsConsoleRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /**
   * The overview, in one request.
   *
   * One round trip for the first screen, the same reasoning `dashboard.ts` uses for
   * its six parallel counts: a tile per request turns one screen into six waits.
   */
  routes.get("/admin/analytics/overview", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const scope = await scopeFor(db, currentUser(c));
    const period = periodFrom(readQuery(c, PeriodQuery).period);
    const settings = await readMarketingSettings(db);

    const [money, funds, pulse, listingCounts] = await Promise.all([
      scope.money ? moneyOverview(db, period, scope, settings.currency) : null,
      scope.money && !scope.partner
        ? fundBalances(db, {
            reward: settings.rewardPoolName,
            foundation: settings.foundationName,
          })
        : null,
      sitePulse(db),
      listingCountsFor(db, scope, period),
    ]);

    /* The prize is an AV Homes matter. A partner is not in the league and their
       own listings feeding the pool is not something they get a view of. */
    const reward =
      scope.money && !scope.partner
        ? await rewardOutlook(
            db,
            scope,
            funds?.find((fund) => fund.fund === "reward")?.balanceMinor ?? 0,
            settings.currency,
          )
        : null;

    const body: AnalyticsOverview = {
      period,
      money,
      funds,
      reward,
      pulse,
      listings: listingCounts,
      scoped: scope.partner,
    };
    return c.json(body);
  });

  /** Every recorded transaction, newest first. Keyset on `closedOn`. */
  routes.get("/admin/analytics/transactions", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const scope = await scopeFor(db, currentUser(c));
    if (!scope.money) throw new BadRequestError("money", [
      { path: "role", message: "this role does not read money figures" },
    ]);

    const query = readQuery(
      c,
      z
        .object({
          period: z.enum(PERIOD_KEYS).optional(),
          ownership: z.enum(OWNERSHIPS).optional(),
          kind: z.enum(DEAL_KINDS).optional(),
          closer: z.enum(CLOSER_KINDS).optional(),
          limit: str().max(8).optional(),
          before: z.coerce.number().int().optional(),
        })
        .strict(),
    );
    const period = periodFrom(query.period);
    const limit = clampLimit(query.limit);

    const filter: Record<string, unknown> = dealMatch(period, scope);
    if (query.ownership) filter.ownership = query.ownership;
    if (query.kind) filter.listingType = query.kind;
    if (query.closer) filter.closerKind = query.closer;
    if (query.before !== undefined) {
      filter.closedOn = { $gte: period.from, $lt: Math.min(query.before, period.to) };
    }

    const rows = await deals(db)
      .find(filter, { sort: { closedOn: -1, _id: -1 }, limit: limit + 1 })
      .toArray();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    /*
     * The PERIOD's totals, not the page's, and the screen labels them as such.
     * A page total under a filtered list is the number people mistake for the
     * answer, so it is the whole window that is summed here.
     */
    const totals = await deals(db)
      .aggregate<{ _id: null; valueMinor: number; count: number }>([
        { $match: dealMatch(period, scope) },
        { $group: { _id: null, valueMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
      ])
      .toArray();

    const settings = await readMarketingSettings(db);
    const body: TransactionPage = {
      period,
      rows: page.map(toTransactionRow),
      nextCursor: rows.length > limit && last ? String(last.closedOn) : null,
      totalValueMinor: totals[0]?.valueMinor ?? 0,
      totalDeals: totals[0]?.count ?? 0,
      currency: settings.currency,
      fundNames: {
        reward: settings.rewardPoolName,
        foundation: settings.foundationName,
      },
    };
    return c.json(body);
  });

  /**
   * The funnel: views, enquiries, leads, sold, per listing.
   *
   * The page exists for the row with many views and no enquiries, so `ignored`
   * is counted server side rather than left to a screen to notice.
   */
  routes.get("/admin/analytics/listings", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const scope = await scopeFor(db, currentUser(c));
    const query = readQuery(
      c,
      z
        .object({
          period: z.enum(PERIOD_KEYS).optional(),
          sort: z.enum(FUNNEL_SORTS).optional(),
          limit: str().max(8).optional(),
        })
        .strict(),
    );
    const period = periodFrom(query.period);
    const sort: FunnelSort = query.sort ?? "views";
    const limit = clampLimit(query.limit);

    const properties = await collection<{
      _id: string;
      title: string;
      slug: string | null;
      ownership?: Ownership;
      status: PropertyStatus;
      priceMinor: number;
      currency: string;
      publishedAt: number | null;
      closedDealId?: string | null;
      deletedAt: number | null;
    }>(db, COLLECTIONS.properties)
      .find(
        { deletedAt: null, ...(scope.listingIds ? { _id: { $in: scope.listingIds } } : {}) },
        {
          projection: {
            _id: 1, title: 1, slug: 1, ownership: 1, status: 1,
            priceMinor: 1, currency: 1, publishedAt: 1, closedDealId: 1, deletedAt: 1,
          },
          limit,
        },
      )
      .toArray();

    const ids = properties.map((row) => row._id);
    const from = dayOf(period.from);
    const to = dayOf(period.to);

    const [views, enquiries, leads, sold] = await Promise.all([
      listingViewCounts(db, { listingIds: ids, from, to }),
      countBy(db, COLLECTIONS.enquiries, "propertyId", ids),
      countBy(db, COLLECTIONS.marketingLeads, "listingId", ids),
      soldByListing(db, ids, period),
    ]);

    const now = Date.now();
    const rows: ListingFunnelRow[] = properties.map((row) => {
      const seen = views.get(row._id) ?? { views: 0, sessions: 0 };
      const closedAt = sold.get(row._id)?.closedOn ?? null;
      return {
        listingId: row._id,
        title: row.title,
        slug: row.slug ?? null,
        ownership: row.ownership ?? "av",
        status: row.status,
        priceMinor: row.priceMinor ?? 0,
        currency: row.currency ?? DEFAULT_CURRENCY,
        views: seen.views,
        sessions: seen.sessions,
        enquiries: enquiries.get(row._id) ?? 0,
        leads: leads.get(row._id) ?? 0,
        soldMinor: sold.get(row._id)?.amountMinor ?? null,
        /* Published to closed, or published to now while it is still on the
           market. Null when it was never published, where "days on market" would
           be a number about a listing that never reached one. */
        daysOnMarket:
          row.publishedAt === null
            ? null
            : Math.max(0, Math.round(((closedAt ?? now) - row.publishedAt) / DAY_MS)),
      };
    });

    const ordered = [...rows].sort((a, b) => {
      switch (sort) {
        case "enquiries":
          return b.enquiries - a.enquiries;
        case "leads":
          return b.leads - a.leads;
        case "days":
          return (b.daysOnMarket ?? -1) - (a.daysOnMarket ?? -1);
        case "price":
          return b.priceMinor - a.priceMinor;
        default:
          return b.views - a.views;
      }
    });

    const body: ListingFunnelPage = {
      period,
      rows: ordered,
      sort,
      nextCursor: null,
      /* Looked at and never enquired about. The number this page is for. */
      ignored: ordered.filter((row) => row.views > 0 && row.enquiries === 0).length,
    };
    return c.json(body);
  });

  /** The league, with each person's score and its breakdown. */
  routes.get("/admin/analytics/people", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const scope = await scopeFor(db, user);
    /* A partner does not read the league. It is other people's performance and
       their own listings appearing in it would not make it theirs. */
    if (scope.partner || !scope.money) {
      throw new BadRequestError("people", [
        { path: "role", message: "this role does not read the league" },
      ]);
    }

    const period = periodFrom(readQuery(c, PeriodQuery).period);
    const settings = await readMarketingSettings(db);
    const standings = await standingsFor(db, { from: period.from, to: period.to }, scope);
    const leads = await leadOutcomes(db, period);

    /*
     * The TOPS are worked out across the whole league before anybody is scored,
     * which is why this cannot be a query per person: a score is relative to the
     * best in the period, and the best is not known until every row is in.
     */
    const tops: RatingTops = {
      valueMinor: standings.reduce((best, row) => Math.max(best, row.valueMinor), 0),
      deals: standings.reduce((best, row) => Math.max(best, row.deals), 0),
    };

    const rows: PersonRow[] = standings.map((row) => {
      const lead = leads.get(row.personId) ?? { decided: 0, won: 0, medianDays: 0 };
      const rating = ratePerson(
        {
          valueMinor: row.valueMinor,
          deals: row.deals,
          leadsDecided: lead.decided,
          leadsWon: lead.won,
          medianDays: lead.medianDays,
        },
        settings.rating,
        tops,
      );
      return {
        kind: row.kind,
        personId: row.personId,
        name: row.name,
        code: row.code,
        deals: row.deals,
        valueMinor: row.valueMinor,
        /* Staff are salaried: they rank and they win prizes, they do not earn
           commission, and showing a figure here would invent one. */
        earnedMinor: row.kind === "staff" ? 0 : 0,
        leadsDecided: lead.decided,
        leadsWon: lead.won,
        rating,
      };
    });

    /* Earnings come from the ledger, not from the deal's shares: a clawback means
       what somebody was paid is not what their deals once said. */
    const earned = await earningsByMarketer(db, period);
    for (const row of rows) {
      if (row.kind === "marketer") row.earnedMinor = earned.get(row.personId) ?? 0;
    }

    const body: PeoplePage = {
      period,
      rows,
      currency: settings.currency,
      weights: settings.rating,
    };
    return c.json(body);
  });

  /** Traffic. The same numbers the dashboard strip shows, plus per listing. */
  routes.get("/admin/analytics/traffic", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const scope = await scopeFor(db, currentUser(c));
    const period = periodFrom(readQuery(c, PeriodQuery).period);

    const [pulse, top] = await Promise.all([
      sitePulse(db),
      topViewedListings(db, { from: dayOf(period.from), to: dayOf(period.to), limit: 10 }),
    ]);

    /* Titles resolved after the counts, and FILTERED by the scope: a partner sees
       their own listings in the table and nobody else's, even though the counter
       itself knows nothing about who owns what. */
    const allowed = scope.listingIds === null ? null : new Set(scope.listingIds);
    const visible = top.filter((row) => allowed === null || allowed.has(row.listingId));
    const titles = await titlesFor(db, visible.map((row) => row.listingId));

    const body: TrafficReport = {
      period,
      pulse,
      top: visible.map((row) => ({
        listingId: row.listingId,
        title: titles.get(row.listingId) ?? "A listing that has since gone",
        views: row.views,
        sessions: row.sessions,
      })),
    };
    return c.json(body);
  });

  /**
   * A partner's own money: what their property sold for, AV Homes' total fee and
   * their net.
   *
   * A separate route from `transactions` rather than a flag on it, because the
   * shape is genuinely different: there is no `shares` array on it at all. An
   * outside party does not read which marketer earned what, and the safest way to
   * guarantee that is for the response to have nowhere to put it.
   */
  routes.get("/admin/analytics/my-sales", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const scope = await scopeFor(db, currentUser(c));
    const period = periodFrom(readQuery(c, PeriodQuery).period);
    const settings = await readMarketingSettings(db);

    const rows = await deals(db)
      .find(dealMatch(period, scope), { sort: { closedOn: -1 } })
      .toArray();

    const sales: PartnerSaleRow[] = rows.map((row) => {
      /* The fee is what AV Homes took in total: every person's share plus both
         funds plus what it kept. Summed rather than derived from a rate, so a deal
         settled under an older rate table still reports the truth. */
      const feeMinor =
        (row.shares ?? []).reduce((sum, share) => sum + share.amountMinor, 0) +
        (row.fundShares ?? []).reduce((sum, share) => sum + share.amountMinor, 0) +
        (row.keptMinor ?? 0);
      return {
        listingId: row.listingId,
        title: row.listingTitle ?? "",
        closedOn: row.closedOn,
        kind: row.listingType,
        soldMinor: row.amountMinor,
        feeMinor,
        netMinor: row.amountMinor - feeMinor,
        currency: row.currency ?? settings.currency,
      };
    });

    const body: PartnerMoney = {
      period,
      rows: sales,
      soldMinor: sales.reduce((sum, row) => sum + row.soldMinor, 0),
      feeMinor: sales.reduce((sum, row) => sum + row.feeMinor, 0),
      netMinor: sales.reduce((sum, row) => sum + row.netMinor, 0),
      currency: settings.currency,
    };
    return c.json(body);
  });

  return routes;
}

/* ═════════════════════════════════════════════════════════════════ HELPERS ══ */

function toTransactionRow(row: DealRow): TransactionRow {
  return {
    dealId: row._id,
    closedOn: row.closedOn,
    listingId: row.listingId,
    listingTitle: row.listingTitle ?? "",
    ownership: row.ownership ?? "av",
    kind: row.listingType,
    amountMinor: row.amountMinor,
    currency: row.currency ?? DEFAULT_CURRENCY,
    closerKind: row.closerKind ?? "marketer",
    closerName: row.closerName ?? "",
    source: row.source ?? "app",
    status: row.status as TransactionRow["status"],
    shares: row.shares ?? [],
    fundShares: row.fundShares ?? [],
    keptMinor: row.keptMinor ?? 0,
    proof: row.proof ?? [],
  };
}

/** How many rows in `name` point at each of `ids` through `field`. */
async function countBy(
  db: Db,
  name: string,
  field: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await db
    .collection(name)
    .aggregate<{ _id: string; count: number }>([
      { $match: { [field]: { $in: [...ids] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) out.set(row._id, row.count);
  return out;
}

/** What each of these listings sold for in the window, if it did. */
async function soldByListing(
  db: Db,
  ids: readonly string[],
  period: Period,
): Promise<Map<string, { amountMinor: number; closedOn: number }>> {
  const out = new Map<string, { amountMinor: number; closedOn: number }>();
  if (ids.length === 0) return out;
  const rows = await deals(db)
    .find(
      {
        status: "approved",
        listingId: { $in: [...ids] },
        closedOn: { $gte: period.from, $lt: period.to },
      },
      { projection: { listingId: 1, amountMinor: 1, closedOn: 1 } },
    )
    .toArray();
  for (const row of rows) {
    out.set(row.listingId, { amountMinor: row.amountMinor, closedOn: row.closedOn });
  }
  return out;
}

async function titlesFor(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await collection<{ _id: string; title: string }>(db, COLLECTIONS.properties)
    .find({ _id: { $in: [...ids] } }, { projection: { _id: 1, title: 1 } })
    .toArray();
  for (const row of rows) out.set(row._id, row.title);
  return out;
}

/** Live, in review, and closed in the window. Three counts a screen states plainly. */
async function listingCountsFor(
  db: Db,
  scope: Scope,
  period: Period,
): Promise<{ live: number; submitted: number; closedInPeriod: number }> {
  /* Built as a plain record rather than inline, because an optional `_id` typed as
     `{$in} | undefined` is not assignable to a Mongo Filter even when it is never
     actually undefined. */
  const base: Record<string, unknown> = { deletedAt: null };
  if (scope.listingIds) base._id = { $in: scope.listingIds };
  const properties = db.collection(COLLECTIONS.properties);
  const [live, submitted, closedInPeriod] = await Promise.all([
    properties.countDocuments({ ...base, status: "live" }),
    properties.countDocuments({ ...base, status: "submitted" }),
    deals(db).countDocuments(dealMatch(period, scope)),
  ]);
  return { live, submitted, closedInPeriod };
}

/**
 * Per person: how many leads they handed over that reached a decision, how many
 * were won, and the median days from logging one to closing it.
 *
 * A MEDIAN rather than a mean, because one lead that sat for two years drags a
 * mean into saying nothing about the other nine.
 */
async function leadOutcomes(
  db: Db,
  period: Period,
): Promise<Map<string, { decided: number; won: number; medianDays: number }>> {
  const rows = await collection<{
    reporterId: string;
    state: string;
    createdAt: number;
    updatedAt: number;
  }>(db, COLLECTIONS.marketingLeads)
    .find(
      { updatedAt: { $gte: period.from, $lt: period.to } },
      { projection: { reporterId: 1, state: 1, createdAt: 1, updatedAt: 1 } },
    )
    .toArray();

  const byPerson = new Map<string, { decided: number; won: number; days: number[] }>();
  for (const row of rows) {
    if (row.state !== "won" && row.state !== "lost") continue;
    const found = byPerson.get(row.reporterId) ?? { decided: 0, won: 0, days: [] };
    found.decided += 1;
    if (row.state === "won") {
      found.won += 1;
      found.days.push(Math.max(0, (row.updatedAt - row.createdAt) / DAY_MS));
    }
    byPerson.set(row.reporterId, found);
  }

  const out = new Map<string, { decided: number; won: number; medianDays: number }>();
  for (const [id, found] of byPerson) {
    out.set(id, { decided: found.decided, won: found.won, medianDays: median(found.days) });
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/**
 * What each marketer actually earned in the window, from the LEDGER.
 *
 * Not from the deals' shares, and the difference matters: a clawback is a ledger
 * line, so a deal that fell through after payment still carries the share it once
 * promised while the ledger records the money coming back.
 */
async function earningsByMarketer(db: Db, period: Period): Promise<Map<string, number>> {
  const rows = await db
    .collection(COLLECTIONS.marketingLedger)
    .aggregate<{ _id: string; total: number }>([
      {
        $match: {
          createdAt: { $gte: period.from, $lt: period.to },
          status: { $ne: "void" },
        },
      },
      { $group: { _id: "$marketerId", total: { $sum: "$amountMinor" } } },
    ])
    .toArray();
  const out = new Map<string, number>();
  for (const row of rows) out.set(row._id, row.total);
  return out;
}
