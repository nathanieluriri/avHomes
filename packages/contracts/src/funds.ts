/**
 * The two pots that are nobody's commission.
 *
 * A share of every transaction goes to a community fund and to a prize for the
 * best seller. Neither is owed to a person, and that is the whole reason they
 * are here rather than in `marketing.ts`: a row in `marketing_ledger` with no
 * marketer behind it would break `reconcile()`, which proves that collection
 * balances against what marketers are owed. That check is the one thing the
 * money side of this system must never hide, so the funds get their own ledger
 * with the same append-only discipline and none of the same meaning.
 */

import { DEFAULT_CURRENCY } from "./money";

export const FUND_KINDS = ["reward", "foundation"] as const;
export type FundKind = (typeof FUND_KINDS)[number];

/**
 * The starting display names, both renameable from settings.
 *
 * The KEYS never change, only these labels, so renaming a fund cannot orphan a
 * row that was written under the old name.
 */
export const DEFAULT_FUND_NAMES: Record<FundKind, string> = {
  reward: "Reward Pool",
  foundation: "AV Foundation",
};

export const FUND_ENTRY_KINDS = ["accrual", "payout", "adjustment"] as const;
export type FundEntryKind = (typeof FUND_ENTRY_KINDS)[number];

export const FUND_ENTRY_KIND_LABEL: Record<FundEntryKind, string> = {
  accrual: "From a sale",
  payout: "Paid out",
  adjustment: "Correction",
};

/**
 * One line of a fund. Lines are added, never edited.
 *
 * A deal that falls through does not delete its accrual: it adds a negative one
 * pointing at the same deal, so the fund's history still shows what happened.
 */
export interface FundEntry {
  id: string;
  fund: FundKind;
  kind: FundEntryKind;
  /** Signed. An accrual is positive, a payout negative. */
  amountMinor: number;
  currency: string;
  /** The deal that produced an accrual. Null on a payout or a correction. */
  dealId: string | null;
  /** The percentage snapshotted at accrual, so the row explains its own size. */
  rate: number;
  /** The award a reward payout settles. Null otherwise. */
  awardId: string | null;
  /** What a disbursement was for. The only description the row will ever have. */
  note: string;
  /** Receipts. Required on a payout, because money leaving needs evidence. */
  proof: string[];
  byName: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A fund's standing.
 *
 * Every figure is a sum over the entries, never a stored number, so a lost write
 * can never silently make a fund richer than its history says.
 */
export interface FundBalance {
  fund: FundKind;
  /** The renameable label, resolved from settings by the caller. */
  name: string;
  currency: string;
  accruedMinor: number;
  /** Positive, though the entries behind it are negative. */
  paidMinor: number;
  balanceMinor: number;
  entries: number;
  lastAt: number | null;
}

/* ═══════════════════════════════════════════════════════════════ THE PRIZE ══ */

export const AWARD_STATUSES = ["proposed", "awarded", "skipped"] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];

export const AWARD_STATUS_LABEL: Record<AwardStatus, string> = {
  proposed: "Waiting for a decision",
  awarded: "Paid",
  skipped: "Not awarded",
};

/** One person's place in a quarter, snapshotted when the quarter closed. */
export interface RewardStanding {
  rank: number;
  /** Marketers and AV Homes staff rank in one league. */
  kind: "marketer" | "staff";
  personId: string;
  name: string;
  /** The marketer code, or empty for staff. */
  code: string;
  deals: number;
  valueMinor: number;
  /** The composite rating, shown for context. NOT what ranks. */
  score: number;
}

/**
 * One quarter's prize.
 *
 * `standings` is a SNAPSHOT. A deal recorded next week, or a marketer renamed
 * next year, must not rewrite who won a quarter that is already settled.
 */
