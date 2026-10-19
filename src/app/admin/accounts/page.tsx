"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Landmark, TriangleAlert } from "lucide-react";
import {
  PAYOUT_FLAG_LABELS,
  PLAN_STATE_LABEL,
  formatMoney,
  fundMonthLabel,
  fundMonthOf,
  type AccountsMonth,
  type AccountsPlan,
  type AccountsSummary,
  type PayoutRecord,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { fullDate, shortDate } from "@/lib/admin/format";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  ErrorNote,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
  type Tone,
} from "@/components/admin/ui";

/**
 * The books for a chosen run of months.
 *
 * Every figure says which date it follows and every block closes: money in is
 * exactly what the partners, the funds and AV Homes took from it, and each
 * balance is its start plus what came in less what went out. The month by month
 * grid holds every column the Excel download does, frozen like its panes.
 */

type Preset = "12m" | "year" | "quarter" | "custom";

function monthsBack(n: number): string {
  const now = new Date();
  return fundMonthOf(new Date(now.getFullYear(), now.getMonth() - n, 1).getTime());
}

function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const to = fundMonthOf(Date.now());
  if (preset === "year") return { from: `${new Date().getFullYear()}-01`, to };
  if (preset === "quarter") return { from: monthsBack(2), to };
  return { from: monthsBack(11), to };
}

const PRESETS: { value: Exclude<Preset, "custom">; label: string }[] = [
  { value: "12m", label: "Last 12 months" },
  { value: "year", label: "This year" },
  { value: "quarter", label: "Last 3 months" },
];

type MonthKey = Exclude<keyof AccountsMonth, "month">;

const GRID: { group: string; columns: { key: MonthKey; label: string; count?: true; balance?: true }[] }[] = [
  {
    group: "Deals",
    columns: [
      { key: "deals", label: "Closed", count: true },
      { key: "agreedMinor", label: "Agreed value" },
      { key: "planAgreedMinor", label: "Of which on plans" },
    ],
  },
  {
    group: "Money received and where it went",
    columns: [
      { key: "moneyInMinor", label: "Money in" },
      { key: "planReceivedMinor", label: "Plan payments" },
      { key: "commissionMinor", label: "Commission" },
      { key: "overridesMinor", label: "Overrides" },
      { key: "fundsMinor", label: "Funds' share" },
      { key: "keptMinor", label: "AV Homes kept" },
    ],
  },
  {
    group: "Partners",
    columns: [
      { key: "earnedMinor", label: "Credited" },
      { key: "clawbackMinor", label: "Clawed back" },
      { key: "paidOutMinor", label: "Paid out" },
    ],
  },
  {
    group: "The two funds",
    columns: [
      { key: "fundInMinor", label: "In" },
      { key: "fundOutMinor", label: "Paid out" },
    ],
  },
  {
    group: "At month end",
    columns: [
      { key: "owedEndMinor", label: "Owed to partners", balance: true },
      { key: "fundsEndMinor", label: "Funds hold", balance: true },
      { key: "dueEndMinor", label: "Due from buyers", balance: true },
    ],
  },
];

function quiet(m: AccountsMonth): boolean {
  return (
    m.deals === 0 &&
    m.moneyInMinor === 0 &&
    m.earnedMinor === 0 &&
    m.clawbackMinor === 0 &&
    m.paidOutMinor === 0 &&
    m.fundInMinor === 0 &&
    m.fundOutMinor === 0
  );
}

