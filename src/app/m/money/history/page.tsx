"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Search, X } from "lucide-react";
import { formatMoney, type Transaction } from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { DateRangeSheet, NO_RANGE, rangeLabel, type DateRange } from "@/components/marketer/DateRangeSheet";
import { IconMoney } from "@/components/marketer/icons3d";
import { ReceiptSheet } from "@/components/marketer/money/ReceiptSheet";
import { TxRow, TxRowSkeleton, dayHeading } from "@/components/marketer/money/TxRow";
import {
  EmptyState,
  ErrorNote,
  RowGroup,
  SectionLabel,
  inputCls,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { StatementResponse } from "@/lib/marketer/api";

/**
 * Every naira that moved, in one list.
 *
 * `/m/money` deliberately keeps earnings and payments apart, because side by
 * side and unlabelled they read as being paid twice. This screen merges them
 * because a statement is what it is, and pays for the merge by naming every
 * row's kind. The two screens are not in conflict: one answers "what am I
 * owed", this one answers "what happened, and when".
 *
 * Filtering is client side. A marketer's whole statement is a few hundred rows
 * at most, and a round trip per filter tap on Lagos mobile data is slower than
 * the filter it is running.
 */

type Direction = "all" | "in" | "out";

const FILTERS: { value: Direction; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "Money In" },
  { value: "out", label: "Money Out" },
];

export default function HistoryPage() {
  const statement = useAsync(
    (signal) => api.get<StatementResponse>("/marketing/statement", signal),
    [],
  );

  const [term, setTerm] = useState("");
  const [direction, setDirection] = useState<Direction>("all");
  const [range, setRange] = useState<DateRange>(NO_RANGE);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);

  const all = useMemo(() => statement.data?.items ?? [], [statement.data]);

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return all.filter((tx) => {
      if (direction === "in" && tx.amountMinor < 0) return false;
      if (direction === "out" && tx.amountMinor >= 0) return false;
      if (range.from !== null && tx.at < range.from) return false;
      if (range.to !== null && tx.at > range.to) return false;
      if (needle === "") return true;
      // The amount is searchable as typed: "3,000" and "3000" both find it.
      const amount = formatMoney(Math.abs(tx.amountMinor), tx.currency).toLowerCase();
      return (
        tx.title.toLowerCase().includes(needle) ||
        tx.status.toLowerCase().includes(needle) ||
        tx.reference.toLowerCase().includes(needle) ||
        amount.includes(needle) ||
        amount.replace(/,/gu, "").includes(needle.replace(/,/gu, ""))
      );
    });
  }, [all, term, direction, range]);

  const days = useMemo(() => groupByDay(shown), [shown]);
  const filtered = term.trim() !== "" || direction !== "all" || range.from !== null || range.to !== null;

  return (
    <AppShell title="Transaction history" hint="Every naira that moved." back="/m/money" tab="Your statement">
      <div className="px-4">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-m-faint"
              aria-hidden
            />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              type="search"
              placeholder="Search by name, amount, reference"
              aria-label="Search your statement"
              className={`${inputCls} pl-11 ${term !== "" ? "pr-11" : ""}`}
            />
            {term !== "" && (
              <button
                type="button"
                onClick={() => setTerm("")}
                aria-label="Clear the search"
                className="m-tap m-tap-abs right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[12px] text-m-muted active:bg-m-raised"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`Filter by date. ${rangeLabel(range)}`}
            className={`m-tap grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[14px] ${
              range.from !== null || range.to !== null
                ? "bg-[#a83550] text-white"
                : "bg-m-raised text-(color:--m-link)"
            }`}
          >
            <CalendarRange className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="mt-3 flex gap-2" role="group" aria-label="Which transactions">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setDirection(filter.value)}
              aria-pressed={direction === filter.value}
              className={`m-tap rounded-full px-4 py-2 text-[13.5px] font-semibold ${
                direction === filter.value
                  ? filter.value === "in"
                    ? "bg-(color:--m-in-bg) text-(color:--m-in-fg)"
                    : filter.value === "out"
                      ? "bg-(color:--m-out-bg) text-(color:--m-out-fg)"
                      : "bg-[#a83550] text-white"
                  : "bg-m-raised text-m-muted active:bg-m-line"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {(range.from !== null || range.to !== null) && (
          <button
            type="button"
            onClick={() => setRange(NO_RANGE)}
            className="m-tap mt-3 inline-flex items-center gap-1.5 rounded-full bg-m-raised px-3 py-1.5 text-[12.5px] font-semibold text-m-text"
          >
            {rangeLabel(range)}
            <X className="h-3.5 w-3.5 text-m-muted" aria-hidden />
          </button>
        )}

        <div className="mt-5">
          {statement.error ? (
            <ErrorNote error={statement.error} onRetry={statement.reload} />
          ) : all.length === 0 && statement.loading ? (
            <RowGroup>
              <TxRowSkeleton />
              <TxRowSkeleton />
              <TxRowSkeleton />
              <TxRowSkeleton />
            </RowGroup>
          ) : shown.length === 0 ? (
            <EmptyState
              art={<IconMoney size={112} />}
              title={filtered ? "Nothing matched" : "No transactions yet"}
              hint={
                filtered
                  ? "Try a different search, or widen the dates."
                  : "Your first commission will show up here the moment a deal is approved."
              }
            />
          ) : (
            <div className="space-y-5">
              {days.map(([day, rows]) => (
                <div key={day}>
                  <SectionLabel>{dayHeading(rows[0]!.at)}</SectionLabel>
                  <RowGroup className="mt-2">
                    {rows.map((tx) => (
                      <TxRow key={tx.id} tx={tx} onOpen={setOpen} />
                    ))}
                  </RowGroup>
                </div>
              ))}
            </div>
          )}
        </div>

        <DateRangeSheet
          open={picking}
          onClose={() => setPicking(false)}
          value={range}
          onApply={setRange}
          earliest={statement.data?.joinedAt}
        />
        <ReceiptSheet tx={open} onClose={() => setOpen(null)} />
      </div>
    </AppShell>
  );
}

/** Rows under the day they happened on, newest day first. */
function groupByDay(rows: readonly Transaction[]): [string, Transaction[]][] {
  const out = new Map<string, Transaction[]>();
  for (const tx of rows) {
    const day = new Date(tx.at);
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(tx);
    else out.set(key, [tx]);
  }
  return [...out.entries()];
}
