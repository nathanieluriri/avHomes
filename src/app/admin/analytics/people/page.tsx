"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import {
  RATING_WEIGHT_LABEL,
  formatMoney,
  ratingWeightTotal,
  type PeoplePage,
  type PersonRow,
  type RatingWeights,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { PeriodPicker, periodFromParams } from "@/components/admin/PeriodPicker";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from "@/components/admin/ui";

/**
 * Who is closing.
 *
 * ONE league: marketers and AV Homes staff in the same table, because the owner's
 * point was that the best closer might be either. Ranked on value closed, which is
 * the number nobody can argue with, and the score sits beside it with its breakdown
 * one tap away.
 *
 * The breakdown is not optional decoration. A score somebody cannot take apart is a
 * score they do not accept, and the first argument about it is the last time anybody
 * trusts the page.
 */
export default function PeopleLeaguePage() {
  const params = useSearchParams();
  const period = periodFromParams(params);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const state = useAsync(
    (signal) => api.get<PeoplePage>(`/admin/analytics/people?period=${period}`, signal),
    [period],
    { keepPrevious: true },
  );

  const data = state.data;
  const rows = data?.rows ?? [];
  const currency = data?.currency ?? "NGN";
  const scope = data?.period.label.toLowerCase() ?? "";
  const top = rows[0];

  return (
    <>
      <PageHeader
        icon={Trophy}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="People"
        subtitle="Who closed what, marketers and AV Homes staff in one table."
        actions={<PeriodPicker current={period} />}
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      <StatRow>
        <StatTile
          label="Top closer"
          value={top?.name || "-"}
          scope={top ? formatMoney(top.valueMinor, currency) : scope}
        />
        <StatTile label="People closing" value={String(rows.length)} scope={scope} />
        <StatTile
          label="Deals"
          value={String(rows.reduce((sum, row) => sum + row.deals, 0))}
          scope={scope}
          tone="quiet"
        />
        <StatTile
          label="Commission paid"
          value={formatMoney(
            rows.reduce((sum, row) => sum + row.earnedMinor, 0),
            currency,
          )}
          scope="from the ledger"
          tone="quiet"
        />
      </StatRow>

      {state.loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nobody has closed anything yet"
          hint="Record a sale and whoever closed it appears here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <PersonCard
              key={`${row.kind}-${row.personId}`}
              row={row}
              currency={currency}
              weights={data?.weights}
              open={openRow === row.personId}
              onToggle={() =>
                setOpenRow((was) => (was === row.personId ? null : row.personId))
              }
            />
          ))}
        </div>
      )}

      {data && (
        <Card className="mt-4">
          <p className="text-[12px] leading-relaxed text-slate-600">
            The score weighs value closed, deals closed, how many logged buyers were
            won and how fast, out of {ratingWeightTotal(data.weights)}. It is for
            reading a person&apos;s shape, not for deciding the prize: the quarterly
            prize goes on value closed alone. Change the weights on the commission
            screen.
          </p>
        </Card>
      )}
    </>
  );
}

function PersonCard({
  row,
  currency,
  weights,
  open,
  onToggle,
}: {
  row: PersonRow;
  currency: string;
  weights: RatingWeights | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="c-num text-[13px] font-semibold text-slate-550">
          {String(row.rating.score)}
        </span>
        <h3 className="min-w-0 text-[13px] font-semibold text-plum-950">{row.name}</h3>
        {/* The word, not just a colour: a chip whose meaning is its hue is a chip
            half the readers cannot read. */}
        <Badge tone={row.kind === "staff" ? "neutral" : "wine"}>
          {row.kind === "staff" ? "AV Homes staff" : row.code || "Marketer"}
        </Badge>
        <span className="c-num ml-auto shrink-0 text-[15px] font-semibold text-plum-950">
          {formatMoney(row.valueMinor, currency)}
        </span>
      </div>

      <p className="mt-0.5 text-[12px] text-slate-600">
        {row.deals} {row.deals === 1 ? "deal" : "deals"}
        {row.kind === "marketer" && (
          <> · earned {formatMoney(row.earnedMinor, currency)}</>
        )}
        {row.leadsDecided > 0 && (
          <>
            {" "}
            · {row.leadsWon} of {row.leadsDecided} logged buyers won
          </>
        )}
      </p>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="c-tap mt-2 text-[12px] font-medium text-wine-700 hover:underline"
      >
        {open ? "Hide the score" : "How this score is made up"}
      </button>

      {open && weights && (
        <dl className="mt-2 space-y-1.5 rounded-xl bg-mist-50 p-3">
          {(Object.keys(weights) as (keyof RatingWeights)[]).map((key) => (
            <div key={key} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-plum-950">
                {RATING_WEIGHT_LABEL[key]}
                <span className="ml-1.5 text-slate-550">out of {weights[key]}</span>
              </dt>
              <dd className="c-num shrink-0 text-[12px] font-medium text-plum-950">
                {row.rating[key]}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-mist-200 pt-1.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-600">Score</dt>
            <dd className="c-num text-[12px] font-semibold text-plum-950">
              {row.rating.score} / {ratingWeightTotal(weights)}
            </dd>
          </div>
          {row.leadsDecided === 0 && (
            <p className="text-[11px] leading-relaxed text-slate-550">
              No logged buyers reached a decision in this window, so the last two
              parts score nothing. That is why the total is lower than the deals
              alone suggest.
            </p>
          )}
        </dl>
      )}
    </Card>
  );
}
