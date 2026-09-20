"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import {
  CLOSER_KINDS,
  CLOSER_KIND_LABEL,
  DEAL_KINDS,
  DEAL_SOURCE_LABEL,
  OWNERSHIPS,
  OWNERSHIP_LABEL,
  formatMoney,
  type CloserKind,
  type DealKind,
  type Ownership,
  type TransactionPage,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { OwnershipBadge } from "@/components/admin/OwnershipBadge";
import { PeriodPicker, periodFromParams } from "@/components/admin/PeriodPicker";
import { SplitBreakdown } from "@/components/admin/SplitBreakdown";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import {
  Card,
  CardHead,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from "@/components/admin/ui";

/**
 * Every recorded transaction, with its split and its proof.
 *
 * ONE question: what did we actually transact. A row shows the amount and who
 * closed it; the five-way split opens per row, because five lines on every row is
 * the overload these screens exist to avoid.
 *
 * Deliberately NOT a DataTable. That component collapses columns into a card on a
 * phone, which is right for a list you scan and wrong for rows that each expand
 * into a definition list: the expanded state would be a card inside a card. So
 * these are cards at every width, which is also what makes the split legible on a
 * 360px screen.
 */
export default function TransactionsPage() {
  const params = useSearchParams();
  const period = periodFromParams(params);

  const [ownership, setOwnership] = useState<Ownership | "">("");
  const [kind, setKind] = useState<DealKind | "">("");
  const [closer, setCloser] = useState<CloserKind | "">("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const query = new URLSearchParams({ period });
  if (ownership) query.set("ownership", ownership);
  if (kind) query.set("kind", kind);
  if (closer) query.set("closer", closer);

  const state = useAsync(
    (signal) =>
      api.get<TransactionPage>(`/admin/analytics/transactions?${query.toString()}`, signal),
    [period, ownership, kind, closer],
    { keepPrevious: true },
  );

  const data = state.data;
  const currency = data?.currency ?? "NGN";
  const scope = data?.period.label.toLowerCase() ?? "";
  const average =
    data && data.totalDeals > 0 ? Math.floor(data.totalValueMinor / data.totalDeals) : 0;

  return (
    <>
      <PageHeader
        icon={Receipt}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="Transactions"
        subtitle="Every deal recorded, with the proof behind it."
        actions={<PeriodPicker current={period} spotlight="tx-period" />}
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {/*
        THREE TILES, and each one is labelled as the PERIOD's figure rather than
        the page's. A total under a filtered list is the number people mistake for
        the answer, so the scope line says which it is.
      */}
      <StatRow>
        <StatTile
          label="Transacted"
          value={data ? formatMoney(data.totalValueMinor, currency) : "-"}
          scope={`${scope}, all filters off`}
        />
        <StatTile label="Deals" value={data ? String(data.totalDeals) : "-"} scope={scope} />
        <StatTile
          label="Average deal"
          value={data ? formatMoney(average, currency) : "-"}
          scope={scope}
          tone="quiet"
        />
      </StatRow>

      {/* Filters in one row above the list, which is where a reader looks. */}
      <Card className="mb-4" spotlight="tx-filters">
        <div className="flex flex-wrap gap-2">
          <Filter
            label="Whose property"
            value={ownership}
            onChange={(next) => setOwnership(next as Ownership | "")}
            options={OWNERSHIPS.map((key) => ({ value: key, label: OWNERSHIP_LABEL[key] }))}
          />
          <Filter
            label="Sale or rent"
            value={kind}
            onChange={(next) => setKind(next as DealKind | "")}
            options={DEAL_KINDS.map((key) => ({
              value: key,
              label: key === "sale" ? "Sale" : "Rent",
            }))}
          />
          <Filter
            label="Who closed it"
            value={closer}
            onChange={(next) => setCloser(next as CloserKind | "")}
            options={CLOSER_KINDS.map((key) => ({ value: key, label: CLOSER_KIND_LABEL[key] }))}
          />
        </div>
      </Card>

      {state.loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <EmptyState
          spotlight="tx-none"
          title="No transactions here"
          hint={
            ownership || kind || closer
              ? "Nothing matched those filters in this window. Try widening the period."
              : "Record a sale from a listing and it lands here."
          }
        />
      ) : (
        <div className="space-y-2">
          {data?.rows.map((row, index) => (
            /* The walkthrough opens the first deal, so only that one is anchored:
               every row carrying the name would put the tour on whichever the
               engine found first, which is the same row but by accident. */
            <Card key={row.dealId} spotlight={index === 0 ? "tx-row" : undefined}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="min-w-0 text-[13px] font-semibold text-plum-950">
                  {row.listingTitle || "A listing"}
                </h3>
                <OwnershipBadge ownership={row.ownership} />
                <span className="c-num ml-auto shrink-0 text-[15px] font-semibold text-plum-950">
                  {formatMoney(row.amountMinor, row.currency)}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {shortDate(row.closedOn)} · {row.kind === "sale" ? "Sold" : "Let"} ·{" "}
                {row.closerKind === "direct"
                  ? "Walk-in, nobody paid"
                  : `${row.closerName || "Somebody"} (${CLOSER_KIND_LABEL[row.closerKind]})`}
                {" · "}
                <span className="text-slate-550">{DEAL_SOURCE_LABEL[row.source]}</span>
              </p>

              <div className="mt-2">
                <SplitBreakdown
                  amountMinor={row.amountMinor}
                  currency={row.currency}
                  people={row.shares}
                  funds={row.fundShares}
                  keptMinor={row.keptMinor}
                  /* From the response, not from a constant here: the labels are
                     renameable and a screen holding its own copy keeps saying the
                     old name. */
                  names={data.fundNames}
                  open={openRow === row.dealId}
                  onToggle={() =>
                    setOpenRow((was) => (was === row.dealId ? null : row.dealId))
                  }
                  spotlight={index === 0 ? "tx-split" : undefined}
                />
              </div>

              {openRow === row.dealId && row.proof.length > 0 && (
                <div className="mt-2">
                  <CardHead title="The proof" />
                  <ul className="flex flex-wrap gap-2">
                    {row.proof.map((url) => (
                      <li key={url}>
                        {/* A link, not an inline image. Proof is a receipt or a
                            bank alert and is read by opening it, and a grid of
                            thumbnails on every expanded row is the overload the
                            collapse exists to prevent. */}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="c-tap inline-flex items-center rounded-lg bg-mist-100 px-2.5 py-1.5 text-[12px] font-medium text-wine-700 hover:bg-mist-200"
                        >
                          Open proof
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      <select
        className="h-9 rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-plum-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* "Any" rather than an empty label, so the off state says what it means. */}
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
