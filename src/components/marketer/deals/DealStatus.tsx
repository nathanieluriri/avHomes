"use client";

import {
  DEAL_STATUS_LABEL,
  previewEarning,
  type CommissionRates,
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

/** What the reporter's level 1 share would be, from the rates the app was given. */
export function couldEarn(
  amountMinor: number,
  kind: DealKind,
  rates: { sale: CommissionRates; rent: CommissionRates } | undefined,
): { minor: number; rate: number } | null {
  if (!rates) return null;
  const table = rates[kind];
  return { minor: previewEarning(amountMinor, table), rate: table[0] };
}

/** Where a share came from, in the marketer's own words. */
export function shareSource(share: DealShare): string {
  if (share.level === 1) return "Your own deal";
  if (share.level === 2) return "From somebody you invited";
  return "From their team";
}
