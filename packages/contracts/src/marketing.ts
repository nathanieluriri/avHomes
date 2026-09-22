/**
 * Marketers: the referral tree, the deals they close and the money that follows.
 *
 * Three levels and no more. The person who closed a deal earns the level 1 rate,
 * whoever invited them earns level 2, and whoever invited that person earns
 * level 3. Nobody above that earns anything, which is what keeps this a sales
 * commission rather than a recruitment scheme: money only ever enters the system
 * from a real property sale or rental, never from somebody joining.
 *
 * The rates and every other number here are settable from the admin. The values
 * below are only what a site starts with before anyone opens Settings.
 *
 * Two of the five shares of a deal go to nobody: a community fund and a prize
 * pool. Those live in `funds.ts`, because they are not owed to a person and must
 * not enter the marketer ledger. This file knows their percentages and works out
 * their amounts; it does not know where the money is kept.
 */

import { DEFAULT_FUND_NAMES, type FundKind } from "./funds";
import { DEFAULT_CURRENCY, minorUnitsFor } from "./money";
import { OWNERSHIPS, OWNERSHIP_LABEL, type Ownership } from "./types";

/* ═══════════════════════════════════════════════════════════════ MARKETERS ══ */

export const MARKETER_STATUSES = ["active", "paused", "banned"] as const;
export type MarketerStatus = (typeof MARKETER_STATUSES)[number];

/** What the marketer reads about their own account. Not the admin's wording. */
export const MARKETER_STATUS_LABEL: Record<MarketerStatus, string> = {
  active: "Active",
  paused: "Paused",
  banned: "Closed",
};

export interface MarketerBank {
  bankCode: string;
  bankName: string;
  /** NUBAN, ten digits. Stored as typed, never reformatted. */
  accountNumber: string;
  /** What the bank returned for that number. Never what the marketer typed. */
  accountName: string;
  /** Epoch ms of the name check, or null when the check was unavailable. */
  verifiedAt: number | null;
}

export interface Marketer {
  id: string;
  userId: string;
  /** The number a marketer gives out, such as AV-0042. Never reused. */
  code: string;
  displayName: string;
  email: string;
  phone: string;
  state: string;
  status: MarketerStatus;
  /** Why the status was last changed. Shown to the marketer, so it is plain. */
  statusReason: string;
  /** Who invited them, or null for the root account. */
  parentId: string | null;
  /**
   * The chain above them, nearest first, at most two entries.
   *
   * Stored rather than walked because the tree is capped at three levels: the
   * question "who gets paid" is then one read, and a ban that moves a subtree
   * rewrites a bounded number of rows.
   */
  upline: string[];
  bank: MarketerBank | null;
  /** True for a marketer who also holds an admin role. */
  isAdmin: boolean;
  joinedAt: number;
  createdAt: number;
  updatedAt: number;
}

/** A row in the team list. Level 2 and 3 carry no contact details, by design. */
export interface TeamMember {
  id: string;
  code: string;
  displayName: string;
  level: 1 | 2 | 3;
  status: MarketerStatus;
  joinedAt: number;
  /** How many people sit under them, counting both levels below. */
  teamCount: number;
  dealCount: number;
  /** The level 1 person this row hangs under. Empty for level 1 itself. */
  underName: string;
}

/* ═══════════════════════════════════════════════════════════════════ DEALS ══ */

export const DEAL_STATUSES = ["pending", "approved", "rejected", "info", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** The marketer's wording for each state. The admin reads the same words. */
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  pending: "Being checked",
  approved: "Approved",
  rejected: "Not approved",
  info: "Need more info",
  cancelled: "Cancelled",
};

export const DEAL_KINDS = ["sale", "rent"] as const;
export type DealKind = (typeof DEAL_KINDS)[number];

/**
 * Who closed a deal.
 *
 * A marketer earns commission. Staff are salaried and earn nothing here, and a
 * walk-in has nobody to pay at all. All three still feed both funds, and all
 * three are credited on the leaderboard, because the prize is for the best closer
 * whoever that turns out to be.
 */
export const CLOSER_KINDS = ["marketer", "staff", "direct"] as const;
export type CloserKind = (typeof CLOSER_KINDS)[number];

export const CLOSER_KIND_LABEL: Record<CloserKind, string> = {
  marketer: "A marketer",
  staff: "AV Homes staff",
  direct: "Walk-in",
};

/** The one line each option needs beside it, so the choice is made once. */
export const CLOSER_KIND_HINT: Record<CloserKind, string> = {
  marketer: "Pays commission up their referral chain.",
  staff: "No commission. Counts towards their record and the prize.",
  direct: "Nobody to pay. The funds still take their share.",
};

/** Where a deal came from, so the network can be told apart from walk-ins. */
export const DEAL_SOURCES = ["app", "console"] as const;
export type DealSource = (typeof DEAL_SOURCES)[number];

export const DEAL_SOURCE_LABEL: Record<DealSource, string> = {
  app: "Reported in the app",
  console: "Recorded by AV Homes",
};

/** One person's share of one deal, worked out when the deal was approved. */
export interface DealShare {
  marketerId: string;
  marketerName: string;
  code: string;
  level: 1 | 2 | 3;
  /** Whole or one decimal percent, snapshotted from settings at approval. */
  rate: number;
  amountMinor: number;
}

