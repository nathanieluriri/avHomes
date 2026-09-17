/**
 * What the marketers screens share: the shapes the admin endpoints answer
 * with, and the maps that turn an enum into something a person reads.
 *
 * The response envelopes are restated here rather than imported from
 * `@avhomes/marketing`. That package reaches for mongodb the moment it is
 * resolved, so a client bundle cannot have it; the records inside the envelopes
 * come from contracts, which both sides already share.
 */

import type {
  DealStatus,
  LeadState,
  LedgerKind,
  LedgerStatus,
  MarketerBank,
  MarketerStatus,
  PayItemStatus,
  PayRunStatus,
} from "@avhomes/contracts";
import { ApiError } from "./client";
import type { Tone } from "@/components/admin/ui";

/* ═══════════════════════════════════════════════════════════ ENVELOPES ════ */

/** Thousands separators on a plain major-unit string, for a field being read back. */
export function groupDigits(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** Month and year, always. A joined column spans years, so dropping it reads as a typo. */
export function joinedOn(at: number): string {
  return new Date(at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export interface MarketingCounts {
  dealsWaiting: number;
  issuesOpen: number;
  marketersActive: number;
  owedMinor: number;
  /** `2026-09` while this month still needs a pay run, empty once it has one. */
  monthDue: string;
}

/** One month of one marketer's pay history, as the detail screen reads it. */
export interface PayHistoryRow {
  payRunId: string;
  month: string;
  totalMinor: number;
  currency: string;
  status: string;
  paidAt: number | null;
  proof: string[];
  reference: string;
  issueId: string | null;
  bankLabel: string;
}

/** Nearest first, at most two. Empty for the founder account. */
export interface UplineMember {
  id: string;
  name: string;
  code: string;
  status: MarketerStatus;
}

/* ══════════════════════════════════════════════════════════════ WORDING ═══ */

export const DEAL_TONE: Record<DealStatus, Tone> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  info: "wine",
  cancelled: "neutral",
};

/**
 * A lead's state, coloured by what it asks of the reader.
 *
 * `new` is amber because it is the only state with somebody waiting on a call.
 * Everything in flight is wine, which reads as "in hand". Won is green and lost
 * is grey, because a lead that is over needs no attention of any colour.
 */
export const LEAD_TONE: Record<LeadState, Tone> = {
  new: "amber",
  contacted: "wine",
  meeting: "wine",
  viewed: "wine",
  offer: "wine",
  won: "green",
  lost: "neutral",
};

export const MARKETER_TONE: Record<MarketerStatus, Tone> = {
  active: "green",
  paused: "amber",
  banned: "red",
};

/** The admin's wording. A marketer reads "Closed" where this says "Banned". */
export const MARKETER_ADMIN_LABEL: Record<MarketerStatus, string> = {
  active: "Active",
  paused: "Paused",
  banned: "Banned",
};

export const PAY_ITEM_LABEL: Record<PayItemStatus, string> = {
  pending: "Not sent",
  paid: "Paid",
  held: "On hold",
};

export const PAY_ITEM_TONE: Record<PayItemStatus, Tone> = {
  pending: "amber",
  paid: "green",
  held: "red",
};

export const PAY_RUN_LABEL: Record<PayRunStatus, string> = {
  draft: "Not started",
  paying: "Paying",
  closed: "Closed",
};

export const PAY_RUN_TONE: Record<PayRunStatus, Tone> = {
  draft: "amber",
  paying: "wine",
  closed: "green",
};

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  earn: "Earned",
  clawback: "Taken back",
  adjust: "Adjustment",
};

export const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  earned: "Waiting",
  scheduled: "In a pay list",
  paid: "Paid",
  void: "Cancelled",
};

export const LEDGER_TONE: Record<LedgerStatus, Tone> = {
  earned: "amber",
  scheduled: "wine",
  paid: "green",
  void: "neutral",
};

/** "GTBank 0123456789", or a sentence saying there is nothing to pay into. */
export function bankLine(bank: MarketerBank | null): string {
  if (!bank) return "No bank account yet";
  return `${bank.bankName} ${bank.accountNumber}`;
}

/* ══════════════════════════════════════════════════════════════ HELPERS ═══ */

/** Every screen here catches the same type, whatever `fetch` actually threw. */
export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

/** RFC 4180 quoting, and a leading quote on anything a spreadsheet would run. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/gu, '""')}"`;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Hands the browser a file built in the tab.
 *
 * A Blob URL rather than an API route, because the rows are already on screen
 * and a second server read to print what the reader is looking at can disagree
 * with it. Revoked on the next frame: revoking synchronously races the download
 * in Safari, and never revoking holds the whole file in memory for the life of
 * the tab.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
