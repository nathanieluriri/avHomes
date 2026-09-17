"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { TX_KIND_LABEL, type Transaction } from "@avhomes/contracts";
import { Skeleton } from "../ui";
import { DirectedAmount } from "./Amount";

/**
 * One line of the statement.
 *
 * Four signals for the direction, which is three more than colour: the arrow,
 * the words "Money In" or "Money Out", the sign on the amount, and the colour.
 * The reference shot for this screen used one colour for everything because
 * every row in it was a debit; ours is genuinely two-directional, so the
 * distinction has to survive greyscale, a dimmed screen in sunlight, and a
 * reader who cannot tell this green from this red.
 */
export function TxRow({ tx, onOpen }: { tx: Transaction; onOpen: (tx: Transaction) => void }) {
  const out = tx.amountMinor < 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(tx)}
      className="m-press-light flex w-full items-center gap-3 px-4 py-3.5 text-left"
    >
      <span
        aria-hidden
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          out
            ? "bg-(color:--m-out-bg) text-(color:--m-out-fg)"
            : "bg-(color:--m-in-bg) text-(color:--m-in-fg)"
        }`}
      >
        {out ? (
          <ArrowUpRight className="h-5 w-5" strokeWidth={2.4} />
        ) : (
          <ArrowDownLeft className="h-5 w-5" strokeWidth={2.4} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">{tx.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-m-muted">
          {TX_KIND_LABEL[tx.kind]}
          {" · "}
          {out ? "Money Out" : "Money In"}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <DirectedAmount minor={tx.amountMinor} currency={tx.currency} size="sm" />
        <span className="mt-0.5 block text-[12px] text-m-faint">
          {new Date(tx.at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
        </span>
      </span>
    </button>
  );
}

export function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

/** "Mon, Sep 14, 2026", the heading over a day's rows. */
export function dayHeading(at: number): string {
  const day = new Date(at);
  const today = new Date();
  const same =
    day.getFullYear() === today.getFullYear() &&
    day.getMonth() === today.getMonth() &&
    day.getDate() === today.getDate();
  if (same) return "Today";
  return day.toLocaleDateString("en-NG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