async function download(body: { from: string; to: string; format: "xlsx" | "csv" }): Promise<void> {
  const res = await fetch("/api/admin/accounts/export", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "upstream_failed" }));
    throw new ApiError(res.status, error);
  }
  const name = /filename="([^"]+)"/u.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "balance-sheet";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function AccountsPage() {
  const [preset, setPreset] = useState<Preset>("12m");
  const [range, setRange] = useState(() => presetRange("12m"));
  const [exporting, setExporting] = useState<null | "xlsx" | "csv">(null);
  const [exportError, setExportError] = useState<ApiError | null>(null);

  const query = `from=${range.from}&to=${range.to}`;
  const state = useAsync(
    (signal) => api.get<AccountsSummary>(`/admin/accounts?${query}`, signal),
    [query],
    { keepPrevious: true },
  );
  const data = state.data;
  const money = (minor: number) => formatMoney(minor, data?.currency ?? "NGN");
  const scope = data ? `${fundMonthLabel(data.from, "short")} to ${fundMonthLabel(data.to, "short")}` : "";

  async function exportAs(format: "xlsx" | "csv") {
    setExporting(format);
    setExportError(null);
    try {
      await download({ ...range, format });
    } catch (err) {
      setExportError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader
        icon={Landmark}
        title="Balance sheet"
        subtitle="Money in, where it went, what is owed either way, and whether every payout has its proof."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void exportAs("xlsx")} disabled={!data || exporting !== null}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting === "xlsx" ? "Preparing" : "Excel"}
            </Button>
            <Button variant="ghost" onClick={() => void exportAs("csv")} disabled={!data || exporting !== null}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting === "csv" ? "Preparing" : "CSV"}
            </Button>
          </div>
        }
      />

      {exportError && (
        <div className="mb-4">
          <ErrorNote error={exportError} />
        </div>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={preset === p.value}
                onClick={() => {
                  setPreset(p.value);
                  setRange(presetRange(p.value));
                }}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  preset === p.value
                    ? "border-wine-700 bg-wine-700 text-white"
                    : "border-mist-200 text-plum-950 hover:bg-mist-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <input
              type="month"
              aria-label="From"
              className={`${inputClass} min-w-0 flex-1 sm:w-40 sm:flex-none`}
              value={range.from}
              max={range.to}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset("custom");
                setRange((r) => ({ ...r, from: e.target.value }));
              }}
            />
            <span className="shrink-0 text-[12px] text-slate-600">to</span>
            <input
              type="month"
              aria-label="To"
              className={`${inputClass} min-w-0 flex-1 sm:w-40 sm:flex-none`}
              value={range.to}
              min={range.from}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset("custom");
                setRange((r) => ({ ...r, to: e.target.value }));
              }}
            />
          </div>
        </div>
      </Card>

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {data && !data.check.ok && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-900">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          <span>The ledger check found problems: {data.check.problems.join(" ")}</span>
        </div>
      )}

      <StatRow>
        <StatTile label="Money in" value={data ? money(data.totals.moneyInMinor) : "-"} scope={scope} />
        <StatTile label="AV Homes kept" value={data ? money(data.totals.keptMinor) : "-"} scope={scope} />
        <StatTile label="Owed to partners" value={data ? money(data.position.owedMinor) : "-"} scope="today" />
        <StatTile label="Due from buyers" value={data ? money(data.position.dueMinor) : "-"} scope="today, on payment plans" />
      </StatRow>

      <PageColumns aside={data ? <Today data={data} money={money} /> : <Skeleton className="h-80" />}>
        {data ? <Statement data={data} money={money} /> : <Skeleton className="h-[36rem]" />}
      </PageColumns>

      <Card className="mt-4">
        <MonthsSection data={data} money={money} />
      </Card>

      <Card className="mt-4">
        <PlansSection data={data} money={money} />
      </Card>

      <Card className="mt-4">
        <PayoutsSection data={data} money={money} />
      </Card>
    </>
  );
}

type Money = (minor: number) => string;

/* ═════════════════════════════════════════════════════════════ STATEMENT ══ */

