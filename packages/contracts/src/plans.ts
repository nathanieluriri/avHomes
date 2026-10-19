/**
 * Deals paid over time, and partners buying for themselves.
 *
 * On a payment plan, commission and both funds' shares are earned only on money
 * actually received and verified. Each verified payment earns the difference
 * between the commission on everything paid so far and the commission on
 * everything paid before it, rounded down each time. That makes the total over
 * the whole plan exactly the commission on the full price: rounding can never
 * pay out more than the outright sale would have.
 */

import type { DealShare, FundShare } from "./marketing";

export const PLAN_FREQUENCIES = ["monthly", "quarterly"] as const;
export type PlanFrequency = (typeof PLAN_FREQUENCIES)[number];

export const PLAN_FREQUENCY_LABEL: Record<PlanFrequency, string> = {
  monthly: "Every month",
  quarterly: "Every three months",
};

const FREQUENCY_MONTHS: Record<PlanFrequency, number> = { monthly: 1, quarterly: 3 };

export const PLAN_INSTALMENTS_MAX = 60;

export interface DealPlan {
  /** Paid up front, proved by the deal's own receipts and verified when the deal is approved. */
  depositMinor: number;
  /** How many payments follow the deposit. */
  instalments: number;
  frequency: PlanFrequency;
  /** When the first payment after the deposit is due, epoch ms. */
  firstDueOn: number;
}

/** One expected payment. `n` 0 is the deposit. */
export interface PlanDue {
  n: number;
  dueOn: number;
  amountMinor: number;
}

export const PAYMENT_STATUSES = ["pending", "verified", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Being checked",
  verified: "Verified",
  rejected: "Not accepted",
};

/** One payment received on a plan, and what it earned once verified. */
export interface DealPayment {
  id: string;
  amountMinor: number;
  paidOn: number;
  proof: string[];
  note: string;
  status: PaymentStatus;
  reportedBySide: "marketer" | "admin";
  reportedByName: string;
  reviewedByName: string;
  reviewedAt: number | null;
  /** Why it was not accepted. */
  reason: string;
  /** What each person earned from this payment. Empty until verified. */
  shares: DealShare[];
  fundShares: FundShare[];
  keptMinor: number;
  createdAt: number;
}

/**
 * The expected payments: the deposit, then equal instalments with whatever does
 * not divide evenly added to the last one, so the schedule always totals the price.
 */
export function planSchedule(totalMinor: number, plan: DealPlan): PlanDue[] {
  const rows: PlanDue[] = [];
  const deposit = Math.max(0, Math.min(plan.depositMinor, totalMinor));
  if (deposit > 0) rows.push({ n: 0, dueOn: 0, amountMinor: deposit });
  const count = Math.max(1, Math.floor(plan.instalments));
  const rest = totalMinor - deposit;
  const each = Math.floor(rest / count);
  const start = new Date(plan.firstDueOn);
  for (let i = 0; i < count; i++) {
    const due = new Date(start);
    const months = i * FREQUENCY_MONTHS[plan.frequency];
    due.setMonth(start.getMonth() + months);
    // A 31st in a shorter month lands on that month's last day, not the next month.
    if (due.getDate() !== start.getDate()) due.setDate(0);
    rows.push({
      n: i + 1,
      dueOn: due.getTime(),
      amountMinor: i === count - 1 ? rest - each * (count - 1) : each,
    });
  }
  return rows;
}

export function planRefusal(totalMinor: number, plan: DealPlan): string | null {
  if (!Number.isInteger(plan.instalments) || plan.instalments < 1) return "A plan needs at least one payment after the deposit.";
  if (plan.instalments > PLAN_INSTALMENTS_MAX) return `A plan can have at most ${PLAN_INSTALMENTS_MAX} payments.`;
  if (plan.depositMinor < 0) return "The deposit cannot be negative.";
  if (plan.depositMinor >= totalMinor) return "The deposit is the whole price. Report it as paid in full instead.";
  if (!Number.isFinite(plan.firstDueOn) || plan.firstDueOn <= 0) return "Say when the first payment after the deposit is due.";
  if (Math.floor((totalMinor - plan.depositMinor) / plan.instalments) < 1) return "Those payments are too small to split.";
  return null;
}

/**
 * What one payment earns, given the full-price shares worked out at approval.
 *
 * `paidBefore` is everything verified before this payment. Each share is
 * floor(after x rate) - floor(before x rate), so the shares of every payment on
 * the plan add up to floor(price x rate), which is the full-price share.
 */
