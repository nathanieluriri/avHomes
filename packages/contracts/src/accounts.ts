/**
 * The accountant's view: what came in, what went out, what is still owed, and
 * whether every payout carries its proof.
 */

/** One calendar month of the books. Every amount is in minor units. */
export interface AccountsMonth {
  /** `2026-09`. */
  month: string;
  deals: number;
  /** The value of the sales and rentals approved and closed this month. */
  salesMinor: number;
  /** What those deals owe partners in commission and overrides, as settled. */
  commissionMinor: number;
  /** What those deals put into the two funds. */
  fundsMinor: number;
  /** What AV Homes kept of them. */
  keptMinor: number;
  /** Commission transfers marked sent this month. */
  paidOutMinor: number;
  /** Money taken back from partners this month for deals that fell through. Positive. */
  clawbackMinor: number;
  /** Money into the two funds this month, accruals and corrections. */
  fundInMinor: number;
  /** Money paid out of the two funds this month. Positive. */
  fundOutMinor: number;
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

export interface AccountsReport {
  currency: string;
  from: string;
  to: string;
  months: AccountsMonth[];
  totals: Omit<AccountsMonth, "month">;
  /** Where things stand today, whatever period is chosen. */
  position: {
    /** Approved commission not yet sent: waiting for a pay run or in one. */
    commissionOwedMinor: number;
    /** The part of that already on a pay run. */
    commissionScheduledMinor: number;
    funds: { fund: string; name: string; balanceMinor: number }[];
    /** The value of deals still being checked. Not owed until approved. */
    pendingDealsMinor: number;
  };
  /** The same ledger check pay day runs. */
  check: { ok: boolean; problems: string[] };
  payouts: PayoutRecord[];
}
