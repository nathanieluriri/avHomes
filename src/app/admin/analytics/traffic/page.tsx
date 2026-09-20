"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { trendOf, type TrafficReport } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { MiniChart, type ChartPoint } from "@/components/admin/MiniChart";
import { PeriodPicker, periodFromParams } from "@/components/admin/PeriodPicker";
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
 * Who is visiting the site.
 *
 * The scope sentence from `PulseStrip` is repeated here VERBATIM rather than
 * paraphrased. These are sessions from visitors who accepted analytics cookies over
 * a fixed 30 day window, and two screens describing that differently is how one of
 * them becomes wrong.
 *
 * The period picker narrows the per-listing table below, not the site figures: the
 * beacon keeps a 30 day window of its own and pretending otherwise would be the
 * exact mislabelling this section exists to avoid. The tiles say which is which.
 */
export default function TrafficPage() {
  const params = useSearchParams();
  const period = periodFromParams(params);
  const [chartOpen, setChartOpen] = useState(false);

  const state = useAsync(
    (signal) => api.get<TrafficReport>(`/admin/analytics/traffic?period=${period}`, signal),
    [period],
    { keepPrevious: true },
  );

  const data = state.data;
  const pulse = data?.pulse;
  const scope = data?.period.label.toLowerCase() ?? "";

  const series: ChartPoint[] =
    pulse?.series.map((point) => ({
      label: point.day,
      value: point.sessions,
      detail: `${point.sessions} ${point.sessions === 1 ? "session" : "sessions"}`,
    })) ?? [];

  return (
    <>
      <PageHeader
        icon={Activity}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="Traffic"
        subtitle="Who is on the site, and which listings they are looking at."
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
        </StatRow>
      ) : pulse ? (
        <>
          <StatRow>
            <StatTile
              label="Sessions"
              value={pulse.sessions.toLocaleString("en-GB")}
              /* FIXED at 30 days, and it says so, because that is what the beacon
                 keeps regardless of the picker above. */
              scope="last 30 days"
              trend={trendOf(pulse.sessions, pulse.previousSessions || null)}
              onClick={() => setChartOpen((was) => !was)}
              expanded={chartOpen}
              controls="sessions-chart"
            />
            <StatTile
              label="Page views"
              value={pulse.views.toLocaleString("en-GB")}
              scope="last 30 days"
              tone="quiet"
            />
            <StatTile
              label="Live now"
              value={String(pulse.live)}
              scope="tabs in the last 5 minutes"
              tone="quiet"
            />
          </StatRow>

          {chartOpen && (
            <Card className="mb-4">
              <CardHead title="Sessions over time" />
              <div id="sessions-chart">
                <MiniChart
                  points={series}
                  mode="line"
                  label="Sessions per day over the last 30 days"
                />
              </div>
            </Card>
          )}

          <Card className="mb-4">
            {/* Verbatim from PulseStrip. One wording, in two places, on purpose. */}
            <p className="text-[12px] leading-relaxed text-slate-600">
              The last 30 days, counted from visitors who accepted analytics
              cookies. A session is one browser tab. Live is the tabs that beaconed
              in the last five minutes, and a tab stops counting five minutes after
              its last page view.
            </p>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHead title="Most looked at listings" />
        <p className="-mt-2 mb-3 text-[12px] text-slate-550">{scope}</p>
        {data && data.top.length > 0 ? (
          <ol className="space-y-1.5">
            {data.top.map((row, index) => (
              <li key={row.listingId} className="flex items-baseline gap-2">
                <span className="c-num w-5 shrink-0 text-[12px] font-semibold text-slate-550">
                  {index + 1}
                </span>
                <Link
                  href={`/admin/properties/${row.listingId}`}
                  className="min-w-0 text-[13px] text-plum-950 hover:underline"
                >
                  {row.title}
                </Link>
                <span className="c-num ml-auto shrink-0 text-[13px] font-medium text-plum-950">
                  {row.views}
                  <span className="ml-1 text-[11px] font-normal text-slate-550">
                    views · {row.sessions} visits
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No listing views yet"
            hint="Counting starts when a visitor accepts analytics cookies on a listing page."
            bare
          />
        )}
      </Card>
    </>
  );
}
