"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { shortDate } from "@/lib/admin/format";
import type { DealRowData } from "@/lib/marketer/api";
import { useMarketer } from "../AppShell";
import { IconDeals, IconListings } from "../icons3d";
import { Amount } from "../money/Amount";
import { Skeleton } from "../ui";
import { DealStatusChip, couldEarn, kindWord, stillOpen } from "./DealStatus";

/**
 * One deal in the list. The house is a rental, the clipboard a sale.
 *
 * The figure is always this marketer's money: what they earned once approved,
 * what they could earn while it is being checked, and nothing for a deal that
 * will never pay. The price of the home is on the deal's own screen.
 */
export function DealListRow({ deal }: { deal: DealRowData }) {
  const { me } = useMarketer();
  const Icon = deal.listingType === "rent" ? IconListings : IconDeals;
  const when = shortDate(deal.closedOn > 0 ? deal.closedOn : deal.createdAt);
  // A level 2 or 3 share means somebody else closed it.
  const closer = deal.myShare && deal.myShare.level > 1 ? deal.reporterName : "";
  const sub = closer
    ? `${kindWord(deal.listingType)} on ${when} by ${closer}`
    : `${kindWord(deal.listingType)} on ${when}`;

  const earned = deal.status === "approved" ? deal.myShare : null;
  const open = stillOpen(deal.status);
  const estimate = open ? couldEarn(deal.amountMinor, deal.listingType, me?.rates) : null;

  return (
    <Link
      href={`/m/deals/${encodeURIComponent(deal.id)}`}
      className="m-press m-press-light flex w-full items-start gap-3 px-4 py-3.5 text-left"
    >
      <span aria-hidden className="-mt-0.5 shrink-0">
        <Icon size={44} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-snug text-m-text">
            {deal.listingTitle}
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-m-faint" aria-hidden />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-m-muted">{sub}</span>
        <span className="mt-2 flex items-end justify-between gap-3">
          <DealStatusChip status={deal.status} />
          {earned ? (
            <Figure caption="you earned" minor={earned.amountMinor} currency={deal.currency} />
          ) : estimate ? (
            <Figure caption="you could earn" minor={estimate.minor} currency={deal.currency} />
          ) : open ? (
            <Skeleton className="h-8 w-20" />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function Figure({ caption, minor, currency }: { caption: string; minor: number; currency: string }) {
  return (
    <span className="min-w-0 shrink-0 text-right">
      <span className="block text-[11.5px] font-medium leading-tight text-m-faint">{caption}</span>
      <span className="mt-1 block text-m-text">
        <Amount minor={minor} currency={currency} size="md" />
      </span>
    </span>
  );
}

/** The row before it arrives, at the height it lands at. */
export function DealListRowSkeleton() {
  return (
    <div aria-hidden className="flex items-start gap-3 px-4 py-3.5">
      <Skeleton className="h-11 w-11" radius="14px" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <div className="mt-3 flex items-end justify-between">
          <Skeleton className="h-6 w-24" radius="999px" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}
