/**
 * @avhomes/marketing
 *
 * Marketers, the deals they close, the ledger that records what they earned and
 * the monthly run that pays it. It may not import @avhomes/listings,
 * @avhomes/media or @avhomes/enquiries: a listing reaches it as the snapshot the
 * app posts, and file storage arrives as a port from the composition root.
 */
export {
  marketingPublicRoutes,
  marketingAppRoutes,
  marketingAdminRoutes,
  type ListingFacts,
  type MarketingDeps,
  type RecentListing,
} from "./routes";

export {
  paystackKeySaved,
  readMarketingSettings,
  readPaystackKey,
  writeMarketingSettings,
  writePaystackKey,
} from "./settings";

export {
  approvedDealIds,
  balanceFor,
  chainFor,
  createMarketer,
  findClosers,
  findMarketerByCode,
  findMarketerById,
  findMarketerByUser,
  listDeals,
  listMarketers,
  marketingCounts,
  previewSplit,
  reconcile,
  recordSale,
  recordSaleRefusal,
  rootMarketer,
  settledAwaitingClose,
  statementFor,
  teamFor,
  type CloserInput,
  type FundAccrual,
  type FundReversal,
  type MarketingCounts,
  type RecordSaleInput,
  type SaleListing,
  type TeamSummary,
} from "./repo";

/** Paying a marketer a quarterly prize. Handed to @avhomes/funds as a callback. */
export { creditAdjustment } from "./repo";

export {
  listBanks,
  providerState,
  resolveAccount,
  type BankOption,
  type ProviderState,
} from "./bank";

export {
  createLead,
  getLead,
  getLeadFor,
  leadCounts,
  listLeads,
  moveLead,
  noteOnLead,
  openLeadCount,
  winLead,
  withShares,
  type LeadActor,
  type LeadInput,
  type LeadListQuery,
  type WinInput,
} from "./leads";

export {
  toDeal,
  toLead,
  toLedgerLine,
  toMarketer,
  toMarketingUpdate,
  toPayIssue,
  toPayRun,
  type DealDoc,
  type IssueDoc,
  type LeadDoc,
  type LedgerDoc,
  type MarketerDoc,
  type PayRunDoc,
  type UpdateDoc,
} from "./schema";