export interface Deal {
  id: string;
  listingId: string;
  /** Snapshot: a listing renamed next year must not rewrite a settled deal. */
  listingTitle: string;
  listingType: DealKind;
  listingLocation: string;
  listingEstate: string;
  /** Which unit of a multi-unit listing. Empty when the listing is one thing. */
  unitKey: string;
  amountMinor: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  /** Uploaded receipts, alerts or agreements. At least one is required. */
  proof: string[];
  note: string;
  /**
   * Who FILED the report, which for an app deal is the marketer and for a console
   * deal is the admin who recorded it. `chainFor` walks from here on a marketer
   * deal, so for one the two ids agree by construction.
   */
  reporterId: string;
  reporterName: string;
  reporterCode: string;
  /** Who CLOSED it, which is who the money and the leaderboard follow. */
  closerKind: CloserKind;
  /** A marketer id, a user id, or empty for a walk-in. */
  closerId: string;
  closerName: string;
  /** Whose property it was, snapshotted: the rate depended on it. */
  ownership: Ownership;
  /**
   * The cell as applied. Snapshotted with the shares, so an admin changing the
   * rate table next month never rewrites what a settled deal paid.
   */
  split: CommissionSplit;
  fundShares: FundShare[];
  /** What AV Homes kept. See splitDeal. */
  keptMinor: number;
  source: DealSource;
  /** The potential buyer this grew out of, when it did. */
  leadId: string | null;
  status: DealStatus;
  /** Admin's one line when the deal was refused or sent back. */
  reason: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: number | null;
  closedOn: number;
  shares: DealShare[];
  createdAt: number;
  updatedAt: number;
}

/* ══════════════════════════════════════════════════════════════════ LEDGER ══ */

