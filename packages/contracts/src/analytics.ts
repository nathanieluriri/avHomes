/**
 * The shapes the six analytics pages render.
 *
 * One rule runs through all of it: **scope travels with the number**. Every read
 * echoes back the period it actually resolved, and every figure that is a
 * comparison carries its previous window or an explicit null. A figure whose
 * label names a different quantity from the figure is the failure this whole
 * section exists to avoid, and the way that happens is a screen asking for 30
 * days, getting something else, and captioning it from the request.
 */

import type { FundBalance, FundKind, RewardOutlook } from "./funds";
import type {
  CloserKind,
  DealKind,
  DealShare,
  DealStatus,
  FundShare,
  RatingBreakdown,
} from "./marketing";
import type { Ownership, PropertyStatus, SitePulse } from "./types";

export const PERIOD_KEYS = ["7d", "30d", "90d", "quarter", "year", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  quarter: "This quarter",
  year: "This year",
  all: "All time",
};

/** The short form for a stat tile's scope line, where the tile already has a label. */
export const PERIOD_SCOPE: Record<PeriodKey, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
  quarter: "this quarter",
  year: "this year",
  all: "all time",
};

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value);
}

/**
 * A resolved window, half open: `from` inclusive, `to` exclusive.
 *
 * Returned in every response rather than only accepted in every request, so a
 * screen captions its figures from what it got.
 */
export interface Period {
  key: PeriodKey;
  from: number;
  to: number;
  label: string;
  /**
   * The start of the equal-length window before `from`, for a trend. Null for
   * "all time", which has nothing before it, and that null is what stops a
   * percentage being invented.
   */
  previousFrom: number | null;
}

/** The default, and what an unreadable query falls back to. */
export const DEFAULT_PERIOD_KEY: PeriodKey = "30d";

/**
 * Resolve a key against a clock.
 *
 * Here rather than on the server alone because the client needs the same answer
 * to label a chart's axis before the response lands.
 */
export function resolvePeriod(key: PeriodKey, now: number = Date.now()): Period {
  const DAY = 24 * 60 * 60 * 1000;
  const base = { key, to: now, label: PERIOD_LABEL[key] };
  const window = (days: number): Period => ({
    ...base,
    from: now - days * DAY,
    previousFrom: now - days * 2 * DAY,
  });
  switch (key) {
    case "7d":
      return window(7);
    case "30d":
      return window(30);
    case "90d":
      return window(90);
    case "quarter": {
      const d = new Date(now);
      const start = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
      /* The previous window is the same LENGTH, not the previous quarter, so a
         comparison two weeks into a quarter is against the two weeks before it
         rather than against a full three months that will always look bigger. */
      return { ...base, from: start, previousFrom: start - (now - start) };
    }
    case "year": {
      const start = new Date(new Date(now).getFullYear(), 0, 1).getTime();
      return { ...base, from: start, previousFrom: start - (now - start) };
    }
    case "all":
      return { ...base, from: 0, previousFrom: null };
  }
}

/** A day on a chart. Zero filled by the server, so a gap is a zero. */
export interface ValuePoint {
  day: string;
  valueMinor: number;
  deals: number;
}

/**
 * What the business did in a period.
 *
 * `previousValueMinor` is null rather than 0 when there is nothing to compare
 * against, because 0 would render as a 100% rise out of nowhere.
 */
export interface MoneyOverview {
  currency: string;
  valueMinor: number;
  deals: number;
  previousValueMinor: number | null;
  previousDeals: number | null;
  /** Everything paid to people. */
  commissionMinor: number;
  /** Everything AV Homes kept. See splitDeal. */
  keptMinor: number;
  rewardMinor: number;
  foundationMinor: number;
  byOwnership: Record<Ownership, { valueMinor: number; deals: number }>;
  byKind: Record<DealKind, { valueMinor: number; deals: number }>;
  byCloser: Record<CloserKind, { valueMinor: number; deals: number }>;
  series: ValuePoint[];
}

/** The overview page in one response, so the first screen is one request. */
export interface AnalyticsOverview {
  period: Period;
  /** Null for a role that holds analytics but not marketing. */
  money: MoneyOverview | null;
  /** Null for the same reason. */
  funds: FundBalance[] | null;
  reward: RewardOutlook | null;
  pulse: SitePulse;
  listings: { live: number; submitted: number; closedInPeriod: number };
  /** True when this is a partner's own narrowed view. */
  scoped: boolean;
}

