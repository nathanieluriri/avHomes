/**
 * The partner app's leaderboard, analytics page and upline card.
 *
 * Every read is scoped to the asking partner. The board only ever carries the
 * figures an admin chose to show, and the analytics page only the asker's own.
 */

import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import {
  BOARD_METRICS,
  BOARD_PERIODS,
  BOARD_SCOPES,
  INSIGHT_PERIODS,
  rankBoard,
  resolveBoardPeriod,
  type BoardMetric,
  type BoardPeriod,
  type BoardRow,
  type BoardScope,
  type InsightMonth,
  type InsightPeriod,
  type LeaderboardResponse,
  type Marketer,
  type PartnerInsights,
  type UplineContact,
} from "@avhomes/contracts";
import { rootMarketer, teamFor } from "./repo";
import type { DealDoc, LeadDoc, LedgerDoc, MarketerDoc } from "./schema";
import { readMarketingSettings } from "./settings";

const BOARD_CUT = 50;

function marketers(db: Db) {
  return collection<MarketerDoc>(db, COLLECTIONS.marketers);
}
function deals(db: Db) {
  return collection<DealDoc>(db, COLLECTIONS.marketingDeals);
}
function ledger(db: Db) {
  return collection<LedgerDoc>(db, COLLECTIONS.marketingLedger);
}
function leads(db: Db) {
  return collection<LeadDoc>(db, COLLECTIONS.marketingLeads);
}

function sameState(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface BoardQuery {
  period?: string;
  metric?: string;
  scope?: string;
  state?: string;
}

/** What each person scored on one metric in one window. */
async function scores(
  db: Db,
  metric: BoardMetric,
  ids: string[],
  window: { from: number; to: number },
): Promise<{ value: Map<string, number>; deals: Map<string, number> }> {
  const dealCounts = new Map<string, number>();
  const value = new Map<string, number>();
  const closed = await deals(db)
    .aggregate<{ _id: string; deals: number; valueMinor: number }>([
      {
        $match: {
          status: "approved",
          closerKind: { $in: ["marketer", null] },
          closerId: { $in: ids },
          closedOn: { $gte: window.from, $lt: window.to },
        },
      },
      { $group: { _id: "$closerId", deals: { $sum: 1 }, valueMinor: { $sum: "$amountMinor" } } },
    ])
    .toArray();
  for (const row of closed) dealCounts.set(row._id, row.deals);

  if (metric === "deals") for (const row of closed) value.set(row._id, row.deals);
  if (metric === "value") for (const row of closed) value.set(row._id, row.valueMinor);
  if (metric === "commission") {
    const earned = await ledger(db)
      .aggregate<{ _id: string; total: number }>([
        {
          $match: {
            marketerId: { $in: ids },
            kind: { $in: ["earn", "clawback"] },
            status: { $ne: "void" },
            createdAt: { $gte: window.from, $lt: window.to },
          },
        },
        { $group: { _id: "$marketerId", total: { $sum: "$amountMinor" } } },
      ])
      .toArray();
    for (const row of earned) value.set(row._id, row.total);
  }
  if (metric === "recruits") {
    const joined = await marketers(db)
      .aggregate<{ _id: string; total: number }>([
        { $match: { parentId: { $in: ids }, joinedAt: { $gte: window.from, $lt: window.to } } },
        { $group: { _id: "$parentId", total: { $sum: 1 } } },
      ])
      .toArray();
    for (const row of joined) value.set(row._id, row.total);
  }
  return { value, deals: dealCounts };
}

export async function leaderboardFor(db: Db, me: Marketer, query: BoardQuery, now = Date.now()): Promise<LeaderboardResponse> {
  const settings = await readMarketingSettings(db);
  const lb = settings.leaderboard;
  const allowed = <T extends string>(raw: string | undefined, all: readonly T[], on: readonly T[], fallback: T): T =>
    all.includes(raw as T) && on.includes(raw as T) ? (raw as T) : fallback;

  const period = resolveBoardPeriod(allowed<BoardPeriod>(query.period, BOARD_PERIODS, lb.periods, lb.defaultPeriod), now);
  const metric = allowed<BoardMetric>(query.metric, BOARD_METRICS, lb.metrics, lb.defaultMetric);
  const scope = allowed<BoardScope>(query.scope, BOARD_SCOPES, lb.scopes, lb.scopes[0] ?? "everyone");
  const state = lb.stateFilter ? (query.state ?? "").trim() : "";

  const base = { settings: lb, period, metric, scope, state, currency: settings.currency };
  if (!lb.enabled) return { ...base, enabled: false, states: [], rows: [], me: null, total: 0 };

  const active = await marketers(db)
    .find({ status: "active", isAdmin: { $ne: true } }, { projection: { _id: 1, displayName: 1, code: 1, state: 1 } })
    .toArray();
  const states = lb.stateFilter
    ? [...new Set(active.map((row) => row.state?.trim() ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b))
    : [];

  let people = active;
  if (scope === "team") {
    const team = new Set((await teamFor(db, me.id)).members.map((member) => member.id));
    team.add(me.id);
    people = people.filter((row) => team.has(row._id));
  }
  if (state) people = people.filter((row) => sameState(row.state ?? "", state));
  if (!people.some((row) => row._id === me.id) && (!state || sameState(me.state, state))) {
    people = [...people, { _id: me.id, displayName: me.displayName, code: me.code, state: me.state } as MarketerDoc];
  }

  const ids = people.map((row) => row._id);
  const scored = await scores(db, metric, ids, period);
  const all = people.map((row) => ({
    marketerId: row._id,
    name: row.displayName ?? "",
    code: row.code,
    state: row.state ?? "",
    value: scored.value.get(row._id) ?? 0,
    deals: scored.deals.get(row._id) ?? 0,
    isMe: row._id === me.id,
  }));
  const ranked: BoardRow[] = rankBoard(all.filter((row) => row.value > 0));
  const mine = ranked.find((row) => row.isMe) ?? all.find((row) => row.isMe);

  return {
    ...base,
    enabled: true,
    states,
    rows: ranked.slice(0, BOARD_CUT),
    me: mine ? { rank: 0, ...mine } : null,
    total: ranked.length,
  };
}

/* ═══════════════════════════════════════════════════════════════ ANALYTICS ══ */

function monthKey(at: number): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last `count` calendar months ending with the one `now` is in, oldest first. */
export function monthsBack(count: number, now = Date.now()): { month: string; from: number; to: number }[] {
  const d = new Date(now);
  const out: { month: string; from: number; to: number }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1);
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1);
    out.push({ month: monthKey(from), from, to });
  }
  return out;
}