function Line({
  label,
  value,
  money,
  kind = "line",
}: {
  label: ReactNode;
  value: number;
  money: Money;
  kind?: "line" | "sub" | "less" | "total";
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${kind === "total" ? "mt-1 border-t-2 border-plum-950 pt-2" : ""}`}>
      <dt
        className={`min-w-0 text-[13px] ${
          kind === "sub" ? "pl-3 text-slate-600" : kind === "total" ? "font-semibold text-plum-950" : "text-slate-700"
        }`}
      >
        {label}
      </dt>
      <dd
        className={`c-num shrink-0 text-right text-[13px] ${
          kind === "less" && value !== 0
            ? "text-red-700"
            : kind === "total"
              ? "font-semibold text-plum-950"
              : kind === "sub"
                ? "text-slate-600"
                : "text-plum-950"
        }`}
      >
        {/* Brackets for a deduction, as the workbook prints it. */}
        {kind === "less" && value !== 0 ? `(${money(value)})` : money(value)}
      </dd>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      {hint && <p className="mt-0.5 text-[11.5px] text-slate-550">{hint}</p>}
      <dl className="mt-1 divide-y divide-mist-100">{children}</dl>
    </section>
  );
}

function Ties({ ok, diff, money }: { ok: boolean; diff: number; money: Money }) {
  return (
    <p className={`mt-2 flex items-center gap-1.5 text-[12px] ${ok ? "text-emerald-700" : "text-red-700"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />}
      {ok ? "Adds up to the money received" : `Does not add up: ${money(diff)} unaccounted for`}
    </p>
  );
}

