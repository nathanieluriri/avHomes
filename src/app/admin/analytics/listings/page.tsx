"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import {
  FUNNEL_SORTS,
  formatMoney,
  statusLabel,
  type FunnelSort,
  type ListingFunnelPage,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { OwnershipBadge } from "@/components/admin/OwnershipBadge";
import { PeriodPicker, periodFromParams } from "@/components/admin/PeriodPicker";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from "@/components/admin/ui";

const SORT_LABEL: Record<FunnelSort, string> = {
  views: "Most looked at",
  enquiries: "Most enquiries",
  leads: "Most buyers logged",
  days: "Longest on the market",
  price: "Most expensive",
};

/**
 * Which listings work and which are ignored.
 *
 * THE PAGE EXISTS FOR ONE ROW: high views, zero enquiries. That listing is being
 * seen and is not landing, which is the most actionable thing in this whole
 * section, so it has its own filter and its own tile rather than being something a
 * reader has to spot by scanning two columns.
 */
export default function ListingFunnelPageScreen() {
  const params = useSearchParams();
  const period = periodFromParams(params);
  const [sort, setSort] = useState<FunnelSort>("views");
  const [ignoredOnly, setIgnoredOnly] = useState(false);

  const state = useAsync(
    (signal) =>
      api.get<ListingFunnelPage>(
        `/admin/analytics/listings?period=${period}&sort=${sort}`,
        signal,
      ),
    [period, sort],
    { keepPrevious: true },
  );

  const data = state.data;
  const scope = data?.period.label.toLowerCase() ?? "";
  const rows = (data?.rows ?? []).filter(
    (row) => !ignoredOnly || (row.views > 0 && row.enquiries === 0),
  );

  const totals = (data?.rows ?? []).reduce(
    (sum, row) => ({
      views: sum.views + row.views,
      enquiries: sum.enquiries + row.enquiries,
      leads: sum.leads + row.leads,
    }),
    { views: 0, enquiries: 0, leads: 0 },
  );

  return (
    <>
      <PageHeader
        icon={Eye}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="Listings"
        subtitle="What gets looked at, and what turns into a conversation."
        actions={<PeriodPicker current={period} />}
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      <StatRow>
        <StatTile label="Views" value={String(totals.views)} scope={scope} />
        <StatTile label="Enquiries" value={String(totals.enquiries)} scope={scope} />
        <StatTile label="Buyers logged" value={String(totals.leads)} scope={scope} tone="quiet" />
        {/* The headline of the page, and it is a button: tapping it filters to
            exactly the rows it counts, which is the action the number implies. */}
        <StatTile
          label="Seen, never asked about"
          value={data ? String(data.ignored) : "-"}
          scope={ignoredOnly ? "showing only these" : "tap to see them"}
          onClick={() => setIgnoredOnly((was) => !was)}
          expanded={ignoredOnly}
        />
      </StatRow>

      <Card className="mb-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Order by
          </span>
          <select
            className="h-9 rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-plum-950"
            value={sort}
            onChange={(event) => setSort(event.target.value as FunnelSort)}
          >
            {FUNNEL_SORTS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {state.loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={ignoredOnly ? "Nothing is being ignored" : "No listings yet"}
          hint={
            ignoredOnly
              ? "Every listing that was looked at in this window got at least one enquiry."
              : "Publish a listing and its numbers appear here."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.listingId}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Link
                  href={`/admin/properties/${row.listingId}`}
                  className="min-w-0 text-[13px] font-semibold text-plum-950 hover:underline"
                >
                  {row.title}
                </Link>
                <OwnershipBadge ownership={row.ownership} />
                <span className="text-[11px] text-slate-550">{statusLabel(row.status)}</span>
                <span className="c-num ml-auto shrink-0 text-[13px] font-medium text-plum-950">
                  {formatMoney(row.priceMinor, row.currency)}
                </span>
              </div>

              {/*
                THE FUNNEL AS A ROW OF FOUR, in order, so the drop-off is read by
                looking left to right rather than by comparing two columns in a
                table. Each step names itself, because "1,204 · 3 · 1 · 0" means
                nothing on its own.
              */}
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Step label="Looked at" value={row.views} note={`${row.sessions} visits`} />
                <Step label="Enquiries" value={row.enquiries} />
                <Step label="Buyers logged" value={row.leads} />
                <Step
                  label="Sold"
                  value={row.soldMinor === null ? 0 : 1}
                  note={
                    row.soldMinor === null
                      ? undefined
                      : formatMoney(row.soldMinor, row.currency)
                  }
                />
              </dl>

              {row.views > 0 && row.enquiries === 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">
                  Seen {row.views} {row.views === 1 ? "time" : "times"} and nobody has asked
                  about it. Worth a look at the price or the photos.
                </p>
              )}

              {row.daysOnMarket !== null && (
                <p className="mt-1.5 text-[11px] text-slate-550">
                  {row.daysOnMarket} {row.daysOnMarket === 1 ? "day" : "days"} on the market
                  {row.soldMinor === null ? " so far" : " before it closed"}.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Step({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="c-num text-[15px] font-semibold text-plum-950">
        {value}
        {note && <span className="ml-1.5 text-[11px] font-normal text-slate-550">{note}</span>}
      </dd>
    </div>
  );
}