export async function insightsFor(db: Db, me: Marketer, raw: string | undefined, now = Date.now()): Promise<PartnerInsights> {
  const key: InsightPeriod = INSIGHT_PERIODS.includes(raw as InsightPeriod) ? (raw as InsightPeriod) : "month";
  const period = resolveBoardPeriod(key, now);
  const inWindow = (at: number) => at >= period.from && at < period.to;
  const settings = await readMarketingSettings(db);
  const team = (await teamFor(db, me.id)).members;
  const teamIds = team.map((member) => member.id);
  const months = monthsBack(key === "year" || key === "all" ? 12 : 6, now);
  const since = Math.min(period.from, months[0]!.from);

  const [reported, closed, lines, logged, teamClosed] = await Promise.all([
    deals(db)
      .find({ reporterId: me.id, createdAt: { $gte: period.from, $lt: period.to } }, { projection: { status: 1, amountMinor: 1 } })
      .toArray(),
    deals(db)
      .find(
        { status: "approved", closerId: me.id, closedOn: { $gte: since, $lt: period.to } },
        { projection: { amountMinor: 1, closedOn: 1 } },
      )
      .toArray(),
    ledger(db)
      .find(
        {
          marketerId: me.id,
          kind: { $in: ["earn", "clawback"] },
          status: { $ne: "void" },
          createdAt: { $gte: since, $lt: period.to },
        },
        { projection: { amountMinor: 1, level: 1, createdAt: 1 } },
      )
      .toArray(),
    leads(db)
      .find({ reporterId: me.id, createdAt: { $gte: period.from, $lt: period.to } }, { projection: { state: 1 } })
      .toArray(),
    teamIds.length === 0
      ? Promise.resolve(0)
      : deals(db).countDocuments({
          status: "approved",
          closerId: { $in: teamIds },
          closedOn: { $gte: period.from, $lt: period.to },
        }),
  ]);

  const direct = team.filter((member) => member.level === 1);
  const won = logged.filter((lead) => lead.state === "won").length;
  const lost = logged.filter((lead) => lead.state === "lost").length;
  const windowLines = lines.filter((line) => inWindow(line.createdAt));

  const series: InsightMonth[] = months.map((m) => {
    const within = (at: number) => at >= m.from && at < m.to;
    const monthDeals = closed.filter((deal) => within(deal.closedOn));
    return {
      month: m.month,
      deals: monthDeals.length,
      valueMinor: monthDeals.reduce((sum, deal) => sum + deal.amountMinor, 0),
      earnedMinor: lines.filter((line) => within(line.createdAt)).reduce((sum, line) => sum + line.amountMinor, 0),
      joined: direct.filter((member) => within(member.joinedAt)).length,
    };
  });

  return {
    period,
    currency: settings.currency,
    invites: {
      direct: direct.filter((member) => inWindow(member.joinedAt)).length,
      team: team.filter((member) => inWindow(member.joinedAt)).length,
      directAllTime: direct.length,
      teamAllTime: team.length,
    },
    deals: {
      reported: reported.length,
      approved: reported.filter((deal) => deal.status === "approved").length,
      pending: reported.filter((deal) => deal.status === "pending" || deal.status === "info").length,
      rejected: reported.filter((deal) => deal.status === "rejected").length,
      valueMinor: closed.filter((deal) => inWindow(deal.closedOn)).reduce((sum, deal) => sum + deal.amountMinor, 0),
      teamApproved: teamClosed,
    },
    earnings: {
      earnedMinor: windowLines.reduce((sum, line) => sum + line.amountMinor, 0),
      fromTeamMinor: windowLines.filter((line) => line.level > 1).reduce((sum, line) => sum + line.amountMinor, 0),
    },
    buyers: { logged: logged.length, won, lost, open: logged.length - won - lost },
    months: series,
  };
}

/* ═══════════════════════════════════════════════════════════════════ UPLINE ══ */

/**
 * The one person above this partner, and only them. Someone who joined without a
 * link sits under the founder's account, and reaches the office instead.
 */
export async function uplineFor(
  db: Db,
  me: Marketer,
  office: { email: string; phone: string },
): Promise<UplineContact | null> {
  if (!me.parentId) return null;
  const [parent, root] = await Promise.all([marketers(db).findOne({ _id: me.parentId }), rootMarketer(db)]);
  if (!parent || (root && root._id === parent._id)) {
    return { kind: "office", name: "AV Homes office", code: "", email: office.email, phone: office.phone };
  }
  return {
    kind: "person",
    name: parent.displayName ?? "",
    code: parent.code,
    email: parent.email ?? "",
    phone: parent.showPhoneToTeam === false ? "" : (parent.phone ?? ""),
  };
}