export const LEDGER_KINDS = ["earn", "clawback", "adjust"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_STATUSES = ["earned", "scheduled", "paid", "void"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * One line of money. Lines are added, never edited.
 *
 * A deal that falls through after the money was paid does not delete anything:
 * it adds a `clawback` line for the negative amount, which the next pay run
 * subtracts. That is what makes a marketer's history readable a year later.
 */
export interface LedgerLine {
  id: string;
  marketerId: string;
  dealId: string | null;
  /** 0 for an adjustment that belongs to no deal. */
  level: 0 | 1 | 2 | 3;
  kind: LedgerKind;
  /** Signed. A clawback is negative. */
  amountMinor: number;
  currency: string;
  status: LedgerStatus;
  payRunId: string | null;
  /** The line this one reverses, for a clawback. */
  reversesId: string | null;
  note: string;
  /** Snapshot for the marketer's list, so one read draws the screen. */
  dealTitle: string;
  createdAt: number;
  updatedAt: number;
}

/** What the marketer's money screen adds up to. */
export interface MarketerBalance {
  currency: string;
  /** Approved, not yet in a pay run. */
  waitingMinor: number;
  /** In an open pay run, so it is about to be sent. */
  scheduledMinor: number;
  paidMinor: number;
  /** Deals still being checked. Not money yet, and labelled as such. */
  pendingMinor: number;
}

/* ═════════════════════════════════════════════════════════════════ PAY RUNS ══ */

export const PAY_RUN_STATUSES = ["draft", "paying", "closed"] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

export const PAY_ITEM_STATUSES = ["pending", "paid", "held"] as const;
export type PayItemStatus = (typeof PAY_ITEM_STATUSES)[number];

export interface PayRunItem {
  marketerId: string;
  code: string;
  displayName: string;
  totalMinor: number;
  /** Bank details copied in when the run was made, so a later edit is harmless. */
  bank: MarketerBank | null;
  status: PayItemStatus;
  proof: string[];
  reference: string;
  paidAt: number | null;
  paidByName: string;
  /** Set when the marketer says the money never arrived. */
  issueId: string | null;
  note: string;
}

export interface PayRun {
  id: string;
  /** `2026-09`. One run per month, which is what the owner asked for. */
  month: string;
  status: PayRunStatus;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  items: PayRunItem[];
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

/* ═══════════════════════════════════════════════════════ PAYMENT PROBLEMS ══ */

export const ISSUE_STATUSES = ["open", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface IssueMessage {
  at: number;
  byName: string;
  /** Who is speaking, so the thread reads as a conversation. */
  bySide: "marketer" | "admin";
  text: string;
  proof: string[];
}

export interface PayIssue {
  id: string;
  payRunId: string;
  month: string;
  marketerId: string;
  marketerName: string;
  code: string;
  amountMinor: number;
  currency: string;
  status: IssueStatus;
  messages: IssueMessage[];
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

/* ═══════════════════════════════════════════════════════════════════ ALERTS ══ */

/**
 * What the app asks a marketer to handle.
 *
 * Worked out from their own data on every read and never stored, so an alert
 * cannot outlive the thing it is about: add the bank account and the alert is
 * gone on the next read, with nothing to mark as done.
 *
 * `act` stops money reaching them until they do something. `heads-up` is worth
 * knowing and needs nothing today. `good` is news. The bell counts `act` only,
 * because a badge that also counts good news teaches people to ignore it.
 */
export const MARKETER_ALERT_TONES = ["act", "heads-up", "good"] as const;
export type MarketerAlertTone = (typeof MARKETER_ALERT_TONES)[number];

export const MARKETER_ALERT_ICONS = [
  "bank",
  "deals",
  "shield",
  "money",
  "team",
  "payday",
  "photo",
  "check",
  "alerts",
] as const;
export type MarketerAlertIcon = (typeof MARKETER_ALERT_ICONS)[number];

export interface MarketerAlert {
  /** Stable across reads, such as `deal-info:deal_...`, so a list can key on it. */
  id: string;
  tone: MarketerAlertTone;
  icon: MarketerAlertIcon;
  title: string;
  /** One short line, written to fit a home card whole. Never an admin's free text. */
  body: string;
  /** The longer words behind it, such as an admin's reason or reply. Empty when there are none. */
  detail: string;
  /** The one thing to do, and the app screen that does it. */
  action: { label: string; href: string };
  /** When the thing it describes happened. */
  at: number;
}

/* ══════════════════════════════════════════════════════════════════ UPDATES ══ */

export const MARKETING_UPDATE_TONES = ["wine", "gold", "plum"] as const;
export type MarketingUpdateTone = (typeof MARKETING_UPDATE_TONES)[number];

export const MARKETING_UPDATE_STATUSES = ["draft", "live"] as const;
export type MarketingUpdateStatus = (typeof MARKETING_UPDATE_STATUSES)[number];

export const MARKETING_UPDATE_SOURCES = ["admin", "listing"] as const;
export type MarketingUpdateSource = (typeof MARKETING_UPDATE_SOURCES)[number];

/** A card in the app's Updates carousel. */
export interface MarketingUpdate {
  id: string;
  title: string;
  body: string;
  /** Empty for a card with no picture. */
  imageUrl: string;
  /** Both empty or both set: a button needs a name and somewhere to go. */
  linkLabel: string;
  linkHref: string;
  tone: MarketingUpdateTone;
  pinned: boolean;
  status: MarketingUpdateStatus;
  startsAt: number;
  /** Exclusive. Null runs until somebody takes it down. */
  endsAt: number | null;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  /** `listing` cards are made by the feed from new listings. Nobody edits them. */
  source: MarketingUpdateSource;
}

/** Shared by the console form and the API, so Save never comes back refused for length. */
export const UPDATE_TITLE_MAX = 80;
export const UPDATE_BODY_MAX = 280;
export const UPDATE_LINK_LABEL_MAX = 24;
export const UPDATE_LINK_MAX = 500;

/**
 * Where an update's button may go.
 *
 * A screen in this site, or a web, phone or mail address. Anything else is
 * refused, because this string becomes an `href` on every marketer's phone and
 * `javascript:` is a URL too. `//host` and a backslash are refused as well:
 * browsers read both as another site.
 */
export function updateLinkRefusal(href: string): string | null {
  const value = href.trim();
  if (value === "") return null;
  if (/[\s\\]/u.test(value)) return "A link cannot have spaces or backslashes in it.";
  if (value.startsWith("//")) return "Start the link with one /, or with https://.";
  if (value.startsWith("/")) return null;
  if (/^https?:\/\/[^/]/iu.test(value) || /^(mailto|tel):[^/]/iu.test(value)) return null;
  return "Start the link with / for a screen in the app, or with https:// for a website.";
}

/** An uploaded picture: a path on this site or a web address, never a data URL. */
function updateImageRefusal(url: string): string | null {
  const value = url.trim();
  if (value === "") return null;
  if (/[\s\\]/u.test(value) || value.startsWith("//")) return "That picture address is not usable.";
  if (value.startsWith("/") || /^https?:\/\/[^/]/iu.test(value)) return null;
  return "That picture address is not usable.";
}

/** Everything about an update the API refuses, checked the same way on both sides. */
export function updateRefusal(update: {
  title: string;
  imageUrl: string;
  linkLabel: string;
  linkHref: string;
  startsAt: number;
  endsAt: number | null;
}): { path: string; message: string } | null {
  if (update.title.trim() === "") return { path: "title", message: "An update needs a title." };
  const hasLabel = update.linkLabel.trim() !== "";
  const hasHref = update.linkHref.trim() !== "";
  if (hasLabel && !hasHref) {
    return { path: "linkHref", message: "Add where the button goes, or clear its name." };
  }
  if (hasHref && !hasLabel) {
    return { path: "linkLabel", message: "Name the button, or clear the link." };
  }
  const link = updateLinkRefusal(update.linkHref);
  if (link) return { path: "linkHref", message: link };
  const image = updateImageRefusal(update.imageUrl);
  if (image) return { path: "imageUrl", message: image };
  if (update.endsAt !== null && update.endsAt <= update.startsAt) {
    return { path: "endsAt", message: "The last day is before the first day." };
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════ SETTINGS ══ */

/**
 * The five shares of one deal, as whole or one decimal percents.
 *
 * Three go to people and two go to funds, and they are one type because they are
 * one decision: an admin setting the level 1 rate is choosing it against the
 * other four, and splitting them across two shapes would let the total quietly
 * pass 100.
 */
export interface CommissionSplit {
  /** The person who closed it. */
  level1: number;
  /** Whoever invited them. */
  level2: number;
  /** Whoever invited that person. */
  level3: number;
  rewardPool: number;
  foundation: number;
}

/**
 * ownership -> deal kind -> the split. Four independently editable cells.
 *
 * Selling somebody else's house earns AV Homes a fraction of what selling its own
 * does, so paying the same commission on both makes third party stock worse the
 * more of it there is. The matrix is what makes the rate follow the economics.
 */
export type CommissionMatrix = Record<Ownership, Record<DealKind, CommissionSplit>>;

export const DEFAULT_COMMISSION_MATRIX: CommissionMatrix = {
  av: {
    sale: { level1: 5, level2: 2, level3: 1, rewardPool: 1, foundation: 1 },
    rent: { level1: 5, level2: 2, level3: 1, rewardPool: 1, foundation: 1 },
  },
  partner: {
    sale: { level1: 2, level2: 1, level3: 0.5, rewardPool: 1, foundation: 1 },
    rent: { level1: 2, level2: 1, level3: 0.5, rewardPool: 1, foundation: 1 },
  },
};

/** The one cell a deal is priced by. */
export function splitFor(
  matrix: CommissionMatrix,
  ownership: Ownership,
  kind: DealKind,
): CommissionSplit {
  return matrix[ownership][kind];
}

/**
 * The three PERSON levels, nearest first.
 *
 * Still its own type because it is still its own idea: the chain walk takes three
 * rates, and so does every screen that says "5 / 2 / 1". What it no longer is, is
 * the whole split, and `CommissionSplit` is now that.
 */
export type CommissionRates = [number, number, number];

/** The three person levels, nearest first, for the chain walk. */
export function personRates(split: CommissionSplit): CommissionRates {
  return [split.level1, split.level2, split.level3];
}

/** Everything one cell pays out, for a settings screen that shows its own total. */
export function splitTotal(split: CommissionSplit): number {
  return (
    split.level1 + split.level2 + split.level3 + split.rewardPool + split.foundation
  );
}

export const RENT_BASES = ["upfront", "period"] as const;
export type RentBasis = (typeof RENT_BASES)[number];

/**
 * Who answers "what name is on this account number".
 *
 * Kora needs no key and is what this site runs on today. Paystack needs a free
 * key and is the one to be on: Kora's resolve endpoint is reachable without
 * auth because of a hole in their middleware rather than because it is offered,
 * so it can close with no notice. Swapping is one field on the settings screen,
 * deliberately, so the day it closes is a settings change and not a deploy.
 */
export const ACCOUNT_PROVIDERS = ["kora", "paystack"] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];

export const ACCOUNT_PROVIDER_LABEL: Record<AccountProvider, string> = {
  kora: "Kora",
  paystack: "Paystack",
};

/**
 * Do these two names plausibly belong to the same person?
 *
 * Deliberately loose, and never an equality test. A real answer from a Nigerian
 * bank looks like `URIRI  NATHANIEL ELO OGHENE`: two spaces in the middle, the
 * surname first, and middle names the account holder never types. Comparing
 * that to "Nathaniel Uriri" with `===` fails every time, so the check is how
 * many words the two share.
 *
 * This is ADVICE, not a gate. The account resolving at all is the thing that
 * stops money going to a typo; whether the name matches is for a human to look
 * at, because a wife's account, a business name and a middle name nobody uses
 * are all legitimate and all fail a strict check.
 */
export function namesMatch(bankName: string, personName: string): boolean {
  const words = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z\s]/gu, " ")
        .split(/\s+/u)
        .filter((word) => word.length > 1),
    );
  const bank = words(bankName);
  const person = words(personName);
  if (person.size === 0 || bank.size === 0) return false;
  let shared = 0;
  for (const word of person) if (bank.has(word)) shared += 1;
  // Two shared words, or every word of a single-word name.
  return shared >= Math.min(2, person.size);
}

/**
 * How a person's score is weighted. Editable, and the four are shown with their
 * running total, because weights that do not sum to 100 make a score out of
 * something other than 100 and a screen should say so rather than hide it.
 *
 * The scoring that reads these is further down, under THE RATING.
 */
export interface RatingWeights {
  value: number;
  deals: number;
  conversion: number;
  speed: number;
}

export const DEFAULT_RATING_WEIGHTS: RatingWeights = {
  value: 50,
  deals: 20,
  conversion: 20,
  speed: 10,
};

export interface MarketingSettings {
  /**
   * The four rate cells. See splitFor.
   *
   * This replaced a `saleRates`/`rentRates` pair that knew nothing about whose
   * property a listing was. A document written before the change derives a matrix
   * on read; see `readMarketingSettings`.
   */
  commission: CommissionMatrix;
  /** Display names for the two funds. Renameable; the keys never change. */
  rewardPoolName: string;
  foundationName: string;
  /** How a person's score is weighted. Shown with its breakdown, never alone. */
  rating: RatingWeights;
  /**
   * What a rent commission is a percentage of. `upfront` is everything the
   * tenant paid at move in, which is the usual Nigerian year up front.
   */
  rentBasis: RentBasis;
  /** How long a marketer has to say a payment never arrived. */
  issueWindowDays: number;
  /** Deals approved after this day of the month wait for the next pay run. */
  payCutoffDay: number;
  /** Off means a new marketer is active the moment they sign up. */
  requireApproval: boolean;
  /** Off closes the sign up page. Existing marketers keep working. */
  joinOpen: boolean;
  /** Refuse a deal whose buyer phone belongs to the reporter or their upline. */
  blockSelfDeals: boolean;
  /** A pay run skips anyone under this. 0 pays every balance. */
  minPayoutMinor: number;
  currency: string;
  /** Shown on the marketer's sign up page and in the app's help sheet. */
  supportPhone: string;
  /**
   * Who checks bank account names. The KEY is not on this type on purpose: this
   * shape goes to the browser, and a secret that is one `console.log` from a
   * screenshot is not a secret. The server reads the key separately.
   */
  accountProvider: AccountProvider;
  updatedAt: number;
}

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  commission: DEFAULT_COMMISSION_MATRIX,
  rewardPoolName: DEFAULT_FUND_NAMES.reward,
  foundationName: DEFAULT_FUND_NAMES.foundation,
  rating: DEFAULT_RATING_WEIGHTS,
  rentBasis: "upfront",
  issueWindowDays: 14,
  payCutoffDay: 25,
  requireApproval: false,
  joinOpen: true,
  blockSelfDeals: true,
  minPayoutMinor: 0,
  currency: DEFAULT_CURRENCY,
  supportPhone: "",
  accountProvider: "kora",
  updatedAt: 0,
};

/* ════════════════════════════════════════════════════════════════ THE MATH ══ */

/** One person in the chain, as the splitter needs them. */
export interface ChainMember {
  id: string;
  name: string;
  code: string;
  status: MarketerStatus;
}

export interface SplitLine {
  marketerId: string;
  marketerName: string;
  code: string;
  level: 1 | 2 | 3;
  rate: number;
  amountMinor: number;
}

/** One fund's cut of one deal, worked out at the same moment as the people's. */
export interface FundShare {
  fund: FundKind;
  rate: number;
  amountMinor: number;
}

export interface DealSplit {
  people: SplitLine[];
  funds: FundShare[];
  /** What AV Homes keeps: the remainder, a paused upline's share included. */
  keptMinor: number;
}

/**
 * Who earns what on one deal, and what the two funds take.
 *
 * `chain` is the person who closed it, then their referrer, then theirs. A
 * paused or banned person earns nothing and their share is not handed up the
 * chain: AV Homes keeps it. Rounding is down to the minor unit, because paying
 * a fraction of a kobo is not a thing a bank transfer can do.
 *
 * `keptMinor` is new and it is the reason this replaced `splitCommission`. The
 * remainder was always there and was always invisible, so "what did AV Homes
 * keep" had no answer. Being the subtraction of everything paid out rather than
 * its own percentage is what makes it exact: every share plus kept is the deal.
 *
 * Fund shares accrue even when `chain` is empty. The rule is a percentage of
 * every transaction, not of every commission, so a walk-in sale with nobody to
 * pay still feeds both funds.
 */
export function splitDeal(
  amountMinor: number,
  split: CommissionSplit,
  chain: readonly (ChainMember | null)[],
): DealSplit {
  const people: SplitLine[] = [];
  const funds: FundShare[] = [];
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { people, funds, keptMinor: 0 };
  }

  const rates = personRates(split);
  for (let i = 0; i < 3; i++) {
    const member = chain[i];
    if (!member || member.status !== "active") continue;
    const rate = rates[i] ?? 0;
    if (rate <= 0) continue;
    const amount = Math.floor((amountMinor * rate) / 100);
    if (amount <= 0) continue;
    people.push({
      marketerId: member.id,
      marketerName: member.name,
      code: member.code,
      level: (i + 1) as 1 | 2 | 3,
      rate,
      amountMinor: amount,
    });
  }

  const fundRates: readonly (readonly [FundKind, number])[] = [
    ["reward", split.rewardPool],
    ["foundation", split.foundation],
  ];
  for (const [fund, rate] of fundRates) {
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const amount = Math.floor((amountMinor * rate) / 100);
    if (amount <= 0) continue;
    funds.push({ fund, rate, amountMinor: amount });
  }

  const out =
    people.reduce((total, line) => total + line.amountMinor, 0) +
    funds.reduce((total, share) => total + share.amountMinor, 0);
  return { people, funds, keptMinor: amountMinor - out };
}

// TODO(test): a paused level 2 leaves its share in keptMinor and does not promote
// level 3 into level 2's rate.
// TODO(test): both funds accrue when the chain is empty, which is a direct sale.
// TODO(test): keptMinor plus every people and fund share equals amountMinor exactly.

/**
 * What one marketer would earn closing this, at this price, on this property.
 *
 * Takes the whole cell rather than a rate, so the app cannot accidentally quote
 * an AV Homes number on a Non-AV listing: picking the cell is the caller's one
 * decision and `splitFor` is the only way to make it.
 */
export function previewEarning(amountMinor: number, split: CommissionSplit): number {
  return earningAtRate(amountMinor, split.level1);
}

/**
 * The same sum for a caller holding a bare rate rather than a cell.
 *
 * The marketer app is that caller: the API hands it the three person rates per
 * ownership class, already resolved, because a phone has no business holding the
 * whole matrix. Rounding is identical, so the app and the server never quote two
 * different numbers for one listing.
 */
export function earningAtRate(amountMinor: number, rate: number): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.floor((amountMinor * rate) / 100);
}

