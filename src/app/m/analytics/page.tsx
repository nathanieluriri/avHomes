"use client";

import { useState, type ReactNode } from "react";
import { minorUnitsFor, type InsightMonth, type InsightPeriod, type PartnerInsights } from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { IconChart, IconHandshake, IconInvite, IconMoney } from "@/components/marketer/icons3d";
import {
  Card,
  ErrorNote,
  Money,
  SectionLabel,
  SectionLink,
  Segmented,
  Skeleton,
  moneyParts,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

const PERIODS: readonly { value: InsightPeriod; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

type Series = "earned" | "deals" | "joined";

const SERIES: readonly { value: Series; label: string }[] = [
  { value: "earned", label: "Earnings" },
  { value: "deals", label: "Deals" },
  { value: "joined", label: "Invites" },
];

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<InsightPeriod>("month");
  const read = useAsync(
    (signal) => api.get<PartnerInsights>(`/marketing/insights?period=${period}`, signal),
    [period],
    { keepPrevious: true, cache: "insights" },
  );
  const data = read.data;

  return (
    <AppShell title="My numbers" back="/m" hero={<Hero data={data} />} tab="How you are doing">
      <div className="space-y-6 px-4 pb-6">
        <Segmented value={period} options={PERIODS} onChange={setPeriod} label="Period" />
        {read.error && <ErrorNote error={read.error} onRetry={read.reload} />}
        {!data && !read.error && <BodySkeleton />}
        {data && <Body data={data} />}
      </div>
    </AppShell>
  );
}

function Hero({ data }: { data: PartnerInsights | null }) {
  if (!data) {
    return (
      <div aria-hidden>
        <Skeleton onWine className="mt-4 h-4 w-32" />
        <Skeleton onWine className="mt-3 h-11 w-48" radius="12px" />
      </div>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-[13px] font-medium text-white/80">Earned · {data.period.label.toLowerCase()}</p>
      <Money minor={data.earnings.earnedMinor} currency={data.currency} size="hero" animate className="text-white" />
      {data.earnings.fromTeamMinor > 0 && (
        <p className="mt-1 text-[13px] text-white/80">
          <Money minor={data.earnings.fromTeamMinor} currency={data.currency} size="sm" /> of it from your network
        </p>
      )}
    </div>
  );
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

function Body({ data }: { data: PartnerInsights }) {
  const decided = data.buyers.won + data.buyers.lost;
  return (
    <>
      <section aria-label="At a glance" className="grid grid-cols-2 gap-3">
        <Tile
          icon={<IconInvite size={40} />}
          label="People invited"
          value={String(data.invites.direct)}
          sub={`${data.invites.team} across your network`}
        />
        <Tile
          icon={<IconChart size={40} />}
          label="Deals approved"
          value={String(data.deals.approved)}
          sub={`of ${data.deals.reported} reported`}
        />
        <Tile
          icon={<IconMoney size={40} />}
          label="Sales value"
          value={<Money minor={data.deals.valueMinor} currency={data.currency} size="md" />}
          sub="that you closed"
        />
        <Tile
          icon={<IconHandshake size={40} />}
          label="Buyers won"
          value={String(data.buyers.won)}
          sub={decided > 0 ? `${pct(data.buyers.won, decided)} of decided buyers` : `${data.buyers.logged} logged`}
        />
      </section>

      <Trend months={data.months} currency={data.currency} />

      <section aria-labelledby="deals-split">
        <SectionLabel action={<SectionLink href="/m/deals">Your deals</SectionLink>}>
          <span id="deals-split">Deals you reported</span>
        </SectionLabel>
        <Card>
          <Split
            parts={[
              { label: "Approved", value: data.deals.approved, color: "#3fbf8a" },
              { label: "Waiting", value: data.deals.pending, color: "#f5cf73" },
              { label: "Not approved", value: data.deals.rejected, color: "#ff6b81" },
            ]}
            empty="No deals reported in this period yet."
          />
          {data.deals.teamApproved > 0 && (
            <p className="mt-4 border-t border-m-line pt-3 text-[13px] text-m-muted">
              Your network closed <span className="font-semibold text-m-text">{data.deals.teamApproved}</span>{" "}
              {data.deals.teamApproved === 1 ? "deal" : "deals"} that paid you a share.
            </p>
          )}
        </Card>
      </section>

      <section aria-labelledby="buyers-split">
        <SectionLabel action={<SectionLink href="/m/buyers">Your buyers</SectionLink>}>
          <span id="buyers-split">Buyers you logged</span>
        </SectionLabel>
        <Card>
          <Split
            parts={[
              { label: "Bought", value: data.buyers.won, color: "#3fbf8a" },
              { label: "Still talking", value: data.buyers.open, color: "#cfc4fa" },
              { label: "Did not buy", value: data.buyers.lost, color: "#8b7d82" },
            ]}
            empty="No buyers logged in this period yet."
          />
        </Card>
      </section>

      <section aria-labelledby="network">
        <SectionLabel action={<SectionLink href="/m/team">Your network</SectionLink>}>
          <span id="network">Your network, all time</span>
        </SectionLabel>
        <Card className="grid grid-cols-2 divide-x divide-m-line text-center">
          <div>
            <p className="m-num text-[26px] font-bold text-m-text">{data.invites.directAllTime}</p>
            <p className="text-[12px] text-m-muted">joined on your link</p>
          </div>
          <div>
            <p className="m-num text-[26px] font-bold text-m-text">{data.invites.teamAllTime}</p>
            <p className="text-[12px] text-m-muted">in all three levels</p>
          </div>
        </Card>
      </section>
    </>
  );
}

function Tile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub: string }) {
  return (
    <Card className="flex min-h-[8.5rem] flex-col">
      <span aria-hidden className="-ml-1 -mt-1">
        {icon}
      </span>
      <p className="mt-1 text-[12px] font-medium text-m-muted">{label}</p>
      <p className="m-num mt-0.5 truncate text-[22px] font-bold leading-tight text-m-text">{value}</p>
      <p className="mt-auto pt-1 text-[11.5px] leading-snug text-m-muted">{sub}</p>
    </Card>
  );
}

/** A month by month bar chart, drawn in plain boxes so it costs nothing to ship. */
function Trend({ months, currency }: { months: InsightMonth[]; currency: string }) {
  const [series, setSeries] = useState<Series>("earned");
  const values = months.map((m) => (series === "earned" ? m.earnedMinor : series === "deals" ? m.deals : m.joined));
  const top = Math.max(0, ...values);
  const total = values.reduce((sum, v) => sum + v, 0);

  return (
    <section aria-labelledby="trend">
      <SectionLabel>
        <span id="trend">Month by month</span>
      </SectionLabel>
      <Card>
        <Segmented value={series} options={SERIES} onChange={setSeries} label="Which figure" />
        <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label={`${SERIES.find((s) => s.value === series)?.label} by month`}>
          {months.map((m, index) => {
            const v = values[index] ?? 0;
            const height = top > 0 ? Math.max(4, Math.round((v / top) * 100)) : 4;
            const last = index === months.length - 1;
            return (
              <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="m-num text-[10.5px] font-semibold text-m-muted">
                  {v > 0 ? (series === "earned" ? compactMoney(v, currency) : v) : ""}
                </span>
                <span
                  className={`w-full max-w-9 rounded-t-[8px] ${
                    last
                      ? "bg-[linear-gradient(180deg,#ff8fa3_0%,#c24a6b_100%)]"
                      : v > 0
                        ? "bg-[linear-gradient(180deg,#8a3a53_0%,#5a2336_100%)]"
                        : "bg-m-raised"
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className={`text-[11px] ${last ? "font-semibold text-m-text" : "text-m-muted"}`}>
                  {MONTH.format(new Date(`${m.month}-01T00:00:00Z`))}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 border-t border-m-line pt-3 text-[13px] text-m-muted">
          {months.length} months:{" "}
          <span className="font-semibold text-m-text">
            {series === "earned" ? (
              <Money minor={total} currency={currency} size="sm" />
            ) : series === "deals" ? (
              `${total} ${total === 1 ? "deal" : "deals"} closed`
            ) : (
              `${total} ${total === 1 ? "person" : "people"} joined on your link`
            )}
          </span>
        </p>
      </Card>
    </section>
  );
}

/** "₦1.2m", "₦450k": the bar label has room for four characters. */
function compactMoney(minor: number, currency: string): string {
  const sign = moneyParts(0, currency).sign;
  const whole = minor / minorUnitsFor(currency);
  if (whole >= 1_000_000) return `${sign}${(whole / 1_000_000).toFixed(whole >= 10_000_000 ? 0 : 1)}m`;
  if (whole >= 1_000) return `${sign}${Math.round(whole / 1_000)}k`;
  return `${sign}${Math.round(whole)}`;
}

function Split({ parts, empty }: { parts: { label: string; value: number; color: string }[]; empty: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return <p className="text-[13px] text-m-muted">{empty}</p>;
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-m-raised" aria-hidden>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-[12px] text-m-muted">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              {p.label}
            </dt>
            <dd className="m-num mt-0.5 text-[20px] font-bold text-m-text">
              {p.value}
              <span className="ml-1 text-[12px] font-medium text-m-muted">{pct(p.value, total)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function BodySkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[8.5rem]" radius="22px" />
        <Skeleton className="h-[8.5rem]" radius="22px" />
        <Skeleton className="h-[8.5rem]" radius="22px" />
        <Skeleton className="h-[8.5rem]" radius="22px" />
      </div>
      <Skeleton className="h-64" radius="22px" />
    </div>
  );
}