export function slicePayment(
  paidBeforeMinor: number,
  amountMinor: number,
  totalMinor: number,
  full: { people: readonly DealShare[]; funds: readonly FundShare[] },
): { people: DealShare[]; funds: FundShare[]; keptMinor: number } {
  const before = Math.max(0, Math.min(paidBeforeMinor, totalMinor));
  const after = Math.max(before, Math.min(paidBeforeMinor + amountMinor, totalMinor));
  const at = (paid: number, rate: number) => Math.floor((paid * rate) / 100);
  const people: DealShare[] = [];
  for (const share of full.people) {
    const amount = at(after, share.rate) - at(before, share.rate);
    if (amount > 0) people.push({ ...share, amountMinor: amount });
  }
  const funds: FundShare[] = [];
  for (const share of full.funds) {
    const amount = at(after, share.rate) - at(before, share.rate);
    if (amount > 0) funds.push({ ...share, amountMinor: amount });
  }
  const out =
    people.reduce((total, share) => total + share.amountMinor, 0) +
    funds.reduce((total, share) => total + share.amountMinor, 0);
  return { people, funds, keptMinor: after - before - out };
}

/** Adds share lists together by person and level, or by fund. */
export function sumShares(lists: readonly (readonly DealShare[])[]): DealShare[] {
  const by = new Map<string, DealShare>();
  for (const list of lists) {
    for (const share of list) {
      const key = `${share.marketerId}:${share.level}`;
      const found = by.get(key);
      by.set(key, found ? { ...found, amountMinor: found.amountMinor + share.amountMinor } : { ...share });
    }
  }
  return [...by.values()].sort((a, b) => a.level - b.level);
}

export function sumFundShares(lists: readonly (readonly FundShare[])[]): FundShare[] {
  const by = new Map<string, FundShare>();
  for (const list of lists) {
    for (const share of list) {
      const found = by.get(share.fund);
      by.set(share.fund, found ? { ...found, amountMinor: found.amountMinor + share.amountMinor } : { ...share });
    }
  }
  return [...by.values()];
}

export type PlanState = "paid" | "on-track" | "due-soon" | "overdue";

export const PLAN_STATE_LABEL: Record<PlanState, string> = {
  paid: "Paid in full",
  "on-track": "On track",
  "due-soon": "Payment due soon",
  overdue: "Payment overdue",
};

export const PLAN_DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

export interface PlanStanding {
  state: PlanState;
  verifiedMinor: number;
  /** Logged and waiting to be checked. */
  pendingMinor: number;
  leftMinor: number;
  /** The first expected payment not yet covered by verified or logged money. */
  next: PlanDue | null;
  /** How much of `next` is still to come. */
  nextLeftMinor: number;
}

/**
 * Where a plan stands. Logged payments count towards what is covered, so a
 * reminder never chases money somebody already reported.
 */
export function planStanding(
  totalMinor: number,
  plan: DealPlan,
  payments: readonly Pick<DealPayment, "amountMinor" | "status">[],
  now: number,
): PlanStanding {
  const verified = payments.filter((p) => p.status === "verified").reduce((t, p) => t + p.amountMinor, 0);
  const pending = payments.filter((p) => p.status === "pending").reduce((t, p) => t + p.amountMinor, 0);
  const covered = verified + pending;
  const left = Math.max(0, totalMinor - verified);
  let running = 0;
  let next: PlanDue | null = null;
  let nextLeft = 0;
  for (const due of planSchedule(totalMinor, plan)) {
    running += due.amountMinor;
    if (running > covered) {
      next = due;
      nextLeft = Math.min(due.amountMinor, running - covered);
      break;
    }
  }
  let state: PlanState = "on-track";
  if (left === 0) state = "paid";
  else if (next && next.dueOn > 0 && next.dueOn < now) state = "overdue";
  else if (next && next.dueOn > 0 && next.dueOn - now <= PLAN_DUE_SOON_MS) state = "due-soon";
  return { state, verifiedMinor: verified, pendingMinor: pending, leftMinor: left, next, nextLeftMinor: nextLeft };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The reminder a plan is owed right now, as a key that is sent once: due soon,
 * then overdue, then once a week while it stays overdue. Null when nothing is owed.
 */
export function reminderKey(standing: PlanStanding, now: number): { key: string; late: boolean } | null {
  const next = standing.next;
  if (standing.state === "paid" || !next || next.dueOn <= 0) return null;
  if (standing.state === "due-soon") return { key: `${next.n}:soon`, late: false };
  if (standing.state !== "overdue") return null;
  const weeks = Math.floor((now - next.dueOn) / WEEK_MS);
  return { key: weeks >= 1 ? `${next.n}:late:${weeks}` : `${next.n}:late`, late: true };
}