export interface RewardAward {
  id: string;
  /** `2026-Q3`. One award per quarter, enforced by a unique index. */
  quarter: string;
  status: AwardStatus;
  /** The pot as it stood when the quarter closed. */
  potMinor: number;
  currency: string;
  standings: RewardStanding[];
  winnerKind: "marketer" | "staff" | null;
  winnerId: string | null;
  winnerName: string | null;
  /**
   * A marketer winner: the `adjust` ledger line that carries the pot into their
   * next pay run. Null for staff, who have no ledger.
   */
  ledgerLineId: string | null;
  /** A staff winner: the transfer reference, and the proof beside it. */
  reference: string;
  proof: string[];
  reason: string;
  decidedByName: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** What the wallets screen needs to draw the current quarter before it closes. */
export interface RewardOutlook {
  quarter: string;
  label: string;
  /** What the pool holds right now, which is what a winner would take. */
  potMinor: number;
  currency: string;
  /** Live, unsnapshotted. Becomes `standings` when the quarter is closed. */
  standings: RewardStanding[];
  /** True once the quarter is over and an award can be proposed. */
  closable: boolean;
  /** The award for this quarter, once somebody has proposed one. */
  award: RewardAward | null;
}

/* ════════════════════════════════════════════════════════════════ QUARTERS ══ */

/**
 * `2026-Q3` for the quarter a timestamp falls in, in the server's own zone.
 *
 * Local rather than UTC, matching `payMonth`: a pay period is a thing the
 * business experiences in its own timezone, and having the two disagree would
 * put a New Year's Eve deal in different periods depending on which function
 * asked.
 */
export function quarterOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/** "July to September 2026" from `2026-Q3`. Used on both sides of the product. */
export function quarterLabel(quarter: string): string {
  const [year, q] = quarter.split("-Q");
  const index = (Number(q) - 1) * 3;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const first = names[index];
  const last = names[index + 2];
  if (!first || !last) return quarter;
  return `${first} to ${last} ${year ?? ""}`.trim();
}

/**
 * Half open: `from` inclusive, `to` exclusive.
 *
 * So no deal can land in two quarters, and `to` is exactly the next quarter's
 * `from` rather than a millisecond short of it.
 */
export function quarterRange(quarter: string): { from: number; to: number } {
  const [year, q] = quarter.split("-Q");
  const y = Number(year);
  const start = (Number(q) - 1) * 3;
  if (!Number.isFinite(y) || !Number.isFinite(start)) return { from: 0, to: 0 };
  return {
    from: new Date(y, start, 1).getTime(),
    to: new Date(y, start + 3, 1).getTime(),
  };
}

/** The quarter before this one, which is the one there is a prize to settle for. */
export function previousQuarter(quarter: string): string {
  const [year, q] = quarter.split("-Q");
  const n = Number(q);
  if (!Number.isFinite(n) || n < 1 || n > 4) return quarter;
  return n === 1 ? `${Number(year) - 1}-Q4` : `${year}-Q${n - 1}`;
}

/** Is this quarter over, so its prize can be settled? */
export function quarterFinished(quarter: string, now: number = Date.now()): boolean {
  return now >= quarterRange(quarter).to;
}

// TODO(test): quarterOf puts March 31 in Q1 and April 1 in Q2.
// TODO(test): quarterRange's `to` equals the next quarter's `from` exactly.
// TODO(test): previousQuarter crosses a year boundary from Q1 to the prior Q4.

/** A fund balance with nothing in it, so a screen has a shape before the first sale. */
export function emptyFundBalance(fund: FundKind, name: string): FundBalance {
  return {
    fund,
    name,
    currency: DEFAULT_CURRENCY,
    accruedMinor: 0,
    paidMinor: 0,
    balanceMinor: 0,
    entries: 0,
    lastAt: null,
  };
}

/**
 * Everything a disbursement is refused for, checked the same way on both sides.
 *
 * Spending a fund past its balance is not a thing to record, it is a thing to
 * stop: the balance is the sum of the history, so a negative one would be a fund
 * claiming to have given away money it never had.
 */
export function disbursementRefusal(input: {
  amountMinor: number;
  balanceMinor: number;
  note: string;
  proof: readonly string[];
}): string | null {
  if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
    return "Enter how much is being paid out.";
  }
  if (input.amountMinor > input.balanceMinor) {
    return "That is more than this fund holds.";
  }
  if (input.note.trim().length < 4) {
    return "Say what this paid for.";
  }
  if (input.proof.length === 0) {
    return "Attach a receipt.";
  }
  return null;
}
