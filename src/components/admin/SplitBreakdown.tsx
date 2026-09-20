"use client";

import { ChevronDown } from "lucide-react";
import { formatMoney, type DealShare, type FundKind, type FundShare } from "@avhomes/contracts";

/**
 * Where one deal's money went: three people, two funds, and what AV Homes kept.
 *
 * ONE COMPONENT, drawn in the record-a-sale sheet and on an expanded transaction
 * row, so the number somebody confirms and the number they read back a month later
 * cannot disagree. Two copies of this arithmetic would eventually be two answers.
 *
 * COLLAPSED BY DEFAULT everywhere. A transaction row shows the amount and who
 * closed it; the five-way split is detail, and five rows of it on every row of a
 * table is the information overload these screens are built to avoid.
 */
export function SplitBreakdown({
  amountMinor,
  currency,
  people,
  funds,
  keptMinor,
  names,
  open,
  onToggle,
  heading = "Where this money goes",
}: {
  amountMinor: number;
  currency: string;
  people: readonly DealShare[];
  funds: readonly FundShare[];
  keptMinor: number;
  /** The renameable fund labels, from settings. */
  names: Record<FundKind, string>;
  open?: boolean;
  onToggle?: () => void;
  heading?: string;
}) {
  const paidOut =
    people.reduce((sum, share) => sum + share.amountMinor, 0) +
    funds.reduce((sum, share) => sum + share.amountMinor, 0);
  const total = paidOut + keptMinor;
  const money = (minor: number) => formatMoney(minor, currency);

  /* Collapsed, it is one line: the whole point of collapsing is that the summary is
     readable on its own. "Commission and shares" rather than "Details", because a
     label that does not say what is behind it makes people open everything. */
  const summary = `${money(paidOut)} out, ${money(keptMinor)} kept`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="c-tap flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-slate-600 transition-colors hover:bg-mist-50"
      >
        <span className="font-medium text-plum-950">{heading}</span>
        <span className="c-num text-slate-550">{summary}</span>
        <ChevronDown aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-550" />
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-mist-50 p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        className="c-tap mb-2 flex w-full items-center gap-2 text-left"
      >
        <span className="text-[12px] font-medium text-plum-950">{heading}</span>
        <ChevronDown
          aria-hidden
          className="ml-auto h-3.5 w-3.5 shrink-0 rotate-180 text-slate-550"
        />
      </button>

      <dl className="space-y-1.5">
        {people.length === 0 && (
          <p className="text-[12px] text-slate-600">
            Nobody earns commission on this one.
          </p>
        )}
        {people.map((share) => (
          <Row
            key={`${share.marketerId}-${share.level}`}
            label={share.marketerName || share.code}
            note={`${LEVEL_WORD[share.level]} · ${share.rate}%`}
            value={money(share.amountMinor)}
          />
        ))}

        {funds.map((share) => (
          <Row
            key={share.fund}
            label={names[share.fund]}
            note={`${share.rate}% of the deal`}
            value={money(share.amountMinor)}
          />
        ))}

        <Row label="AV Homes keeps" note="the rest" value={money(keptMinor)} strong />

        {/*
          The check line. It adds to the deal amount, and a reader can see that it
          does without doing the arithmetic themselves. If it ever disagrees, that is
          a bug worth seeing on screen rather than a number quietly rounding away.
        */}
        <div className="flex items-baseline justify-between border-t border-mist-200 pt-1.5">
          <dt className="text-[11px] uppercase tracking-wide text-slate-600">
            {total === amountMinor ? "Adds up to the sale" : "Does not add up"}
          </dt>
          <dd
            className={`c-num text-[12px] font-semibold ${
              total === amountMinor ? "text-plum-950" : "text-red-600"
            }`}
          >
            {money(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const LEVEL_WORD: Record<1 | 2 | 3, string> = {
  1: "closed it",
  2: "invited them",
  3: "invited that person",
};

function Row({
  label,
  note,
  value,
  strong,
}: {
  label: string;
  note: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-[12px]">
        <span className={strong ? "font-semibold text-plum-950" : "text-plum-950"}>{label}</span>
        <span className="ml-1.5 text-slate-550">{note}</span>
      </dt>
      <dd className="c-num shrink-0 text-[12px] font-medium text-plum-950">{value}</dd>
    </div>
  );
}
