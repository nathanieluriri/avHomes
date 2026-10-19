/**
 * Payment plans: deals paid over time, where commission and the funds' shares
 * follow the money actually received. The maths lives in @avhomes/contracts
 * (`slicePayment`), so the app, the console and this file agree on every kobo.
 */

import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import { NotFoundError, PreconditionFailedError, newId } from "@avhomes/core";
import {
  planRefusal,
  planStanding,
  reminderKey,
  slicePayment,
  splitDeal,
  sumFundShares,
  sumShares,
  type ChainMember,
  type CommissionSplit,
  type Deal,
  type DealPayment,
  type DealShare,
  type FundShare,
  type Lead,
  type DealPlan,
  type PlanStanding,
} from "@avhomes/contracts";
import { toDeal, toLead, type DealDoc, type LeadDoc, type LedgerDoc } from "./schema";
import type { FundAccrual } from "./repo";

function deals(db: Db) {
  return collection<DealDoc>(db, COLLECTIONS.marketingDeals);
}

function ledger(db: Db) {
  return collection<LedgerDoc>(db, COLLECTIONS.marketingLedger);
}

export function assertPlan(totalMinor: number, plan: DealPlan | null | undefined): void {
  if (!plan) return;
  const refusal = planRefusal(totalMinor, plan);
  if (refusal) throw new PreconditionFailedError("plan_refused", { detail: refusal });
}

export interface Settled {
  shares: DealShare[];
  fundShares: FundShare[];
  keptMinor: number;
  planShares: DealShare[];
  planFundShares: FundShare[];
  paidMinor: number;
  payments: DealPayment[];
}

/**
 * The numbers a deal is approved with. Paid in full, everything is earned now.
 * On a plan, the full-price shares are fixed now and only the deposit is earned.
 */
export function settleNumbers(
  amountMinor: number,
  cell: CommissionSplit,
  chain: readonly (ChainMember | null)[],
  plan: DealPlan | null,
  /** `paidOn` is the day the deposit was paid, which is the day the deal closed, not the day it was approved. */
  deposit: { at: number; paidOn?: number; byName: string; proof: string[] },
): Settled {
  const full = splitDeal(amountMinor, cell, chain);
  const fullShares: DealShare[] = full.people.map((line) => ({
    marketerId: line.marketerId,
    marketerName: line.marketerName,
    code: line.code,
    level: line.level,
    rate: line.rate,
    amountMinor: line.amountMinor,
  }));
  if (!plan) {
    return {
      shares: fullShares,
      fundShares: full.funds,
      keptMinor: full.keptMinor,
      planShares: [],
      planFundShares: [],
      paidMinor: amountMinor,
      payments: [],
    };
  }
  const paid = Math.max(0, Math.min(plan.depositMinor, amountMinor));
  if (paid === 0) {
    return { shares: [], fundShares: [], keptMinor: 0, planShares: fullShares, planFundShares: full.funds, paidMinor: 0, payments: [] };
  }
  const slice = slicePayment(0, paid, amountMinor, { people: fullShares, funds: full.funds });
  return {
    shares: slice.people,
    fundShares: slice.funds,
    keptMinor: slice.keptMinor,
    planShares: fullShares,
    planFundShares: full.funds,
    paidMinor: paid,
    payments: [
      {
        id: newId("dpay", deposit.at),
        amountMinor: paid,
        paidOn: deposit.paidOn || deposit.at,
        proof: deposit.proof,
        note: "Deposit",
        status: "verified",
        reportedBySide: "marketer",
        reportedByName: deposit.byName,
        reviewedByName: deposit.byName,
        reviewedAt: deposit.at,
        reason: "",
        shares: slice.people,
        fundShares: slice.funds,
        keptMinor: slice.keptMinor,
        createdAt: deposit.at,
      },
    ],
  };
}

