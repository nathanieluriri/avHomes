"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Crown, Trophy } from "lucide-react";
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
          <Podium
            rows={rows.slice(0, 3)}
            currency={currency}
            open={openRow}
            onPick={(id) => setOpenRow((was) => (was === id ? null : id))}
          />
          {rows.slice(0, 3).some((row) => row.personId === openRow) && data && (
            <PersonCard
              row={rows.find((row) => row.personId === openRow)!}
              rank={rows.findIndex((row) => row.personId === openRow) + 1}
              currency={currency}
              weights={data.weights}
              open
              onToggle={() => setOpenRow(null)}
            />
          )}
          {rows.slice(3).map((row, index) => (
            <PersonCard
              key={`${row.kind}-${row.personId}`}
              rank={index + 4}
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

const MEDAL = [
  { ring: "ring-amber-300", chip: "bg-amber-300 text-amber-950", bar: "h-24 bg-wine-700" },
  { ring: "ring-slate-300", chip: "bg-slate-300 text-slate-900", bar: "h-16 bg-wine-100" },
  { ring: "ring-orange-300", chip: "bg-orange-300 text-orange-950", bar: "h-12 bg-mist-100" },
] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return `${parts[0]?.[0] ?? "?"}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase();
}

/** The top three, second first third, the order a podium is read in. Tap one for their score. */
function Podium({
  rows,
  currency,
  open,
  onPick,
}: {
  rows: PersonRow[];
  currency: string;
  open: string | null;
  onPick: (id: string) => void;
}) {
  const order = [rows[1], rows[0], rows[2]];
  return (
    <Card className="pb-0">
      <ol className="mx-auto grid max-w-xl grid-cols-3 items-end gap-3 pt-4">
        {order.map((row, slot) => {
          if (!row) return <li key={`gap-${slot}`} />;
          const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
          const medal = MEDAL[rank - 1]!;
          return (
            <li key={row.personId} className="min-w-0">
              <button
                type="button"
                onClick={() => onPick(row.personId)}
                aria-expanded={open === row.personId}
                className="flex w-full flex-col items-center text-center"
              >
                <span className="relative">
                  {rank === 1 && (
                    <Crown className="absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2 fill-amber-300 text-amber-400" aria-hidden />
                  )}
                  <span
                    className={`grid place-items-center rounded-full bg-mist-100 font-semibold text-plum-950 ring-[3px] ${medal.ring} ${
                      rank === 1 ? "h-16 w-16 text-[18px]" : "h-13 w-13 text-[15px]"
                    }`}
                  >
                    {initialsOf(row.name)}
                  </span>
                  <span
                    className={`c-num absolute -bottom-1.5 left-1/2 grid h-5 min-w-5 -translate-x-1/2 place-items-center rounded-full px-1 text-[11px] font-bold ${medal.chip}`}
                  >
                    {rank}
                  </span>
                </span>
                <span className="mt-3 w-full truncate text-[13px] font-semibold text-plum-950">{row.name}</span>
                <span className="c-num text-[13px] font-semibold text-wine-700">{formatMoney(row.valueMinor, currency)}</span>
                <span className="text-[11.5px] text-slate-600">
                  {row.deals} {row.deals === 1 ? "deal" : "deals"}
                </span>
                <span className={`mt-2 w-full rounded-t-xl ${medal.bar}`} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function PersonCard({
  row,
  rank,
  currency,
  weights,
  open,
  onToggle,
}: {
  row: PersonRow;
  rank: number;
  currency: string;
  weights: RatingWeights | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="c-num w-6 text-center text-[14px] font-semibold text-slate-550">{rank}</span>
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist-100 text-[11px] font-semibold text-plum-950"
        >
          {initialsOf(row.name)}
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

      <p className="mt-0.5 pl-[4.375rem] text-[12px] text-slate-600">
        Score {row.rating.score} · {row.deals} {row.deals === 1 ? "deal" : "deals"}
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
        className="c-tap mt-2 pl-[4.375rem] text-[12px] font-medium text-wine-700 hover:underline"
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
