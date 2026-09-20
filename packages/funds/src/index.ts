/**
 * @avhomes/funds
 *
 * The community fund and the quarterly prize: two pots that are nobody's
 * commission.
 *
 * A package rather than more code in marketing because the fund ledger is
 * written by deals and read by analytics, and a feature package may not import
 * another. Marketing receives `accrueForDeal` and `reverseForDeal` as ports,
 * injected at `packages/api`, which is how every crossing in this repo works.
 *
 * It imports no feature package itself. The one thing it needs from marketing,
 * paying a marketer winner, arrives as a callback on `settleAward`.
 */
export {
  accrueForDeal,
  disburse,
  fundBalance,
  fundBalances,
  getAward,
  listAwards,
  listFundEntries,
  proposeAward,
  reconcileFunds,
  reverseForDeal,
  settleAward,
  type FundAccrualPort,
  type FundReversalPort,
} from "./repo";

export { fundsRoutes, type FundNamesPort } from "./routes";