/** `2026-09` for the month a timestamp falls in, in the server's own zone. */
export function payMonth(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "September 2026" from `2026-09`. Used on both sides of the product. */
export function payMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  const index = Number(mon) - 1;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[index] ?? month} ${year ?? ""}`.trim();
}

/** Money for the marketer app: no decimals, always the symbol. */
export function formatMoney(minor: number, currency = DEFAULT_CURRENCY): string {
  const value = minor / minorUnitsFor(currency);
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
  return formatted;
}

/** The referral link a marketer shares. One place, so every surface agrees. */
export function joinLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/u, "")}/m/join/${code}`;
}

/** The next code in sequence. `AV-0001` upward, zero padded to four. */
export function marketerCode(seq: number): string {
  return `AV-${String(seq).padStart(4, "0")}`;
}

/**
 * A marketer code from a shared link's `?ref=`, or null.
 *
 * Uppercased, because a code read aloud and typed into a message arrives in any
 * case. Anything else is dropped rather than refused: a tampered link must never
 * stop a buyer's enquiry from going through.
 */
export function referralCodeFrom(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^AV-[0-9]{4,8}$/u.test(code) ? code : null;
}

/**
 * A sale on the record whose listing is still advertised as for sale.
 *
 * Approving a marketer's deal settles the money, but the listing stays live until
 * somebody takes it off the market, because that is a separate decision: the
 * proof is checked first, then the house comes down. One of these is the gap
 * between the two, and the console names each until it is closed.
 *
 * Only a listing that is ONE thing. A deal on a single unit of an estate leaves
 * the estate on the market for the rest of its units.
 */
