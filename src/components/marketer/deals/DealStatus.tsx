"use client";

import {
  DEAL_STATUS_LABEL,
  earningAtRate,
  type CommissionRates,
  type Ownership,
  type DealKind,
  type DealShare,
  type DealStatus,
} from "@avhomes/contracts";
import { Chip, type ChipTone } from "../ui";

/**
 * A deal's state in the alert tones, so "Need more info" is as loud here as it
 * is on home. The shared StatusPill still draws Being checked in amber.
 */
const DEAL_TONE: Record<DealStatus, ChipTone> = {
  pending: "heads-up",
  approved: "good",
  rejected: "bad",
  info: "act",
  cancelled: "neutral",
};

export function DealStatusChip({ status, className = "" }: { status: DealStatus; className?: string }) {
  return (
    <Chip tone={DEAL_TONE[status]} className={className}>
      {DEAL_STATUS_LABEL[status]}
    </Chip>
  );
}

export function kindWord(kind: DealKind): string {
  return kind === "rent" ? "Rented" : "Sold";
}

/** Only a deal still waiting on a decision can still pay. */
export function stillOpen(status: DealStatus): boolean {
  return status === "pending" || status === "info";
}

/**
 * What the reporter's own share would be, from the rates the app was given.
 *
 * Takes the property's OWNERSHIP, because AV Homes pays far less on a house it does
 * not own and quoting the bigger number would be a promise the pay run then breaks.
 * A marketer choosing what to spend a week on has to see the real figure first.
 *
 * The app is handed the resolved rates per class rather than the whole matrix: a
 * phone has no business holding the rate table, and `earningAtRate` rounds exactly
 * as the server does, so the two never quote different numbers for one listing.
 */
export function couldEarn(
  amountMinor: number,
  kind: DealKind,
  rates: AppRates | undefined,
  ownership: Ownership = "av",
): { minor: number; rate: number } | null {
  if (!rates) return null;
  const table =
    ownership === "partner"
      ? kind === "rent"
        ? (rates.partnerRent ?? rates.rent)
        : (rates.partnerSale ?? rates.sale)
      : rates[kind];
  const rate = table[0];
  return { minor: earningAtRate(amountMinor, rate), rate };
}

/**
 * The four rate sets the app is given.
 *
 * The two partner sets are optional so an app build that predates them still reads
 * a response, and it falls back to AV Homes' own rather than to nothing: a missing
 * number would be worse than a slightly generous one, and the server's own figure
 * is what the pay run uses either way.
 */
export interface AppRates {
  sale: CommissionRates;
  rent: CommissionRates;
  partnerSale?: CommissionRates;
  partnerRent?: CommissionRates;
}

/** Where a share came from, in the marketer's own words. */
export function shareSource(share: DealShare): string {
  if (share.level === 1) return "Your own deal";
  if (share.level === 2) return "From somebody you invited";
  return "From their team";
}
