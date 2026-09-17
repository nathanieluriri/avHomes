"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { TX_KIND_LABEL, type Transaction } from "@avhomes/contracts";
import { nowMs } from "@/lib/marketer/api";
import { EyeButton } from "./Amount";
import { Sheet } from "../Sheet";
import { SuccessBurst } from "../SuccessBurst";
import { DirectedAmount } from "./Amount";

/** How recently a payout has to have landed for the burst to still mean something. */
const FRESH_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The receipt for one money event.
 *
 * Short by default: the amount, what it was, when, and where it went. Four
 * lines answer "did I get paid for the Lekki house" and that is what almost
 * every open is. The reference and the ids are real and often needed in a
 * dispute, so they are one tap away under "More info" rather than gone, and
 * rather than making every reader scroll past them.
 *
 * The burst only fires for money that actually landed. Confetti over a clawback
 * would be the app celebrating a marketer losing money.
 */
export function ReceiptSheet({
  tx,
  onClose,
}: {
  tx: Transaction | null;
  onClose: () => void;
}) {
  const [more, setMore] = useState(false);
  const [opened] = useState(() => nowMs());
  /* The burst is for the moment money lands, not for looking one up. Firing it
     every time somebody opens July's receipt in November to check a figure
     turns a celebration into wallpaper, so it only runs for a payout that
     arrived in the last few days. */
  const landed =
    tx !== null && tx.kind === "payout" && tx.state === "settled" && opened - tx.at < FRESH_MS;

  return (
    <Sheet open={tx !== null} onClose={onClose} title={tx ? "Receipt" : ""}>
      {tx && (
        <div className="px-4 pb-2">
          <div className="text-center">
            {landed ? (
              <SuccessBurst size={84} label="Payment received" />
            ) : (
              <div className="h-4" />
            )}
            <p className={landed ? "-mt-6 text-[13px] text-m-muted" : "text-[13px] text-m-muted"}>
              {TX_KIND_LABEL[tx.kind]}
            </p>
            {/* Kobo, unrounded. The list rounds to the naira so it scans; a
                receipt that prints a number which is not the amount is not a
                receipt, and commission lands on odd kobo routinely. */}
            <p className="mt-1 flex items-center justify-center gap-1 text-[30px] font-bold leading-tight">
              <DirectedAmount
                minor={tx.amountMinor}
                currency={tx.currency}
                size="lg"
                kobo
                plain={tx.state === "cancelled"}
              />
              <EyeButton />
            </p>
            <p className="mt-1 text-[15px] text-m-text">{tx.title}</p>
            {tx.state === "cancelled" && (
              <p className="mx-auto mt-2 max-w-[18rem] text-[13.5px] leading-relaxed text-m-muted">
                This deal was cancelled, so the commission was never paid.
              </p>
            )}
            {tx.carriedBy !== "" && (
              <p className="mt-2 text-[13.5px] text-m-muted">
                Paid to you in the {tx.carriedBy} payout
              </p>
            )}
          </div>

          <dl className="mt-6 space-y-0 rounded-[18px] bg-m-raised px-4">
            <Line label="Status" value={tx.status} />
            <Line
              label="Date"
              value={new Date(tx.at).toLocaleString("en-NG", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            />
            {tx.bankLabel !== "" && <Line label="Sent to" value={tx.bankLabel} />}
            {tx.note !== "" && <Line label="Note" value={tx.note} />}
          </dl>

          <button
            type="button"
            onClick={() => setMore((was) => !was)}
            aria-expanded={more}
            className="m-tap m-press-light mt-3 flex w-full items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-[14px] font-semibold text-m-muted"
          >
            {more ? "Less" : "More info"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${more ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {more && (
            <dl className="mt-1 space-y-0 rounded-[18px] bg-m-raised px-4">
              {/* One id, not three. On an earning the reference IS the line id,
                  and showing it twice under two names leaves a reader on a
                  support call guessing which one was asked for. */}
              <Copyable label="Reference" value={tx.reference || tx.id} />
              {tx.payRunId && <Copyable label="Pay run" value={tx.payRunId} />}
              {tx.dealId && <Copyable label="Deal" value={tx.dealId} />}
            </dl>
          )}

          <div className="mt-5 flex gap-2">
            {tx.dealId && (
              <Link
                href={`/m/deals/${tx.dealId}`}
                className="m-btn m-btn--secondary m-tap flex-1 px-4 py-3 text-[15px]"
              >
                Open the deal
              </Link>
            )}
            {tx.payRunId && (
              <Link
                href={`/m/money/${tx.payRunId}`}
                className="m-btn m-btn--secondary m-tap flex-1 px-4 py-3 text-[15px]"
              >
                {tx.kind === "payout" ? "Payment details" : "See the payout"}
              </Link>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-m-line py-3 last:border-0">
      <dt className="shrink-0 text-[13.5px] text-m-muted">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-m-text">{value}</dd>
    </div>
  );
}

/**
 * A long identifier with a copy button.
 *
 * Reading a 32 character reference aloud down a phone line is how a support
 * call goes wrong, so this puts it on the clipboard in one tap and says it
 * worked for two seconds.
 */
function Copyable({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      // A browser that refuses the clipboard is not an error worth a dialog:
      // the value is on screen and can still be read.
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-m-line py-3 last:border-0">
      <dt className="shrink-0 text-[13.5px] text-m-muted">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 break-all text-right font-mono text-[12.5px] text-m-text">
          {value}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={done ? `${label} copied` : `Copy ${label}`}
          className="m-tap grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-m-muted active:bg-m-line"
        >
          {done ? (
            <Check className="h-4 w-4 text-(color:--m-in-fg)" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </button>
      </dd>
    </div>
  );
}