export interface AwaitingClose {
  dealId: string;
  listingId: string;
  listingTitle: string;
  closerName: string;
  kind: DealKind;
  amountMinor: number;
  currency: string;
  /** When the deal was approved: the moment the money went on the record. */
  approvedAt: number;
}

/**
 * Everything recording a sale is refused for, checked the same way on both sides.
 *
 * HERE rather than in the server package, because the sheet has to render the same
 * sentence the API would. A refusal a form cannot predict is a refusal somebody
 * meets after filling in eight fields and attaching a photo.
 */
export function recordSaleRefusal(input: {
  amountMinor: number;
  buyerName: string;
  proof: readonly string[];
  closer: { kind: CloserKind };
  closedOn: number;
  now?: number;
}): string | null {
  if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
    return "Enter what it sold for.";
  }
  if (input.buyerName.trim().length < 2) return "Enter the buyer's name.";
  if (input.proof.length === 0) {
    return "Attach the proof: a receipt, a bank alert or the signed agreement.";
  }
  const now = input.now ?? Date.now();
  // A day's grace, so a timezone difference between a phone and the server is not
  // a refusal somebody cannot explain.
  if (input.closedOn > now + 24 * 60 * 60 * 1000) {
    return "That date is in the future.";
  }
  return null;
}

// TODO(test): a future closedOn beyond the day's grace is refused, today is not.

