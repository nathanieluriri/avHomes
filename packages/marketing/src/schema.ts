/**
 * What marketing stores, and how a stored row becomes the wire shape.
 *
 * Every id is a prefixed string and every time is epoch milliseconds, like the
 * rest of this system. Money is an integer in minor units with its currency
 * beside it, which is the one rule that cannot bend here: this package is the
 * only place in the app that decides what somebody is owed.
 */

import type {
  Deal,
  DealKind,
  DealShare,
  DealStatus,
  IssueMessage,
  IssueStatus,
  Lead,
  LeadEvent,
  LeadState,
  LeadUnit,
  LedgerKind,
  LedgerLine,
  LedgerStatus,
  Marketer,
  MarketerBank,
  MarketerStatus,
  MarketingUpdate,
  MarketingUpdateStatus,
  MarketingUpdateTone,
  PayIssue,
  PayItemStatus,
  PayRun,
  PayRunItem,
  PayRunStatus,
} from "@avhomes/contracts";

export interface MarketerDoc {
  _id: string;
  userId: string;
  code: string;
  seq: number;
  displayName: string;
  email: string;
  phone: string;
  state: string;
  status: MarketerStatus;
  statusReason: string;
  statusAt: number | null;
  parentId: string | null;
  /** Nearest referrer first, at most two. */
  upline: string[];
  bank: MarketerBank | null;
  isAdmin: boolean;
  joinedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface DealDoc {
  _id: string;
  listingId: string;
  listingTitle: string;
  listingLocation: string;
  listingEstate: string;
  listingType: DealKind;
  unitKey: string;
  amountMinor: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  proof: string[];
  note: string;
  reporterId: string;
  reporterName: string;
  reporterCode: string;
  leadId: string | null;
  status: DealStatus;
  reason: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: number | null;
  closedOn: number;
  shares: DealShare[];
  createdAt: number;
  updatedAt: number;
}

export interface LedgerDoc {
  _id: string;
  marketerId: string;
  dealId: string | null;
  level: 0 | 1 | 2 | 3;
  kind: LedgerKind;
  amountMinor: number;
  currency: string;
  status: LedgerStatus;
  payRunId: string | null;
  reversesId: string | null;
  note: string;
  dealTitle: string;
  createdAt: number;
  updatedAt: number;
}

export interface PayRunItemDoc {
  marketerId: string;
  code: string;
  displayName: string;
  totalMinor: number;
  bank: MarketerBank | null;
  status: PayItemStatus;
  proof: string[];
  reference: string;
  paidAt: number | null;
  paidByName: string;
  issueId: string | null;
  note: string;
}

export interface PayRunDoc {
  _id: string;
  month: string;
  status: PayRunStatus;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  items: PayRunItemDoc[];
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface IssueDoc {
  _id: string;
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

/**
 * A potential buyer a marketer handed over.
 *
 * `events` is the record; `state` is only the last event's destination, kept
 * flat so the queue index need not reach into the array.
 */
export interface LeadDoc {
  _id: string;
  buyerName: string;
  buyerPhone: string;
  listingId: string | null;
  listingTitle: string;
  wantUnits: LeadUnit[];
  wantKind: DealKind | null;
  wantArea: string;
  wantBudgetMinor: number;
  currency: string;
  brief: string;
  reporterId: string;
  reporterName: string;
  reporterCode: string;
  state: LeadState;
  events: LeadEvent[];
  dealId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Only what an admin wrote. Listing cards are made at read time and never stored. */
export interface UpdateDoc {
  _id: string;
  title: string;
  body: string;
  imageUrl: string;
  linkLabel: string;
  linkHref: string;
  tone: MarketingUpdateTone;
  pinned: boolean;
  status: MarketingUpdateStatus;
  startsAt: number;
  endsAt: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

/* ═════════════════════════════════════════════════════════════════ MAPPERS ══ */

export function toMarketer(doc: MarketerDoc): Marketer {
  return {
    id: doc._id,
    userId: doc.userId,
    code: doc.code,
    displayName: doc.displayName ?? "",
    email: doc.email ?? "",
    phone: doc.phone ?? "",
    state: doc.state ?? "",
    status: doc.status,
    statusReason: doc.statusReason ?? "",
    parentId: doc.parentId ?? null,
    upline: doc.upline ?? [],
    bank: doc.bank ?? null,
    isAdmin: doc.isAdmin ?? false,
    joinedAt: doc.joinedAt ?? doc.createdAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toDeal(doc: DealDoc): Deal {
  return {
    id: doc._id,
    listingId: doc.listingId,
    listingTitle: doc.listingTitle ?? "",
    listingType: doc.listingType,
    listingLocation: doc.listingLocation ?? "",
    listingEstate: doc.listingEstate ?? "",
    unitKey: doc.unitKey ?? "",
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    buyerName: doc.buyerName ?? "",
    buyerPhone: doc.buyerPhone ?? "",
    proof: doc.proof ?? [],
    note: doc.note ?? "",
    reporterId: doc.reporterId,
    reporterName: doc.reporterName ?? "",
    reporterCode: doc.reporterCode ?? "",
    leadId: doc.leadId ?? null,
    status: doc.status,
    reason: doc.reason ?? "",
    reviewedBy: doc.reviewedBy ?? "",
    reviewedByName: doc.reviewedByName ?? "",
    reviewedAt: doc.reviewedAt ?? null,
    closedOn: doc.closedOn ?? doc.createdAt,
    shares: doc.shares ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toLedgerLine(doc: LedgerDoc): LedgerLine {
  return {
    id: doc._id,
    marketerId: doc.marketerId,
    dealId: doc.dealId ?? null,
    level: doc.level ?? 0,
    kind: doc.kind,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    status: doc.status,
    payRunId: doc.payRunId ?? null,
    reversesId: doc.reversesId ?? null,
    note: doc.note ?? "",
    dealTitle: doc.dealTitle ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

export function toPayRunItem(item: PayRunItemDoc): PayRunItem {
  return {
    marketerId: item.marketerId,
    code: item.code ?? "",
    displayName: item.displayName ?? "",
    totalMinor: item.totalMinor,
    bank: item.bank ?? null,
    status: item.status,
    proof: item.proof ?? [],
    reference: item.reference ?? "",
    paidAt: item.paidAt ?? null,
    paidByName: item.paidByName ?? "",
    issueId: item.issueId ?? null,
    note: item.note ?? "",
  };
}

export function toPayRun(doc: PayRunDoc): PayRun {
  return {
    id: doc._id,
    month: doc.month,
    status: doc.status,
    currency: doc.currency,
    totalMinor: doc.totalMinor ?? 0,
    paidMinor: doc.paidMinor ?? 0,
    items: (doc.items ?? []).map(toPayRunItem),
    createdByName: doc.createdByName ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    closedAt: doc.closedAt ?? null,
  };
}

export function toPayIssue(doc: IssueDoc): PayIssue {
  return {
    id: doc._id,
    payRunId: doc.payRunId,
    month: doc.month ?? "",
    marketerId: doc.marketerId,
    marketerName: doc.marketerName ?? "",
    code: doc.code ?? "",
    amountMinor: doc.amountMinor ?? 0,
    currency: doc.currency,
    status: doc.status,
    messages: doc.messages ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    resolvedAt: doc.resolvedAt ?? null,
  };
}

export function toLead(doc: LeadDoc): Lead {
  return {
    id: doc._id,
    buyerName: doc.buyerName ?? "",
    buyerPhone: doc.buyerPhone ?? "",
    listingId: doc.listingId ?? null,
    listingTitle: doc.listingTitle ?? "",
    wantUnits: doc.wantUnits ?? [],
    wantKind: doc.wantKind ?? null,
    wantArea: doc.wantArea ?? "",
    wantBudgetMinor: doc.wantBudgetMinor ?? 0,
    currency: doc.currency,
    brief: doc.brief ?? "",
    reporterId: doc.reporterId,
    reporterName: doc.reporterName ?? "",
    reporterCode: doc.reporterCode ?? "",
    state: doc.state,
    events: doc.events ?? [],
    dealId: doc.dealId ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toMarketingUpdate(doc: UpdateDoc): MarketingUpdate {
  return {
    id: doc._id,
    title: doc.title,
    body: doc.body ?? "",
    imageUrl: doc.imageUrl ?? "",
    linkLabel: doc.linkLabel ?? "",
    linkHref: doc.linkHref ?? "",
    tone: doc.tone ?? "wine",
    pinned: doc.pinned ?? false,
    status: doc.status,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt ?? null,
    createdByName: doc.createdByName ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    source: "admin",
  };
}

export type { IssueMessage };
