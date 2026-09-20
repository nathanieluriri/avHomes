"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChartNoAxesColumn } from "lucide-react";
import {
  OWNERSHIPS,
  OWNERSHIP_LABEL,
  formatMoney,
  trendOf,
  type AnalyticsOverview,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { MiniChart, type ChartPoint } from "@/components/admin/MiniChart";
import { PeriodPicker, periodFromParams } from "@/components/admin/PeriodPicker";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import { Card, CardHead, ErrorNote, EmptyState, Skeleton } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/ui";

/**
 * What did the business do this period.
 *
 * ONE question, four tiles, and the chart opens on request. Everything else on the
 * screen answers a follow-up to that question rather than asking a new one: where
 * the value came from, and what is sitting in the two funds.
 */
export default function AnalyticsOverviewPage() {
  const params = useSearchParams();
  const period = periodFromParams(params);
  const [chartOpen, setChartOpen] = useState(false);

  const state = useAsync(
    (signal) =>
      api.get<AnalyticsOverview>(`/admin/analytics/overview?period=${period}`, signal),
    [period],
    { keepPrevious: true },
  );

  const data = state.data;
  const money = data?.money ?? null;
  const currency = money?.currency ?? "NGN";
  const scope = data?.period.label.toLowerCase() ?? "";

  const series: ChartPoint[] =
    money?.series.map((point) => ({
      label: point.day,
      value: point.valueMinor,
      detail: `${formatMoney(point.valueMinor, currency)} · ${point.deals} ${
        point.deals === 1 ? "deal" : "deals"
      }`,
    })) ?? [];

  return (
    <>
      <PageHeader
        icon={ChartNoAxesColumn}
        title="Analytics"
        subtitle="What the business did, and where the money went."
        actions={<PeriodPicker current={period} />}
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {state.loading && !data ? (
        <StatRow>
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </StatRow>
      ) : money ? (
        <>
          {/*
            FOUR TILES, which is the ceiling. The two the owner asks about first
            are value and what AV Homes kept; commission and the deal count explain
            the gap between them.
          */}
          <StatRow>
            <StatTile
              label="Transacted"
              value={formatMoney(money.valueMinor, currency)}
              scope={scope}
              trend={trendOf(money.valueMinor, money.previousValueMinor)}
              onClick={() => setChartOpen((was) => !was)}
              expanded={chartOpen}
              controls="value-chart"
            />
            <StatTile
              label="Deals"
              value={String(money.deals)}
              scope={scope}
              trend={trendOf(money.deals, money.previousDeals)}
            />
            <StatTile
              label="Commission out"
              value={formatMoney(money.commissionMinor, currency)}
              scope="paid to people"
              tone="quiet"
            />
            <StatTile
              label="AV Homes kept"
              value={formatMoney(money.keptMinor, currency)}
              scope="after every share"
              tone="quiet"
            />
          </StatRow>

          {/* On request, never both open at once with the row below. */}
          {chartOpen && (
            <Card className="mb-4" spotlight="analytics-value-chart">
              <CardHead title="Value transacted, by day" />
              <div id="value-chart">
                <MiniChart
                  points={series}
                  mode="bars"
                  label={`Value transacted per day over the ${scope}`}
                />
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHead title="Whose property it was" />
              {money.deals === 0 ? (
                <p className="text-[13px] text-slate-600">No deals in this window.</p>
              ) : (
                <dl className="space-y-2">
                  {OWNERSHIPS.map((ownership) => {
                    const row = money.byOwnership[ownership];
                    const share =
                      money.valueMinor > 0
                        ? Math.round((row.valueMinor / money.valueMinor) * 100)
                        : 0;
                    return (
                      <div key={ownership} className="flex items-baseline justify-between gap-3">
                        <dt className="text-[13px] text-plum-950">
                          {OWNERSHIP_LABEL[ownership]}
                          <span className="ml-1.5 text-[12px] text-slate-550">
                            {row.deals} {row.deals === 1 ? "deal" : "deals"}
                          </span>
                        </dt>
                        <dd className="c-num shrink-0 text-[13px] font-medium text-plum-950">
                          {formatMoney(row.valueMinor, currency)}
                          <span className="ml-1.5 text-[12px] font-normal text-slate-550">
                            {share}%
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                AV Homes earns far more on its own stock, which is why the two are
                priced separately.
              </p>
            </Card>

            {data?.funds && (
              <Card>
                <CardHead title="The two funds" />
                <dl className="space-y-3">
                  {data.funds.map((fund) => (
                    <div key={fund.fund}>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[13px] font-medium text-plum-950">{fund.name}</dt>
                        <dd className="c-num shrink-0 text-[13px] font-semibold text-plum-950">
                          {formatMoney(fund.balanceMinor, fund.currency)}
                        </dd>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-550">
                        {formatMoney(fund.accruedMinor, fund.currency)} in,{" "}
                        {formatMoney(fund.paidMinor, fund.currency)} out
                      </p>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                  Every recorded deal puts a share into each, whoever closed it.
                </p>
              </Card>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          title="No money figures for this account"
          hint="Your role reads the traffic numbers. Ask an owner if you need the money side."
        />
      )}

      {data && (
        <Card className="mt-4">
          <CardHead title="The listings behind it" />
          <dl className="grid grid-cols-3 gap-3">
            <Figure label="Live now" value={String(data.listings.live)} />
            <Figure label="Waiting for review" value={String(data.listings.submitted)} />
            <Figure label="Closed" value={String(data.listings.closedInPeriod)} scope={scope} />
          </dl>
        </Card>
      )}
    </>
  );
}

function Figure({ label, value, scope }: { label: string; value: string; scope?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="c-num mt-0.5 text-[17px] font-semibold text-plum-950">{value}</dd>
      {scope && <p className="text-[11px] text-slate-550">{scope}</p>}
    </div>
  );
}