/** A NUBAN is ten digits and nothing else. */
export function isNuban(value: string): boolean {
  return /^[0-9]{10}$/u.test(value);
}

/** The wording for each share, shared by the settings grid and every refusal. */
export const SHARE_LABEL = {
  level1: "Direct",
  level2: "Upline 1",
  level3: "Upline 2",
  rewardPool: "Reward pool",
  foundation: "Foundation",
} as const satisfies Record<keyof CommissionSplit, string>;

/** The five shares in the order every screen draws them. */
export const SHARE_KEYS = [
  "level1",
  "level2",
  "level3",
  "rewardPool",
  "foundation",
] as const satisfies readonly (keyof CommissionSplit)[];

/**
 * Five shares that cannot pay out more than the deal is worth.
 *
 * The ceiling is on the TOTAL, not on each share, which is the whole change from
 * the three-rate version: with two more shares in the sum, five legal
 * percentages can still add up to more than the deal.
 */
export function splitRefusal(split: CommissionSplit): string | null {
  for (const key of SHARE_KEYS) {
    const rate = split[key];
    const label = SHARE_LABEL[key];
    if (!Number.isFinite(rate)) return `${label} must be a number.`;
    if (rate < 0) return `${label} cannot be negative.`;
    if (rate > 100) return `${label} is more than the whole deal.`;
    if (Math.round(rate * 10) !== rate * 10) {
      return `${label} can have one decimal place at most.`;
    }
  }
  if (splitTotal(split) > 100) {
    return "Those five shares add up to more than the deal is worth.";
  }
  return null;
}

/** Every cell, named, so a settings save says which row is wrong. */
export function matrixRefusal(matrix: CommissionMatrix): string | null {
  for (const ownership of OWNERSHIPS) {
    for (const kind of DEAL_KINDS) {
      const refusal = splitRefusal(matrix[ownership][kind]);
      if (refusal) return `${OWNERSHIP_LABEL[ownership]} ${kind}: ${refusal}`;
    }
  }
  return null;
}

// TODO(test): five shares of 30 each are individually legal and refused together.
// TODO(test): matrixRefusal names the ownership and kind of the offending cell.

/* ══════════════════════════════════════════════════════════════ THE RATING ══ */

/* The weights themselves live up in SETTINGS, beside the rate matrix, because
   that is what they are. What follows is the scoring. */

export const RATING_WEIGHT_LABEL: Record<keyof RatingWeights, string> = {
  value: "Value closed",
  deals: "Deals closed",
  conversion: "Leads won",
  speed: "Speed",
};

/** What one person did in the period, as the rating needs it. */
export interface RatingInput {
  valueMinor: number;
  deals: number;
  /** Leads they handed over that reached a decision, won or lost. */
  leadsDecided: number;
  leadsWon: number;
  /** Median days from lead created to deal closed. 0 when they had none. */
  medianDays: number;
}

/** The best in the period, so a score is relative to a real person, not a guess. */
export interface RatingTops {
  valueMinor: number;
  deals: number;
}

export interface RatingBreakdown {
  value: number;
  deals: number;
  conversion: number;
  speed: number;
  /** The sum of the four above. */
  score: number;
}

/** Thirty days from lead to close scores full marks; ninety scores nothing. */
const SPEED_FLOOR_DAYS = 30;
const SPEED_CEILING_DAYS = 90;

/**
 * A score with its parts, worked out on every read and never stored.
 *
 * The same reasoning as the marketer alerts: a stored score outlives the thing it
 * describes, and the first time it disagrees with the table beside it nobody
 * believes either. The breakdown is returned rather than just the total because a
 * score nobody can take apart is a score nobody accepts.
 *
 * An input a person has no data for scores 0 on that part rather than being
 * excluded from it. Dropping the part and rescaling would quietly reward somebody
 * for handling no leads at all.
 */
export function ratePerson(
  input: RatingInput,
  weights: RatingWeights,
  tops: RatingTops,
): RatingBreakdown {
  const share = (value: number, top: number) => (top > 0 ? Math.min(1, value / top) : 0);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const round = (value: number) => Math.round(value * 10) / 10;

  const parts = {
    value: round(weights.value * share(input.valueMinor, tops.valueMinor)),
    deals: round(weights.deals * share(input.deals, tops.deals)),
    conversion: round(
      input.leadsDecided > 0 ? weights.conversion * (input.leadsWon / input.leadsDecided) : 0,
    ),
    speed: round(
      input.medianDays > 0
        ? weights.speed *
            clamp(
              (SPEED_CEILING_DAYS - input.medianDays) / (SPEED_CEILING_DAYS - SPEED_FLOOR_DAYS),
            )
        : 0,
    ),
  };
  return {
    ...parts,
    score: round(parts.value + parts.deals + parts.conversion + parts.speed),
  };
}