/** Ledger lines for what one payment earned. */
export async function creditPayment(
  db: Db,
  deal: { id: string; currency: string; listingTitle: string },
  payment: Pick<DealPayment, "id" | "shares" | "note">,
  accrue: FundAccrual,
  funds: readonly FundShare[],
  byName: string,
): Promise<void> {
  const now = Date.now();
  if (payment.shares.length > 0) {
    await ledger(db).insertMany(
      payment.shares.map((share, index) => ({
        _id: newId("ledg", now + index),
        marketerId: share.marketerId,
        dealId: deal.id,
        level: share.level,
        kind: "earn" as const,
        amountMinor: share.amountMinor,
        currency: deal.currency,
        status: "earned" as const,
        payRunId: null,
        reversesId: null,
        note: payment.note,
        dealTitle: deal.listingTitle,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  await accrue(db, { dealId: deal.id, key: payment.id, currency: deal.currency, shares: funds, byName });
}

export interface PaymentInput {
  amountMinor: number;
  paidOn: number;
  proof: string[];
  note: string;
}

export interface PaymentActor {
  side: "marketer" | "admin";
  name: string;
  /** For the marketer side: only the deal's own reporter may log a payment. */
  marketerId?: string;
}

function onPlan(doc: DealDoc | null, id: string): DealDoc & { plan: DealPlan } {
  if (!doc) throw new NotFoundError(`deal ${id}`);
  if (doc.status !== "approved" || !doc.plan) {
    throw new PreconditionFailedError("not_on_plan", {
      detail: "Payments are logged on an approved deal that is on a payment plan.",
    });
  }
  return doc as DealDoc & { plan: DealPlan };
}

/**
 * A payment received. From the app it waits for AV Homes to verify it; from the
 * console it is verified as it is logged.
 */
export async function logPayment(
  db: Db,
  dealId: string,
  input: PaymentInput,
  actor: PaymentActor,
  accrue: FundAccrual,
): Promise<{ deal: Deal; payment: DealPayment; verified: Verified | null }> {
  const filter =
    actor.side === "marketer" ? { _id: dealId, reporterId: actor.marketerId ?? "" } : { _id: dealId };
  const doc = onPlan(await deals(db).findOne(filter), dealId);
  const standing = planStanding(doc.amountMinor, doc.plan, doc.payments ?? [], Date.now());
  const room = standing.leftMinor - standing.pendingMinor;
  if (input.amountMinor < 1 || input.amountMinor > room) {
    throw new PreconditionFailedError("payment_too_large", {
      detail:
        room <= 0
          ? "Everything left on this plan is already logged or paid."
          : "That is more than is left to pay on this plan.",
    });
  }
  const now = Date.now();
  const payment: DealPayment = {
    id: newId("dpay", now),
    amountMinor: input.amountMinor,
    paidOn: input.paidOn || now,
    proof: input.proof,
    note: input.note.trim(),
    status: "pending",
    reportedBySide: actor.side,
    reportedByName: actor.name,
    reviewedByName: "",
    reviewedAt: null,
    reason: "",
    shares: [],
    fundShares: [],
    keptMinor: 0,
    createdAt: now,
  };
  await deals(db).updateOne({ _id: dealId }, { $push: { payments: payment }, $set: { updatedAt: now } });
  if (actor.side === "admin") {
    const verified = await verifyPayment(db, dealId, payment.id, { name: actor.name }, accrue);
    return { deal: verified.deal, payment: verified.payment, verified };
  }
  const after = await deals(db).findOne({ _id: dealId });
  return { deal: toDeal(after as DealDoc), payment, verified: null };
}

export interface Verified {
  deal: Deal;
  payment: DealPayment;
  /** True when this payment completed the plan. */
  complete: boolean;
}

/**
 * Verify a logged payment and credit what it earned.
 *
 * Guarded on `paidMinor`, so two payments verified at the same moment cannot
 * both be priced from the same starting point: the loser re-reads and retries.
 */
export async function verifyPayment(
  db: Db,
  dealId: string,
  paymentId: string,
  actor: { name: string },
  accrue: FundAccrual,
  amountMinor?: number,
): Promise<Verified> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = onPlan(await deals(db).findOne({ _id: dealId }), dealId);
    const payment = (doc.payments ?? []).find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundError(`payment ${paymentId}`);
    if (payment.status !== "pending") {
      throw new PreconditionFailedError("payment_decided", { detail: "This payment has already been decided." });
    }
    const amount = amountMinor ?? payment.amountMinor;
    const before = doc.paidMinor ?? 0;
    if (amount < 1 || before + amount > doc.amountMinor) {
      throw new PreconditionFailedError("payment_too_large", {
        detail: "That is more than is left to pay on this plan.",
      });
    }
    const slice = slicePayment(before, amount, doc.amountMinor, {
      people: doc.planShares ?? [],
      funds: doc.planFundShares ?? [],
    });
    const now = Date.now();
    const result = await deals(db).updateOne(
      { _id: dealId, paidMinor: before, payments: { $elemMatch: { id: paymentId, status: "pending" } } },
      {
        $set: {
          paidMinor: before + amount,
          shares: sumShares([doc.shares ?? [], slice.people]),
          fundShares: sumFundShares([doc.fundShares ?? [], slice.funds]),
          keptMinor: (doc.keptMinor ?? 0) + slice.keptMinor,
          updatedAt: now,
          "payments.$[p].status": "verified",
          "payments.$[p].amountMinor": amount,
          "payments.$[p].shares": slice.people,
          "payments.$[p].fundShares": slice.funds,
          "payments.$[p].keptMinor": slice.keptMinor,
          "payments.$[p].reviewedByName": actor.name,
          "payments.$[p].reviewedAt": now,
        },
      },
      { arrayFilters: [{ "p.id": paymentId }] },
    );
    if (result.modifiedCount === 0) continue;

    const settled: DealPayment = {
      ...payment,
      status: "verified",
      amountMinor: amount,
      shares: slice.people,
      fundShares: slice.funds,
      keptMinor: slice.keptMinor,
      reviewedByName: actor.name,
      reviewedAt: now,
    };
    const count = (doc.payments ?? []).filter((p) => p.status === "verified").length + 1;
    await creditPayment(
      db,
      { id: dealId, currency: doc.currency, listingTitle: doc.listingTitle },
      { id: paymentId, shares: slice.people, note: `Payment ${count} on the plan` },
      accrue,
      slice.funds,
      actor.name,
    );
    const after = await deals(db).findOne({ _id: dealId });
    return { deal: toDeal(after as DealDoc), payment: settled, complete: before + amount === doc.amountMinor };
  }
  throw new PreconditionFailedError("busy", { detail: "Another payment was being verified. Try again." });
}

export async function rejectPayment(
  db: Db,
  dealId: string,
  paymentId: string,
  reason: string,
  actor: { name: string },
): Promise<{ deal: Deal; payment: DealPayment }> {
  const now = Date.now();
  const after = await deals(db).findOneAndUpdate(
    { _id: dealId, payments: { $elemMatch: { id: paymentId, status: "pending" } } },
    {
      $set: {
        "payments.$[p].status": "rejected",
        "payments.$[p].reason": reason.trim(),
        "payments.$[p].reviewedByName": actor.name,
        "payments.$[p].reviewedAt": now,
        updatedAt: now,
      },
    },
    { arrayFilters: [{ "p.id": paymentId }], returnDocument: "after" },
  );
  if (!after) {
    throw new PreconditionFailedError("payment_decided", { detail: "This payment is not waiting to be checked." });
  }
  const deal = toDeal(after);
  return { deal, payment: deal.payments.find((p) => p.id === paymentId) as DealPayment };
}

export interface DueReminder {
  deal: Deal;
  standing: PlanStanding;
  late: boolean;
}

/**
 * Every plan owed a reminder right now, each claimed so it is sent once even if
 * two runs overlap.
 */
export async function claimDueReminders(db: Db, now: number): Promise<DueReminder[]> {
  const rows = await deals(db)
    .find({ status: "approved", plan: { $ne: null }, $expr: { $lt: ["$paidMinor", "$amountMinor"] } })
    .toArray();
  const out: DueReminder[] = [];
  for (const doc of rows) {
    if (!doc.plan) continue;
    const standing = planStanding(doc.amountMinor, doc.plan, doc.payments ?? [], now);
    const owed = reminderKey(standing, now);
    if (!owed) continue;
    const claimed = await deals(db).updateOne(
      { _id: doc._id, reminders: { $ne: owed.key } },
      { $addToSet: { reminders: owed.key } },
    );
    if (claimed.modifiedCount === 1) out.push({ deal: toDeal(doc), standing, late: owed.late });
  }
  return out;
}

/** Plans needing a follow up, for the console: overdue first. */
export async function plansNeedingAttention(db: Db, now: number): Promise<{ deal: Deal; standing: PlanStanding }[]> {
  const rows = await deals(db)
    .find({ status: "approved", plan: { $ne: null }, $expr: { $lt: ["$paidMinor", "$amountMinor"] } })
    .toArray();
  const order = { overdue: 0, "due-soon": 1, "on-track": 2, paid: 3 } as const;
  return rows
    .filter((doc) => doc.plan)
    .map((doc) => ({ deal: toDeal(doc), standing: planStanding(doc.amountMinor, doc.plan as DealPlan, doc.payments ?? [], now) }))
    .sort((a, b) => order[a.standing.state] - order[b.standing.state] || (a.standing.next?.dueOn ?? 0) - (b.standing.next?.dueOn ?? 0));
}

/** A partner's own purchases: interest they registered, and payments they made. */
export async function purchasesFor(db: Db, marketerId: string): Promise<{ interests: Lead[]; deals: Deal[] }> {
  const [leadDocs, dealDocs] = await Promise.all([
    collection<LeadDoc>(db, COLLECTIONS.marketingLeads)
      .find({ reporterId: marketerId, self: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray(),
    deals(db).find({ reporterId: marketerId, selfPurchase: true }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  return { interests: leadDocs.map(toLead), deals: dealDocs.map(toDeal) };
}
