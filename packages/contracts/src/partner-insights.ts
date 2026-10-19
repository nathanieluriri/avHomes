/**
 * The partner app's leaderboard, its analytics page and the upline card.
 *
 * Periods here are calendar ones ("this month", "last month") rather than the
 * console's rolling windows, because a partner reads a leaderboard the way a
 * prize is run: by the month and the quarter.
 */

export const BOARD_PERIODS = ["month", "last-month", "quarter", "year", "all"] as const;
export type BoardPeriod = (typeof BOARD_PERIODS)[number];

export const BOARD_PERIOD_LABEL: Record<BoardPeriod, string> = {
  month: "This month",
  "last-month": "Last month",
  quarter: "This quarter",
  year: "This year",
  all: "All time",
};

export const BOARD_METRICS = ["deals", "value", "commission", "recruits"] as const;
export type BoardMetric = (typeof BOARD_METRICS)[number];

export const BOARD_METRIC_LABEL: Record<BoardMetric, string> = {
  deals: "Deals closed",
  value: "Sales value",
  commission: "Commission earned",
  recruits: "People invited",
};

export const BOARD_SCOPES = ["everyone", "team"] as const;
export type BoardScope = (typeof BOARD_SCOPES)[number];

export const BOARD_SCOPE_LABEL: Record<BoardScope, string> = {
  everyone: "Everyone",
  team: "My network",
};

/** What an admin lets partners see on the app's leaderboard. */
export interface LeaderboardSettings {
  enabled: boolean;
  periods: BoardPeriod[];
  metrics: BoardMetric[];
  scopes: BoardScope[];
  /** Offer a filter by the partner's state. */
  stateFilter: boolean;
  defaultPeriod: BoardPeriod;
  defaultMetric: BoardMetric;
}

/** Commission is off by default: it is what other people earned, which is theirs to keep quiet. */
export const DEFAULT_LEADERBOARD_SETTINGS: LeaderboardSettings = {
  enabled: true,
  periods: [...BOARD_PERIODS],
  metrics: ["deals", "value", "recruits"],
  scopes: [...BOARD_SCOPES],
  stateFilter: true,
  defaultPeriod: "month",
  defaultMetric: "deals",
};

/** Coalesce a stored value field by field, dropping anything unknown, never leaving a list empty. */
export function normalizeLeaderboardSettings(raw: unknown): LeaderboardSettings {
  const d = DEFAULT_LEADERBOARD_SETTINGS;
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Record<keyof LeaderboardSettings, unknown>>;
  const pick = <T extends string>(value: unknown, all: readonly T[], fallback: T[]): T[] => {
    if (!Array.isArray(value)) return fallback;
    const kept = all.filter((item) => value.includes(item));
    return kept.length > 0 ? kept : fallback;
  };
  const periods = pick(r.periods, BOARD_PERIODS, d.periods);
  const metrics = pick(r.metrics, BOARD_METRICS, d.metrics);
  const scopes = pick(r.scopes, BOARD_SCOPES, d.scopes);
  const defaultPeriod = periods.includes(r.defaultPeriod as BoardPeriod) ? (r.defaultPeriod as BoardPeriod) : periods[0]!;
  const defaultMetric = metrics.includes(r.defaultMetric as BoardMetric) ? (r.defaultMetric as BoardMetric) : metrics[0]!;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    periods,
    metrics,
    scopes,
    stateFilter: typeof r.stateFilter === "boolean" ? r.stateFilter : d.stateFilter,
    defaultPeriod,
    defaultMetric,
  };
}

export interface BoardWindow {
  key: BoardPeriod;
  label: string;
  /** Inclusive. */
  from: number;
  /** Exclusive. */
  to: number;
}

/** A calendar window in the reader's clock. The server runs on UTC, so it resolves in UTC. */
export function resolveBoardPeriod(key: BoardPeriod, now: number = Date.now()): BoardWindow {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const label = BOARD_PERIOD_LABEL[key];
  switch (key) {
    case "month":
      return { key, label, from: Date.UTC(y, m, 1), to: Date.UTC(y, m + 1, 1) };
    case "last-month":
      return { key, label, from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1) };
    case "quarter": {
      const start = Math.floor(m / 3) * 3;
      return { key, label, from: Date.UTC(y, start, 1), to: Date.UTC(y, start + 3, 1) };
    }
    case "year":
      return { key, label, from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) };
    case "all":
      return { key, label, from: 0, to: Date.UTC(y + 1, 0, 1) };
  }
}

export interface BoardRow {
  rank: number;
  marketerId: string;
  name: string;
  code: string;
  state: string;
  /** The ranked figure, in minor units for value and commission. */
  value: number;
  /** Deals closed in the window, shown beside any metric for context. */
  deals: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  enabled: boolean;
  settings: LeaderboardSettings;
  period: BoardWindow;
  metric: BoardMetric;
  scope: BoardScope;
  state: string;
  /** States with at least one active partner, for the filter. */
  states: string[];
  currency: string;
  rows: BoardRow[];
  /** The reader's own place, also when they are not on the list. Rank 0 means not ranked yet. */
  me: BoardRow | null;
  /** How many people are on the board in total, before the cut. */
  total: number;
}

/** Rank by the figure, ties broken by deals and then by name, so the order is stable. */
export function rankBoard<T extends { value: number; deals: number; name: string }>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value || b.deals - a.deals || a.name.localeCompare(b.name));
  let rank = 0;
  let last: T | null = null;
  return sorted.map((row, index) => {
    if (!last || last.value !== row.value || last.deals !== row.deals) rank = index + 1;
    last = row;
    return { ...row, rank };
  });
}

/* ═══════════════════════════════════════════════════════════════ ANALYTICS ══ */

export const INSIGHT_PERIODS = ["month", "quarter", "year", "all"] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

export interface InsightMonth {
  /** "2026-10". */
  month: string;
  deals: number;
  valueMinor: number;
  earnedMinor: number;
  joined: number;
}

export interface PartnerInsights {
  period: BoardWindow;
  currency: string;
  invites: {
    /** People who joined on this partner's own link, in the window. */
    direct: number;
    /** Everyone in their three levels who joined in the window. */
    team: number;
    directAllTime: number;
    teamAllTime: number;
  };
  deals: {
    reported: number;
    approved: number;
    pending: number;
    rejected: number;
    /** Approved value this partner closed. */
    valueMinor: number;
    /** Approved deals their network closed, which pay them a network share. */
    teamApproved: number;
  };
  earnings: {
    earnedMinor: number;
    /** What the network's deals paid this partner, inside earnedMinor. */
    fromTeamMinor: number;
  };
  buyers: {
    logged: number;
    won: number;
    lost: number;
    open: number;
  };
  /** Oldest first, zero filled. */
  months: InsightMonth[];
}

/* ═══════════════════════════════════════════════════════════════════ UPLINE ══ */

/** Who a partner can reach above them. `office` when they joined without somebody's link. */
export interface UplineContact {
  kind: "person" | "office";
  name: string;
  code: string;
  email: string;
  /** Empty when they hid it or never set one. */
  phone: string;
}
