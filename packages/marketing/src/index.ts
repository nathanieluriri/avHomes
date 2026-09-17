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
  type MarketingDeps,
  type RecentListing,
} from "./routes";

export { readMarketingSettings, writeMarketingSettings } from "./settings";

export {
  balanceFor,
  chainFor,
  createMarketer,
  findMarketerByCode,
  findMarketerById,
  findMarketerByUser,
  listDeals,
  listMarketers,
  marketingCounts,
  reconcile,
  rootMarketer,
  teamFor,
  type MarketingCounts,
  type TeamSummary,
} from "./repo";

export { listBanks, paystackConfigured, resolveAccount, type BankOption } from "./bank";

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
