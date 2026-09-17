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
 */

import { DEFAULT_CURRENCY, minorUnitsFor } from "./money";

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
  reporterId: string;
  reporterName: string;
  reporterCode: string;
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

/** Level 1, 2 and 3, as whole or one decimal percents. */
export type CommissionRates = [number, number, number];

export const RENT_BASES = ["upfront", "period"] as const;
export type RentBasis = (typeof RENT_BASES)[number];

export interface MarketingSettings {
  /** Rates for a sale. Level 1 is the person who closed it. */
  saleRates: CommissionRates;
  rentRates: CommissionRates;
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
  updatedAt: number;
}

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  saleRates: [5, 2, 1],
  rentRates: [5, 2, 1],
  rentBasis: "upfront",
  issueWindowDays: 14,
  payCutoffDay: 25,
  requireApproval: false,
  joinOpen: true,
  blockSelfDeals: true,
  minPayoutMinor: 0,
  currency: DEFAULT_CURRENCY,
  supportPhone: "",
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

/**
 * Who earns what on one deal.
 *
 * `chain` is the person who closed it, then their referrer, then theirs. A
 * paused or banned person earns nothing and their share is not handed up the
 * chain: AV Homes keeps it. Rounding is down to the minor unit, because paying
 * a fraction of a kobo is not a thing a bank transfer can do.
 */
export function splitCommission(
  amountMinor: number,
  rates: CommissionRates,
  chain: readonly (ChainMember | null)[],
): SplitLine[] {
  const out: SplitLine[] = [];
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return out;

  for (let i = 0; i < 3; i++) {
    const member = chain[i];
    if (!member || member.status !== "active") continue;
    const rate = rates[i] ?? 0;
    if (rate <= 0) continue;
    const amount = Math.floor((amountMinor * rate) / 100);
    if (amount <= 0) continue;
    out.push({
      marketerId: member.id,
      marketerName: member.name,
      code: member.code,
      level: (i + 1) as 1 | 2 | 3,
      rate,
      amountMinor: amount,
    });
  }
  return out;
}

/** What one marketer would earn on a listing at a given price, for the app. */
export function previewEarning(
  amountMinor: number,
  rates: CommissionRates,
): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  return Math.floor((amountMinor * (rates[0] ?? 0)) / 100);
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

/** A NUBAN is ten digits and nothing else. */
export function isNuban(value: string): boolean {
  return /^[0-9]{10}$/u.test(value);
}

/** Rates must be percentages that cannot pay out more than the deal is worth. */
export function ratesRefusal(rates: readonly number[]): string | null {
  if (rates.length !== 3) return "Three rates are needed: level 1, 2 and 3.";
  for (const rate of rates) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "A rate is between 0 and 100.";
    if (Math.round(rate * 10) !== rate * 10) return "A rate can have one decimal place at most.";
  }
  const total = rates.reduce((sum, rate) => sum + rate, 0);
  if (total > 100) return "The three rates add up to more than the whole deal.";
  return null;
}

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

export interface Lead {
  id: string;
  buyerName: string;
  buyerPhone: string;
  /** Set when the buyer already has a property in mind. */
  listingId: string | null;
  /** Snapshot, so a renamed listing cannot rewrite a settled lead. */
  listingTitle: string;
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
  if (lead.listingTitle.trim() !== "") return lead.listingTitle;
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