/** The weights total, for the settings screen to show beside the four inputs. */
export function ratingWeightTotal(weights: RatingWeights): number {
  return weights.value + weights.deals + weights.conversion + weights.speed;
}

export function ratingWeightsRefusal(weights: RatingWeights): string | null {
  for (const key of ["value", "deals", "conversion", "speed"] as const) {
    const weight = weights[key];
    if (!Number.isFinite(weight) || weight < 0) {
      return `${RATING_WEIGHT_LABEL[key]} cannot be negative.`;
    }
  }
  if (ratingWeightTotal(weights) <= 0) return "At least one weight has to be above zero.";
  return null;
}

// TODO(test): the period's top performer scores the full value and deals weights.
// TODO(test): somebody with leads and no wins scores 0 on conversion, not excluded.
// TODO(test): score never exceeds ratingWeightTotal.

/* ═══════════════════════════════════════════════════════════════════ LEADS ══ */

/**
 * Somebody a marketer thinks will buy, handed to AV Homes to close.
 *
 * A lead is not a deal and must not become one. A deal records an outcome: one
 * decision, one reason, one reviewer. A lead records a process that moves over
 * months, and the value of the record is the sequence rather than the current
 * value. So the storage here is a timeline, and `state` is only the last event's
 * destination, kept flat so a list query need not read the array.
 */
export const LEAD_STATES = [
  "new",
  "contacted",
  "meeting",
  "viewed",
  "offer",
  "won",
  "lost",
] as const;
export type LeadState = (typeof LEAD_STATES)[number];

/** Plain words on both sides. Nobody is shown the word the database uses. */
export const LEAD_STATE_LABEL: Record<LeadState, string> = {
  new: "Logged",
  contacted: "We called them",
  meeting: "Meeting booked",
  viewed: "They viewed",
  offer: "Talking price",
  won: "Bought",
  lost: "Closed",
};

/** One line for a list row, where the label alone is too terse to act on. */
export const LEAD_STATE_HINT: Record<LeadState, string> = {
  new: "Waiting for AV Homes to reach them",
  contacted: "Someone has spoken to them",
  meeting: "A viewing is on the calendar",
  viewed: "They have seen the property",
  offer: "Terms are being agreed",
  won: "They bought. Your commission is on its way",
  lost: "This one is over",
};

/** Live states, in pipeline order. A lead outside these is finished. */
export const LEAD_OPEN_STATES = ["new", "contacted", "meeting", "viewed", "offer"] as const;

export function isLeadOpen(state: LeadState): boolean {
  return (LEAD_OPEN_STATES as readonly LeadState[]).includes(state);
}

/**
 * The chips offered for each destination.
 *
 * A chip is filterable data and the note beside it is what a human reads months
 * later. Both are required, including when the chip looks self-explanatory:
 * making the note conditional optimises for the tap and throws away the only
 * part with real information in it.
 */
export const LEAD_REASONS: Record<LeadState, readonly string[]> = {
  new: ["Logged by marketer"],
  contacted: ["Reached them", "Left a message", "Wrong number"],
  meeting: ["They picked a date", "We offered dates", "Rescheduled"],
  viewed: ["Inspection done", "They came alone", "Agent showed them"],
  offer: ["They made an offer", "We sent terms", "Negotiating price"],
  won: ["Paid in full", "Deposit taken", "Papers signed"],
  lost: [
    "Went quiet",
    "Bought elsewhere",
    "Price too high",
    "Not ready yet",
    "Wrong details",
    "Other",
  ],
};

export const LEAD_NOTE_MIN = 4;
export const LEAD_NOTE_MAX = 400;

/** One move. Appended, never edited, the discipline the ledger already keeps. */
export interface LeadEvent {
  at: number;
  from: LeadState;
  to: LeadState;
  bySide: "marketer" | "admin";
  byName: string;
  /** The chip they picked. Empty on a note that moved nothing. */
  reason: string;
  /** Their own words. Never empty: that is the point of the feature. */
  note: string;
}

/**
 * One option inside an estate the buyer is interested in.
 *
 * An estate listing is not a house, it is a development with several designs
 * inside it: a 2 bed, a 4 bed, a bare plot. Picking the estate alone tells an
 * admin almost nothing, so a buyer interested in an estate picks which options,
 * plural, because "the 3 bed or the 4 bed depending on price" is what people
 * actually say.
 *
 * The name and price are SNAPSHOTS. A developer renaming a prototype or moving
 * its price next year must not rewrite what a buyer asked about in July.
 */
export interface LeadUnit {
  /** The prototype's own id on the listing. */
  key: string;
  name: string;
  priceMinor: number;
}

