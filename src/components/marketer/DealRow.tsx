"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatPhone } from "@avhomes/contracts";
import { shortDate } from "@/lib/admin/format";
import type { DealRowData } from "@/lib/marketer/api";
import { Money, Skeleton, StatusPill } from "./ui";

/**
 * One reported deal.
 *
 * The money on the right is THIS reader's share wherever there is one, not the
 * price of the home. A marketer scanning the list wants to know what they made,
 * and on a team deal the two figures differ by a factor of fifty.
 *
 * A refusal carries the reason inline. Sending somebody to a different screen to
 * find out why their deal was turned down is how a refusal becomes a phone call.
 */
export function DealRow({ deal }: { deal: DealRowData }) {
  const [open, setOpen] = useState(false);

  const share = deal.myShare;
  const kind = deal.listingType === "rent" ? "Rented" : "Sold";
  const when = shortDate(deal.closedOn > 0 ? deal.closedOn : deal.createdAt);
  const refused = deal.status === "rejected" || deal.status === "info";
  const hasDetail = deal.proof.length > 0 || deal.buyerName !== "" || deal.buyerPhone !== "";

  return (
    <div className="m-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        disabled={!hasDetail}
        className="m-press m-press-light flex w-full items-start gap-3 p-4 text-left disabled:pointer-events-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-plum-950">
            {deal.listingTitle}
          </span>
          <span className="mt-1 block truncate text-[13px] text-slate-600">
            {kind} on {when}
            {deal.listingLocation ? ` in ${deal.listingLocation}` : ""}
          </span>
          <span className="mt-2 flex items-center gap-2">
            <StatusPill status={deal.status} />
            {hasDetail && (
              <ChevronDown
                className={`h-4 w-4 text-mist-400 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-plum-950">
            <Money
              minor={share ? share.amountMinor : deal.amountMinor}
              currency={deal.currency}
              size="lg"
            />
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold text-slate-550">
            {share ? "you earned" : "deal"}
          </span>
        </span>
      </button>

      {refused && deal.reason !== "" && (
        <p className="mx-4 mb-4 rounded-[14px] bg-wine-50 px-3.5 py-3 text-[13px] leading-relaxed text-wine-700">
          {deal.reason}
        </p>
      )}

      {open && hasDetail && (
        <div className="border-t border-mist-100 px-4 py-3.5">
          {(deal.buyerName !== "" || deal.buyerPhone !== "") && (
            <p className="text-[13px] text-slate-600">
              Buyer: <span className="font-semibold text-plum-950">{deal.buyerName || "not given"}</span>
              {deal.buyerPhone !== "" && (
                <>
                  {" "}
                  <a href={`tel:${deal.buyerPhone}`} className="m-num font-semibold text-wine-700">
                    {formatPhone(deal.buyerPhone)}
                  </a>
                </>
              )}
            </p>
          )}
          {deal.proof.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {deal.proof.map((url) => (
                <span
                  key={url}
                  className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-mist-100"
                >
                  <Image src={url} alt="Proof you sent" fill sizes="64px" className="object-cover" />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The same row before it arrives, at the height it will land at. */
export function DealRowSkeleton() {
  return (
    <div className="m-card flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <Skeleton className="mt-3 h-6 w-24" radius="999px" />
      </div>
      <div className="shrink-0">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="ml-auto mt-2 h-3 w-16" />
      </div>
    </div>
  );
}
