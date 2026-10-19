/**
 * The accountant's view: what came in, where it went, what is still owed either
 * way, and whether every payout carries its proof.
 *
 * Every figure follows one date, named beside it, so a total can be tied back to
 * the rows behind it:
 *   - a deal's agreed value follows the day it closed, like Analytics;
 *   - money in follows the day the buyer paid: an outright deal the day it
 *     closed, a payment plan each deposit and instalment the day it was paid;
 *   - what partners earned follows the day it was credited (approval, or a plan
 *     payment being verified), like their own Money screens;
 *   - the funds follow their own ledger, like The two funds page.
 */

import type { PlanState } from "./plans";

/** One calendar month of the books. Every amount is in minor units. */
export interface AccountsMonth {
  /** `2026-09`. */
  month: string;
  /** Deals that closed this month and are approved. */
  deals: number;
  /** What those deals were agreed at, in full. The Analytics "Transacted" figure. */
  agreedMinor: number;
  /** The part of that on payment plans. */
  planAgreedMinor: number;
  /** Received from buyers this month. */
  moneyInMinor: number;
  /** The part of that which was deposits and instalments on payment plans. */
  planReceivedMinor: number;
  /** The closer's commission on that money (level 1). */
  commissionMinor: number;
  /** Upline overrides on that money (levels 2 and 3). */
  overridesMinor: number;
  /** The two funds' share of that money. */
  fundsMinor: number;
  /** What AV Homes kept of that money. */
  keptMinor: number;
  /** Credited to partners this month, adjustments included. */
  earnedMinor: number;
  /** Taken back from partners for deals that fell through. Positive. */
  clawbackMinor: number;
  /** Sent to partners on pay day. */
  paidOutMinor: number;
  /** Into the two funds, net of shares handed back. */
  fundInMinor: number;
  /** Paid out of the two funds. Positive. */
  fundOutMinor: number;
  /** Owed to partners at the end of the month. */
  owedEndMinor: number;
  /** Held by the two funds at the end of the month. */
  fundsEndMinor: number;
  /** Still to be paid by buyers on payment plans at the end of the month. */
  dueEndMinor: number;
}

export type AccountsFlows = Omit<AccountsMonth, "month" | "owedEndMinor" | "fundsEndMinor" | "dueEndMinor">;

/** Owed to partners over the period: start + earned - clawed back - paid out = end. */
export interface PartnerRoll {
  startMinor: number;
  earnedMinor: number;
  clawbackMinor: number;
  paidOutMinor: number;
  endMinor: number;
}

/** One fund over the period: start + in - out = end. */
export interface FundRoll {
  fund: string;
  name: string;
  startMinor: number;
  inMinor: number;
  outMinor: number;
  endMinor: number;
}

/** Still to be paid by buyers on payment plans: start + new plans - received = end. */
export interface BuyerRoll {
  startMinor: number;
  newPlansMinor: number;
  receivedMinor: number;
  endMinor: number;
}

export const PAYOUT_FLAGS = ["no-proof", "no-reference", "no-bank", "unverified-bank", "disputed"] as const;
export type PayoutFlag = (typeof PAYOUT_FLAGS)[number];

export const PAYOUT_FLAG_LABELS: Record<PayoutFlag, string> = {
  "no-proof": "No receipt",
  "no-reference": "No reference",
  "no-bank": "No bank details",
  "unverified-bank": "Account name not checked",
  disputed: "Partner says it never arrived",
};

/** One partner's line on a pay run, as a compliance check reads it. */
export interface PayoutRecord {
  runId: string;
  month: string;
  marketerId: string;
  code: string;
  displayName: string;
  totalMinor: number;
  status: "pending" | "paid" | "held";
  bankName: string;
  accountName: string;
  /** The last four digits only. */
  accountMasked: string;
  reference: string;
  proof: string[];
  paidAt: number | null;
  paidByName: string;
  flags: PayoutFlag[];
}

/** A plan still being paid, as the accountant reads it. */
export interface AccountsPlan {
  dealId: string;
  property: string;
  buyer: string;
  partner: string;
  selfPurchase: boolean;
  agreedMinor: number;
  /** Verified so far. */
  paidMinor: number;
  /** Logged and waiting to be verified. */
  pendingMinor: number;
  dueMinor: number;
  /** Fallen due and not yet verified. */
  overdueMinor: number;
  nextDueOn: number | null;
  nextMinor: number;
  state: PlanState;
}

export const RECEIPT_TYPES = ["outright", "deposit", "instalment"] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

export const RECEIPT_TYPE_LABEL: Record<ReceiptType, string> = {
  outright: "Paid in full",
  deposit: "Deposit",
  instalment: "Instalment",
};

/** One amount received from a buyer, and where it went. */
export interface AccountsReceipt {
  at: number;
  dealId: string;
  property: string;
  buyer: string;
  partner: string;
  type: ReceiptType;
  selfPurchase: boolean;
  amountMinor: number;
  commissionMinor: number;
  overridesMinor: number;
  fundsMinor: number;
  keptMinor: number;
}

/** One deal closed in the period. On a plan, the split is what has been earned so far. */
export interface AccountsDeal {
  dealId: string;
  closedOn: number;
  property: string;
  buyer: string;
  closer: string;
  ownership: string;
  kind: string;
  selfPurchase: boolean;
  onPlan: boolean;
  agreedMinor: number;
  paidMinor: number;
  commissionMinor: number;
  overridesMinor: number;
  fundsMinor: number;
  keptMinor: number;
}

export const FUND_MOVE_TYPES = ["share", "returned", "payment", "adjustment"] as const;
export type FundMoveType = (typeof FUND_MOVE_TYPES)[number];

export const FUND_MOVE_LABEL: Record<FundMoveType, string> = {
  share: "Share of a deal",
  returned: "Handed back, deal cancelled",
  payment: "Payment out",
  adjustment: "Correction",
};

/** One line on a fund's ledger. Signed: money in is positive, money out negative. */
export interface AccountsFundMove {
  at: number;
  fund: string;
  fundName: string;
  type: FundMoveType;
  detail: string;
  reference: string;
  byName: string;
  amountMinor: number;
}

/** Where things stand at the moment the report was made, whatever period is chosen. */
export interface AccountsPosition {
  /** Credited to partners and not yet sent. */
  owedMinor: number;
  /** The part of that already on a pay run. */
  scheduledMinor: number;
  funds: { fund: string; name: string; balanceMinor: number }[];
  /** Still to be paid by buyers on payment plans. */
  dueMinor: number;
  overdueMinor: number;
  plans: number;
  /** Commission and overrides partners will earn as plans are paid. */
  toComeMinor: number;
  /** Plan payments logged and waiting to be verified. */
  paymentsWaiting: number;
  paymentsWaitingMinor: number;
  /** Deals reported and waiting to be checked. Not owed until approved. */
  dealsWaiting: number;
  dealsWaitingMinor: number;
}

/** What the balance sheet screen reads. */
export interface AccountsSummary {
  currency: string;
  from: string;
  to: string;
  generatedAt: number;
  months: AccountsMonth[];
  totals: AccountsFlows;
  partners: PartnerRoll;
  funds: FundRoll[];
  buyers: BuyerRoll;
  position: AccountsPosition;
  /** The same ledger check pay day runs. */
  check: { ok: boolean; problems: string[] };
  payouts: PayoutRecord[];
  plans: AccountsPlan[];
}

/** The summary plus the rows behind it, for the workbook. */
export interface AccountsReport extends AccountsSummary {
  receipts: AccountsReceipt[];
  deals: AccountsDeal[];
  fundMoves: AccountsFundMove[];
}