export interface Lead {
  id: string;
  buyerName: string;
  buyerPhone: string;
  /** Set when the buyer already has a property in mind. */
  listingId: string | null;
  /** Snapshot, so a renamed listing cannot rewrite a settled lead. */
  listingTitle: string;
  /** Which options inside an estate. Empty for a listing that is one home. */
  wantUnits: LeadUnit[];
  /** What they want when no listing is picked. */
  wantKind: DealKind | null;
  wantArea: string;
  wantBudgetMinor: number;
  currency: string;
  /** What the marketer wrote when they logged it. */
  brief: string;
  reporterId: string;
  reporterName: string;
  reporterCode: string;
  state: LeadState;
  /**
   * The whole history, oldest first. Both sides render this same array: there is
   * no admin-private note, because the moment one exists the marketer's copy
   * stops being the history.
   */
  events: LeadEvent[];
  /** The deal a win minted, or null. Survives a reversal so the thread is readable. */
  dealId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What the app's list draws, with this marketer's share once it is won. */
export interface LeadRow extends Lead {
  myShareMinor: number;
}

/** A marketer may only close their own lead, and only while it is still live. */
export function marketerMayMove(state: LeadState, to: LeadState): boolean {
  return to === "lost" && isLeadOpen(state);
}

/** Everything a state change is refused for, checked the same way on both sides. */
export function leadMoveRefusal(move: {
  from: LeadState;
  to: LeadState;
  reason: string;
  note: string;
}): { path: string; message: string } | null {
  if (move.from === move.to) {
    return { path: "to", message: `This is already ${LEAD_STATE_LABEL[move.to].toLowerCase()}.` };
  }
  if (!(LEAD_REASONS[move.to] ?? []).includes(move.reason)) {
    return { path: "reason", message: "Pick a reason for the change." };
  }
  const note = move.note.trim();
  if (note.length < LEAD_NOTE_MIN) {
    return { path: "note", message: "Say what happened, in your own words." };
  }
  if (note.length > LEAD_NOTE_MAX) {
    return { path: "note", message: `Keep it under ${LEAD_NOTE_MAX} characters.` };
  }
  return null;
}

/** A lead needs a person, and needs to say what that person wants. */
export function leadRefusal(lead: {
  buyerName: string;
  buyerPhone: string;
  listingId: string | null;
  wantArea: string;
  wantBudgetMinor: number;
}): { path: string; message: string } | null {
  if (lead.buyerName.trim() === "") {
    return { path: "buyerName", message: "Who is the buyer?" };
  }
  if (!/^[0-9+\s()-]{7,20}$/u.test(lead.buyerPhone.trim())) {
    return { path: "buyerPhone", message: "Add a phone number we can reach them on." };
  }
  const hasWant = lead.wantArea.trim() !== "" || lead.wantBudgetMinor > 0;
  if (!lead.listingId && !hasWant) {
    return {
      path: "wantArea",
      message: "Pick a property, or say where they want it and roughly their budget.",
    };
  }
  return null;
}

/** "Lekki, about ₦80,000,000" or the listing's own name. For a one line row. */
export function leadWantLine(lead: Lead): string {
  if (lead.listingTitle.trim() !== "") {
    const units = lead.wantUnits ?? [];
    if (units.length === 1) return `${lead.listingTitle} · ${units[0]!.name}`;
    if (units.length > 1) return `${lead.listingTitle} · ${units.length} options`;
    return lead.listingTitle;
  }
  const area = lead.wantArea.trim();
  const budget =
    lead.wantBudgetMinor > 0 ? `about ${formatMoney(lead.wantBudgetMinor, lead.currency)}` : "";
  return [area, budget].filter(Boolean).join(", ") || "No details yet";
}

/* ════════════════════════════════════════════════════ TRANSACTION HISTORY ══ */

/**
 * One row of the marketer's statement.
 *
 * `/m/money` deliberately keeps earnings and payments apart, because merged
 * without labels they read as double counting. The history screen merges them
 * because a statement is what it is, and pays for that by naming every row's
 * kind: "Commission earned" and "Paid to your bank" are two sides of the same
 * naira and a reader must never have to work that out from the amount alone.
 */
export const TX_KINDS = ["earning", "payout", "clawback", "adjustment"] as const;
export type TxKind = (typeof TX_KINDS)[number];

/* Short on purpose. The row already says Money In or Money Out beside this and
   carries a settlement chip under it, and at 360px the longer wording truncated
   mid-word on most rows. */
export const TX_KIND_LABEL: Record<TxKind, string> = {
  earning: "Commission",
  payout: "Paid to your bank",
  clawback: "Taken back",
  adjustment: "Adjustment",
};

/**
 * Whether the money in a row is real yet.
 *
 * Machine readable, because three of these rows look identical if only the
 * amount is drawn, and one of them is money the marketer will never receive.
 * The words shown come from TX_STATE_LABEL; a screen must not switch on them.
 */
export const TX_STATES = ["waiting", "sending", "settled", "cancelled"] as const;
export type TxState = (typeof TX_STATES)[number];

export const TX_STATE_LABEL: Record<TxState, string> = {
  waiting: "Waiting",
  sending: "On the way",
  settled: "Paid",
  cancelled: "Cancelled",
};

export interface Transaction {
  id: string;
  at: number;
  /** Signed, from the marketer's side. Negative is money leaving them. */
  amountMinor: number;
  currency: string;
  kind: TxKind;
  /** The deal, or the month of the pay run. */
  title: string;
  /** Has this money actually arrived, or is it a promise, or is it off? */
  state: TxState;
  /** Plain words for `state`. Never switched on. */
  status: string;
  reference: string;
  dealId: string | null;
  payRunId: string | null;
  /** "Wema Bank 4493", for a payout. Empty otherwise. */
  bankLabel: string;
  /**
   * For an earning already carried by a payout: that payout in words, such as
   * "August 2026". This is the line that stops a statement reading as being
   * paid twice, so it is data rather than something a screen infers.
   */
  carriedBy: string;
  note: string;
}

/** Money In is everything arriving; Money Out is what was taken back. */
export type TxDirection = "in" | "out";

/**
 * Which way a row points, or null when it points nowhere.
 *
 * A cancelled line is the null case and that is the whole reason this function
 * exists. It still carries a positive amount, because it is the record of a
 * commission that WAS awarded, so reading the sign alone puts it under Money In
 * beside real earnings and tells the marketer they have money they do not have.
 * Nothing was taken back either, so it is not Money Out. It is neither.
 */
export function txDirection(tx: { amountMinor: number; state: TxState }): TxDirection | null {
  if (tx.state === "cancelled") return null;
  return tx.amountMinor < 0 ? "out" : "in";
}
