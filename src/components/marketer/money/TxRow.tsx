"use client";

import { ArrowDownLeft, ArrowUpRight, Ban, Clock } from "lucide-react";
import { TX_KIND_LABEL, txDirection, type Transaction } from "@avhomes/contracts";
import { Skeleton } from "../ui";
import { DirectedAmount } from "./Amount";

/**
 * One line of the statement.
 *
 * THE HARD PART IS NOT THE DIRECTION, IT IS WHETHER THE MONEY IS REAL.
 *
 * Three different things want to be on this list: money in the bank, money
 * promised and not yet sent, and money awarded and then taken away when a deal
 * fell through. Drawn as amount plus colour alone, all three are an identical
 * green `+`, and the largest number on the screen can easily be the one the
 * marketer will never receive. So every row states which it is, and a row that
 * is not settled is visibly demoted rather than merely annotated.
 *
 * Direction then gets four signals, not one: the arrow, the words Money In or
 * Money Out, the sign on the amount, and only last the colour. It has to
 * survive greyscale, a dimmed screen in sunlight, and a reader who cannot tell
 * this green from this red.
 */
export function TxRow({ tx, onOpen }: { tx: Transaction; onOpen: (tx: Transaction) => void }) {
  const way = txDirection(tx);
  const dead = way === null;
  const out = way === "out";

  const Icon = dead ? Ban : out ? ArrowUpRight : ArrowDownLeft;
  const disc = dead
    ? "bg-m-raised text-m-faint"
    : out
      ? "bg-(color:--m-out-bg) text-(color:--m-out-fg)"
      : "bg-(color:--m-in-bg) text-(color:--m-in-fg)";

  return (
    <button
      type="button"
      onClick={() => onOpen(tx)}
      className="m-press-light flex w-full items-center gap-3 px-4 py-3.5 text-left"
    >
      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${disc}`}>
        <Icon className="h-5 w-5" strokeWidth={2.4} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] font-semibold ${
            dead ? "text-m-faint line-through" : "text-m-text"
          }`}
        >
          {tx.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-m-muted">
          <span className="truncate">{TX_KIND_LABEL[tx.kind]}</span>
          {!dead && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{out ? "Money Out" : "Money In"}</span>
            </>
          )}
        </span>
        <Settlement tx={tx} />
      </span>

      <span className="shrink-0 text-right">
        {dead ? (
          <span className="block whitespace-nowrap text-[15px] font-semibold text-m-faint line-through">
            <DirectedAmount minor={tx.amountMinor} currency={tx.currency} size="sm" plain />
          </span>
        ) : (
          <DirectedAmount minor={tx.amountMinor} currency={tx.currency} size="sm" />
        )}
        <span className="mt-0.5 block text-[12px] text-m-faint">
          {new Date(tx.at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
        </span>
      </span>
    </button>
  );
}

/**
 * The line that says whether this naira is in the bank.
 *
 * `carriedBy` is the one that stops a statement reading as a double payment:
 * the commission and the payout that carried it are both real rows and both
 * positive, and this names the link in words rather than leaving the reader to
 * work it out from a label.
 */
function Settlement({ tx }: { tx: Transaction }) {
  if (tx.state === "cancelled") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-m-raised px-2 py-0.5 text-[11.5px] font-semibold text-m-faint">
        Cancelled, not paid
      </span>
    );
  }
  if (tx.kind === "payout") return null;

  if (tx.carriedBy !== "") {
    return (
      <span className="mt-1 block truncate text-[11.5px] text-m-faint">
        In the {tx.carriedBy} payout
      </span>
    );
  }

  /* Money going OUT needs the other half of the sentence. "Not paid yet" on a
     clawback reads as though the marketer owes somebody, when what it means is
     that the deduction has not reached a pay run. */
  const out = tx.amountMinor < 0;
  const word = out
    ? tx.state === "sending"
      ? "Off this payment"
      : "Off your next payment"
    : tx.state === "sending"
      ? "On the way"
      : "Not paid yet";

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
        tx.state === "sending"
          ? "bg-(color:--m-heads-bg) text-(color:--m-heads-fg)"
          : "bg-(color:--m-warn-bg) text-(color:--m-warn-fg)"
      }`}
    >
      <Clock className="h-3 w-3" aria-hidden />
      {word}
    </span>
  );
}

export function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-24" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

/** "Mon, Sep 14, 2026", the heading over a day's rows. */
export function dayHeading(at: number, now: number): string {
  const day = new Date(at);
  const today = new Date(now);
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