export interface TransactionRow {
  dealId: string;
  closedOn: number;
  listingId: string;
  listingTitle: string;
  ownership: Ownership;
  kind: DealKind;
  amountMinor: number;
  currency: string;
  closerKind: CloserKind;
  closerName: string;
  source: DealSourceLike;
  status: DealStatus;
  /** Collapsed by default on every surface that draws this. */
  shares: DealShare[];
  fundShares: FundShare[];
  keptMinor: number;
  proof: string[];
}

/** Kept structural so this file does not have to import a value to name a type. */
type DealSourceLike = "app" | "console";

export interface TransactionPage {
  period: Period;
  rows: TransactionRow[];
  nextCursor: string | null;
  /** The period's totals, which are NOT the page's totals. Labelled as such. */
  totalValueMinor: number;
  totalDeals: number;
  currency: string;
  /**
   * The renameable fund labels.
   *
   * On the response rather than looked up by the screen, because a row's breakdown
   * names both funds and a screen holding its own copy of those strings is a screen
   * that keeps saying "AV Foundation" after somebody renamed it.
   */
  fundNames: Record<FundKind, string>;
}

/**
 * One listing's funnel.
 *
 * The page exists for the row where `views` is high and `enquiries` is zero, so
 * every field that feeds that comparison is required rather than optional.
 */
export interface ListingFunnelRow {
  listingId: string;
  title: string;
  slug: string | null;
  ownership: Ownership;
  status: PropertyStatus;
  priceMinor: number;
  currency: string;
  views: number;
  sessions: number;
  enquiries: number;
  leads: number;
  /** Set when it closed in the period. */
  soldMinor: number | null;
  /** Published to closed, or published to now while it is still live. */
  daysOnMarket: number | null;
}

export const FUNNEL_SORTS = ["views", "enquiries", "leads", "days", "price"] as const;
export type FunnelSort = (typeof FUNNEL_SORTS)[number];

export interface ListingFunnelPage {
  period: Period;
  rows: ListingFunnelRow[];
  sort: FunnelSort;
  nextCursor: string | null;
  /** Views with no enquiry behind them, which is the number the page is for. */
  ignored: number;
}

/** One person in the league. Marketers and staff, one table. */
export interface PersonRow {
  kind: "marketer" | "staff";
  personId: string;
  name: string;
  /** The marketer code, or empty for staff. */
  code: string;
  deals: number;
  valueMinor: number;
  /** What they personally earned. Always 0 for staff, who are salaried. */
  earnedMinor: number;
  leadsDecided: number;
  leadsWon: number;
  rating: RatingBreakdown;
}

export interface PeoplePage {
  period: Period;
  rows: PersonRow[];
  currency: string;
  /** The weights the scores were worked out with, so the screen can explain them. */
  weights: { value: number; deals: number; conversion: number; speed: number };
}

/**
 * A partner's own money.
 *
 * The fee is a TOTAL and there is no breakdown on this type at all. That is the
 * point: an outside party sees what AV Homes charged, not how it was divided
 * between a marketer, their upline and two funds.
 */
export interface PartnerSaleRow {
  listingId: string;
  title: string;
  closedOn: number;
  kind: DealKind;
  soldMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
}

export interface PartnerMoney {
  period: Period;
  rows: PartnerSaleRow[];
  soldMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
}

/** The traffic page. The same numbers as the dashboard strip, plus per listing. */
export interface TrafficReport {
  period: Period;
  pulse: SitePulse;
  top: { listingId: string; title: string; views: number; sessions: number }[];
}

/** A trend, or an honest refusal to state one. */
export type Trend = { pct: number; up: boolean } | null;

/**
 * Two measured windows, or null.
 *
 * Null when there is no previous window or it was empty. A rise from nothing is
 * not a percentage, and printing one is how a dashboard starts lying on its first
 * day of use.
 */
export function trendOf(current: number, previous: number | null): Trend {
  if (previous === null || previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// TODO(test): trendOf returns null on a null or zero previous window.
// TODO(test): resolvePeriod's "quarter" previous window is the same length as the
// elapsed part of the quarter, not a whole quarter.