function Statement({ data, money }: { data: AccountsSummary; money: Money }) {
  const t = data.totals;
  const p = data.partners;
  const b = data.buyers;
  const from = fundMonthLabel(data.from, "short");
  const to = fundMonthLabel(data.to, "short");
  const diff = t.moneyInMinor - t.commissionMinor - t.overridesMinor - t.fundsMinor - t.keptMinor;

  return (
    <Card>
      <CardHead title="Statement" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Block title="Deals and money in" hint="Agreed value by the day each deal closed, as Analytics shows it. Money in by the day it was paid.">
            <Line money={money} label={`Deals closed (${t.deals})`} value={t.agreedMinor} />
            <Line money={money} label="of which on payment plans" value={t.planAgreedMinor} kind="sub" />
            <Line money={money} label="Money received from buyers" value={t.moneyInMinor} />
            <Line money={money} label="of which plan deposits and instalments" value={t.planReceivedMinor} kind="sub" />
          </Block>

          <div>
            <Block title="Where the money received went">
              <Line money={money} label="Commission to the partner who closed it" value={t.commissionMinor} />
              <Line money={money} label="Overrides to their upline" value={t.overridesMinor} />
              <Line money={money} label="The two funds" value={t.fundsMinor} />
              <Line money={money} label="AV Homes kept" value={t.keptMinor} kind="total" />
            </Block>
            <Ties ok={diff === 0} diff={diff} money={money} />
          </div>
        </div>

        <div className="space-y-6">
          <Block title="Owed to partners" hint="Credited when a deal is approved or a plan payment verified.">
            <Line money={money} label={`Start of ${from}`} value={p.startMinor} />
            <Line money={money} label="Credited" value={p.earnedMinor} />
            <Line money={money} label="Less: clawed back" value={p.clawbackMinor} kind="less" />
            <Line money={money} label="Less: paid out" value={p.paidOutMinor} kind="less" />
            <Line money={money} label={`End of ${to}`} value={p.endMinor} kind="total" />
          </Block>

          <Block title="Due from buyers on payment plans">
            <Line money={money} label={`Start of ${from}`} value={b.startMinor} />
            <Line money={money} label="Plans agreed" value={b.newPlansMinor} />
            <Line money={money} label="Less: deposits and instalments received" value={b.receivedMinor} kind="less" />
            <Line money={money} label={`End of ${to}`} value={b.endMinor} kind="total" />
          </Block>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {data.funds.map((fund) => (
              <Block key={fund.fund} title={fund.name}>
                <Line money={money} label={`Start of ${from}`} value={fund.startMinor} />
                <Line money={money} label="Shares in, net" value={fund.inMinor} />
                <Line money={money} label="Less: paid out" value={fund.outMinor} kind="less" />
                <Line money={money} label={`End of ${to}`} value={fund.endMinor} kind="total" />
              </Block>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Today({ data, money }: { data: AccountsSummary; money: Money }) {
  const pos = data.position;
  const row = (label: ReactNode, value: ReactNode, tone?: "warn") => (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="min-w-0 text-[13px] text-slate-700">{label}</dt>
      <dd className={`c-num shrink-0 text-right text-[13px] ${tone === "warn" ? "font-semibold text-red-700" : "text-plum-950"}`}>{value}</dd>
    </div>
  );
  return (
    <Card>
      <CardHead title="Today" />
      <p className="-mt-1 mb-1 text-[11.5px] text-slate-550">As at {fullDate(data.generatedAt)}, whatever period is chosen.</p>
      <dl className="divide-y divide-mist-100">
        {row("Owed to partners", money(pos.owedMinor))}
        {row(<span className="pl-3 text-slate-600">of which on a pay run</span>, money(pos.scheduledMinor))}
        {pos.funds.map((fund) => (
          <div key={fund.fund}>{row(`${fund.name} holds`, money(fund.balanceMinor))}</div>
        ))}
        {row(`Due from buyers on ${pos.plans} ${pos.plans === 1 ? "plan" : "plans"}`, money(pos.dueMinor))}
        {row(<span className="pl-3 text-slate-600">of which overdue</span>, money(pos.overdueMinor), pos.overdueMinor > 0 ? "warn" : undefined)}
        {row("Commission still to come on plans", money(pos.toComeMinor))}
        {row(`Plan payments to verify (${pos.paymentsWaiting})`, money(pos.paymentsWaitingMinor))}
        {row(`Deals waiting to be checked (${pos.dealsWaiting})`, money(pos.dealsWaitingMinor))}
        {row("Ledger check", data.check.ok ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Problems</Badge>)}
      </dl>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════ MONTHS ══ */

function MonthsSection({ data, money }: { data: AccountsSummary | null; money: Money }) {
  const [showQuiet, setShowQuiet] = useState(false);
  if (!data) {
    return (
      <>
        <CardHead title="By month" />
        <Skeleton className="h-64" />
      </>
    );
  }
  const quietCount = data.months.filter(quiet).length;
  const months = [...data.months].filter((m) => showQuiet || !quiet(m)).reverse();
  const cell = (m: AccountsMonth, key: MonthKey, count?: true) => {
    const value = m[key];
    if (count) return value;
    return value === 0 ? <span className="text-slate-400">{money(0)}</span> : money(value);
  };

  return (
    <>
      <CardHead
        title="By month"
        action={
          quietCount > 0 ? (
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-wine-700" checked={showQuiet} onChange={(e) => setShowQuiet(e.target.checked)} />
              Show {quietCount} quiet {quietCount === 1 ? "month" : "months"}
            </label>
          ) : undefined
        }
      />

      {months.length === 0 ? (
        <EmptyState bare title="Nothing moved in this period" hint="No deals, payments or fund movements." />
      ) : (
        <>
          {/* Phones: one card per month with the figures that answer most questions. */}
          <ul className="grid gap-2 sm:grid-cols-2 md:hidden">
            {months.map((m) => (
              <li key={m.month} className="rounded-xl border border-mist-200 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-plum-950">{fundMonthLabel(m.month)}</span>
                  <span className="text-[12px] text-slate-600">
                    {m.deals} {m.deals === 1 ? "deal" : "deals"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                  <Mini label="Money in" value={money(m.moneyInMinor)} />
                  <Mini label="AV Homes kept" value={money(m.keptMinor)} />
                  <Mini label="Commission" value={money(m.commissionMinor)} />
                  <Mini label="Overrides" value={money(m.overridesMinor)} />
                  <Mini label="Paid to partners" value={money(m.paidOutMinor)} />
                  <Mini label="Owed at month end" value={money(m.owedEndMinor)} />
                  <Mini label="Funds' share" value={money(m.fundsMinor)} />
                  <Mini label="Due from buyers" value={money(m.dueEndMinor)} />
                </dl>
              </li>
            ))}
          </ul>

          {/* From md: the sheet itself, every column the Excel has. It scrolls inside its own
              frame with the month column, the header and the totals frozen, so the page never does. */}
          <div className="hidden md:block">
            <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-mist-200">
              <table className="min-w-max border-separate border-spacing-0 text-[12.5px]">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 top-0 z-30 border-b border-r border-white/15 bg-wine-700 px-3 py-2 text-left align-bottom font-semibold text-white"
                    >
                      Month
                    </th>
                    {GRID.map((group) => (
                      <th
                        key={group.group}
                        colSpan={group.columns.length}
                        className="sticky top-0 z-20 h-8 border-b border-l border-white/15 bg-plum-900 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/85"
                      >
                        {group.group}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {GRID.flatMap((group) =>
                      group.columns.map((col, i) => (
                        <th
                          key={col.key}
                          className={`sticky top-8 z-20 border-b border-white/15 bg-wine-700 px-3 py-2 text-right font-semibold text-white ${
                            i === 0 ? "border-l" : ""
                          }`}
                        >
                          {col.label}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, r) => (
                    <tr key={m.month} className={`${r % 2 ? "bg-mist-50/60" : "bg-white"} hover:bg-wine-50/40`}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-mist-200 px-3 py-2 text-left font-medium text-plum-950 ${
                          r % 2 ? "bg-mist-50" : "bg-white"
                        }`}
                      >
                        {fundMonthLabel(m.month, "short")}
                      </th>
                      {GRID.flatMap((group) =>
                        group.columns.map((col, i) => (
                          <td
                            key={col.key}
                            className={`c-num whitespace-nowrap border-b border-mist-200 px-3 py-2 text-right text-plum-950 ${i === 0 ? "border-l" : ""}`}
                          >
                            {cell(m, col.key, col.count)}
                          </td>
                        )),
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th
                      scope="row"
                      className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-t-plum-950 bg-[#f4eef2] px-3 py-2 text-left font-semibold text-plum-950"
                    >
                      Total
                    </th>
                    {GRID.flatMap((group) =>
                      group.columns.map((col, i) => (
                        <td
                          key={col.key}
                          className={`c-num sticky bottom-0 z-20 whitespace-nowrap border-t-2 border-t-plum-950 bg-[#f4eef2] px-3 py-2 text-right font-semibold text-plum-950 ${
                            i === 0 ? "border-l border-l-mist-200" : ""
                          }`}
                        >
                          {col.balance
                            ? ""
                            : col.count
                              ? data.totals.deals
                              : money(data.totals[col.key as keyof AccountsSummary["totals"]])}
                        </td>
                      )),
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-[11.5px] text-slate-550">
              Scroll sideways for every column. Month end balances are not totals, so their total cells are empty.
            </p>
          </div>
        </>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-slate-600">{label}</dt>
      <dd className="c-num font-semibold text-plum-950 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ PLANS ══ */

const PLAN_TONE: Record<AccountsPlan["state"], Tone> = {
  overdue: "red",
  "due-soon": "amber",
  "on-track": "neutral",
  paid: "green",
};

function PlansSection({ data, money }: { data: AccountsSummary | null; money: Money }) {
  return (
    <>
      <CardHead title={`Due from buyers${data ? ` (${data.plans.length})` : ""}`} />
      {!data ? (
        <Skeleton className="h-32" />
      ) : data.plans.length === 0 ? (
        <EmptyState bare title="No payment plans being paid" hint="Plans still owed money show here, overdue first." />
      ) : (
        <ul className="divide-y divide-mist-100">
          {data.plans.map((plan) => {
            const pct = Math.min(100, Math.round((plan.paidMinor / plan.agreedMinor) * 100));
            return (
              <li key={plan.dealId} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/admin/marketers/deals/${plan.dealId}`}
                    className="min-w-0 basis-full text-[13px] font-semibold text-plum-950 underline-offset-2 hover:underline sm:basis-auto sm:flex-1"
                  >
                    <span className="block [overflow-wrap:anywhere] sm:truncate">{plan.property || "Untitled listing"}</span>
                  </Link>
                  <Badge tone={PLAN_TONE[plan.state]}>{PLAN_STATE_LABEL[plan.state]}</Badge>
                  {plan.selfPurchase && <Badge tone="wine">Partner purchase</Badge>}
                </div>
                <p className="mt-0.5 text-[12px] text-slate-600 [overflow-wrap:anywhere]">
                  {plan.buyer || "No buyer name"}
                  {plan.partner ? ` · ${plan.partner}` : ""}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-5">
                  <Mini label="Agreed" value={money(plan.agreedMinor)} />
                  <Mini label="Paid" value={`${money(plan.paidMinor)} (${pct}%)`} />
                  <Mini label="Still due" value={money(plan.dueMinor)} />
                  <Mini label="Overdue" value={money(plan.overdueMinor)} />
                  <Mini
                    label="Next"
                    value={plan.nextDueOn ? `${money(plan.nextMinor)} on ${shortDate(plan.nextDueOn)}` : money(plan.nextMinor)}
                  />
                </dl>
                {plan.pendingMinor > 0 && (
                  <p className="mt-1 text-[12px] text-amber-800">{money(plan.pendingMinor)} logged and waiting to be verified.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ PAYOUTS ══ */

type PayoutFilter = "all" | "flagged" | "pending" | "paid";

function PayoutsSection({ data, money }: { data: AccountsSummary | null; money: Money }) {
  const [filter, setFilter] = useState<PayoutFilter>("all");
  const all = data?.payouts ?? [];
  const counts: Record<PayoutFilter, number> = {
    all: all.length,
    flagged: all.filter((p) => p.flags.length > 0).length,
    pending: all.filter((p) => p.status !== "paid").length,
    paid: all.filter((p) => p.status === "paid").length,
  };
  const shown = all.filter((p) =>
    filter === "all" ? true : filter === "flagged" ? p.flags.length > 0 : filter === "paid" ? p.status === "paid" : p.status !== "paid",
  );
  const chips: { value: PayoutFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "flagged", label: "Flagged" },
    { value: "pending", label: "Not sent" },
    { value: "paid", label: "Paid" },
  ];

  return (
    <>
      <CardHead title="Payouts" />
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Show payouts">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filter === chip.value}
            onClick={() => setFilter(chip.value)}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
              filter === chip.value ? "border-plum-950 bg-plum-950 text-white" : "border-mist-200 text-plum-950 hover:bg-mist-50"
            }`}
          >
            {chip.label} <span className="c-num opacity-70">{counts[chip.value]}</span>
          </button>
        ))}
      </div>
      {!data ? (
        <Skeleton className="h-32" />
      ) : shown.length === 0 ? (
        <EmptyState bare title="No payouts to show" hint="Pay run lines for these months show here." />
      ) : (
        <ul className="divide-y divide-mist-100">
          {shown.map((p) => (
            <PayoutRow key={`${p.runId}-${p.marketerId}`} payout={p} money={money} />
          ))}
        </ul>
      )}
    </>
  );
}

function PayoutRow({ payout: p, money }: { payout: PayoutRecord; money: Money }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 basis-full text-[13px] font-semibold text-plum-950 sm:basis-auto sm:flex-1">
          <span className="block [overflow-wrap:anywhere] sm:truncate">
            {p.displayName} <span className="font-normal text-slate-500">{p.code}</span>
          </span>
        </span>
        <span className="c-num text-[13px] font-semibold text-plum-950 sm:ml-0">{money(p.totalMinor)}</span>
        <Badge tone={p.status === "paid" ? "green" : p.status === "held" ? "amber" : "neutral"}>
          {p.status === "paid" ? "Paid" : p.status === "held" ? "Held" : "Not sent"}
        </Badge>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
        {fundMonthLabel(p.month)}
        {p.bankName ? ` · ${p.bankName} ${p.accountMasked}` : ""}
        {p.accountName ? ` · ${p.accountName}` : ""}
        {p.reference ? ` · Ref ${p.reference}` : ""}
        {p.paidAt !== null ? ` · Marked paid ${shortDate(p.paidAt)}${p.paidByName ? ` by ${p.paidByName}` : ""}` : ""}
      </p>
      {(p.proof.length > 0 || p.flags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.proof.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] font-semibold text-wine-700 underline underline-offset-2"
            >
              Receipt {i + 1}
            </a>
          ))}
          {p.flags.map((flag) => (
            <Badge key={flag} tone={flag === "disputed" || flag === "no-proof" ? "red" : "amber"}>
              {PAYOUT_FLAG_LABELS[flag]}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
}
