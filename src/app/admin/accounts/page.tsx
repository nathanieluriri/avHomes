"use client";

import { useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, Landmark } from "lucide-react";
import {
  PAYOUT_FLAG_LABELS,
  formatMoney,
  fundMonthLabel,
  fundMonthOf,
  type AccountsMonth,
  type AccountsReport,
  type PayoutRecord,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
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
} from "@/components/admin/ui";

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

function hasActivity(m: AccountsMonth): boolean {
  return (
    m.deals > 0 ||
    m.paidOutMinor > 0 ||
    m.clawbackMinor > 0 ||
    m.fundInMinor > 0 ||
    m.fundOutMinor > 0
  );
}

async function download(path: string): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "upstream_failed" }));
    throw new ApiError(res.status, body);
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
  const [showEmpty, setShowEmpty] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv">(null);
  const [exportError, setExportError] = useState<ApiError | null>(null);

  const query = `from=${range.from}&to=${range.to}`;
  const state = useAsync(
    (signal) => api.get<AccountsReport>(`/admin/accounts?${query}`, signal),
    [query],
    { keepPrevious: true },
  );
  const data = state.data;
  const currency = data?.currency ?? "NGN";
  const money = (minor: number) => formatMoney(minor, currency);
  const scope = data ? `${fundMonthLabel(data.from, "short")} to ${fundMonthLabel(data.to, "short")}` : "";

  async function exportAs(format: "xlsx" | "csv") {
    setExporting(format);
    setExportError(null);
    try {
      await download(`/admin/accounts/export?${query}&format=${format}`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setExporting(null);
    }
  }

  const months = data ? data.months.filter((m) => showEmpty || hasActivity(m)).reverse() : [];
  const hidden = data ? data.months.length - data.months.filter(hasActivity).length : 0;
  const payouts = (data?.payouts ?? []).filter((p) => !flaggedOnly || p.flags.length > 0);
  const flagged = (data?.payouts ?? []).filter((p) => p.flags.length > 0).length;

  return (
    <>
      <PageHeader
        icon={Landmark}
        title="Balance sheet"
        subtitle="Money in, what is owed and paid, both funds, and whether every payout has its proof."
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
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
            <span className="text-[12px] text-slate-600">to</span>
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
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-900">
          The ledger check found problems: {data.check.problems.join(" ")}
        </div>
      )}

      <StatRow>
        <StatTile label="Money in" value={data ? money(data.totals.salesMinor) : "-"} scope={scope} />
        <StatTile label="Commission owed" value={data ? money(data.totals.commissionMinor) : "-"} scope={scope} />
        <StatTile label="Commission paid" value={data ? money(data.totals.paidOutMinor) : "-"} scope={scope} />
        <StatTile label="AV Homes kept" value={data ? money(data.totals.keptMinor) : "-"} scope={scope} tone="quiet" />
      </StatRow>

      <PageColumns
        aside={
          <Card>
            <CardHead title="Where things stand today" />
            {!data ? (
              <Skeleton className="h-40" />
            ) : (
              <dl className="divide-y divide-mist-100">
                <Line label="Commission owed" value={money(data.position.commissionOwedMinor)} strong />
                <Line label="Of which on a pay run" value={money(data.position.commissionScheduledMinor)} />
                {data.position.funds.map((f) => (
                  <Line key={f.fund} label={f.name} value={money(f.balanceMinor)} />
                ))}
                <Line label="Deals still being checked" value={money(data.position.pendingDealsMinor)} />
                <Line
                  label="Ledger check"
                  value={
                    data.check.ok ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Problems</Badge>
                  }
                />
              </dl>
            )}
          </Card>
        }
      >
        <div className="space-y-4">
          <Card>
            <CardHead title="Statement" />
            {!data ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="space-y-4">
                <Section title="Money in">
                  <Line label={`Sales and rentals (${data.totals.deals} ${data.totals.deals === 1 ? "deal" : "deals"})`} value={money(data.totals.salesMinor)} />
                </Section>
                <Section title="Commission">
                  <Line label="Owed on deals closed" value={money(data.totals.commissionMinor)} />
                  <Line label="Paid out" value={money(data.totals.paidOutMinor)} />
                  <Line label="Clawed back" value={money(data.totals.clawbackMinor)} />
                </Section>
                <Section title="The two funds">
                  <Line label="Share of deals" value={money(data.totals.fundsMinor)} />
                  <Line label="Inflows" value={money(data.totals.fundInMinor)} />
                  <Line label="Payments out" value={money(data.totals.fundOutMinor)} />
                </Section>
                <div className="flex items-baseline justify-between gap-3 border-t-2 border-plum-950 pt-3">
                  <span className="text-[13px] font-semibold text-plum-950">AV Homes kept</span>
                  <span className="c-num text-[16px] font-semibold text-plum-950">{money(data.totals.keptMinor)}</span>
                </div>
              </div>
            )}
          </Card>

        </div>
      </PageColumns>

    <Card className="mt-4">
      <CardHead
        title="By month"
        action={
          hidden > 0 ? (
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-wine-700" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              Show quiet months
            </label>
          ) : undefined
        }
      />
      {!data ? (
        <Skeleton className="h-48" />
      ) : months.length === 0 ? (
        <EmptyState bare title="Nothing moved in this period" hint="No deals, payouts or fund movements." />
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
            {months.map((m) => (
              <li key={m.month} className="rounded-xl border border-mist-200 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-plum-950">{fundMonthLabel(m.month)}</span>
                  <span className="text-[12px] text-slate-600">
                    {m.deals} {m.deals === 1 ? "deal" : "deals"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <Mini label="Sales" value={money(m.salesMinor)} />
                  <Mini label="Kept" value={money(m.keptMinor)} />
                  <Mini label="Commission owed" value={money(m.commissionMinor)} />
                  <Mini label="Commission paid" value={money(m.paidOutMinor)} />
                  <Mini label="Fund inflows" value={money(m.fundInMinor)} />
                  <Mini label="Fund payments" value={money(m.fundOutMinor)} />
                  {m.clawbackMinor > 0 && <Mini label="Clawed back" value={money(m.clawbackMinor)} />}
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden lg:block">
            <table className="w-full text-[13px]">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-mist-200 text-[11.5px] uppercase tracking-wide text-slate-600">
                  <th className="py-2 pr-2 text-left font-semibold">Month</th>
                  <th className="py-2 pr-2 text-right font-semibold">Deals</th>
                  <th className="py-2 pr-2 text-right font-semibold">Sales</th>
                  <th className="py-2 pr-2 text-right font-semibold">Comm. owed</th>
                  <th className="py-2 pr-2 text-right font-semibold">Comm. paid</th>
                  <th className="py-2 pr-2 text-right font-semibold">Funds in / out</th>
                  <th className="py-2 text-right font-semibold">Kept</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-mist-100">
                    <td className="whitespace-nowrap py-2 pr-2 text-plum-950">{fundMonthLabel(m.month, "short")}</td>
                    <td className="c-num py-2 pr-2 text-right">{m.deals}</td>
                    <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(m.salesMinor)}</td>
                    <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(m.commissionMinor)}</td>
                    <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(m.paidOutMinor)}</td>
                    <td className="c-num py-2 pr-2 text-right">
                      <span className="block whitespace-nowrap">{money(m.fundInMinor)}</span>
                      {m.fundOutMinor > 0 && (
                        <span className="block whitespace-nowrap text-slate-600">-{money(m.fundOutMinor)}</span>
                      )}
                    </td>
                    <td className="c-num whitespace-nowrap py-2 text-right font-semibold text-plum-950">{money(m.keptMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-plum-950 font-semibold text-plum-950">
                  <td className="py-2 pr-2">Total</td>
                  <td className="c-num py-2 pr-2 text-right">{data.totals.deals}</td>
                  <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(data.totals.salesMinor)}</td>
                  <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(data.totals.commissionMinor)}</td>
                  <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(data.totals.paidOutMinor)}</td>
                  <td className="c-num whitespace-nowrap py-2 pr-2 text-right">{money(data.totals.fundInMinor)}</td>
                  <td className="c-num whitespace-nowrap py-2 text-right">{money(data.totals.keptMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] text-slate-600">
            Every column, clawbacks included, is in the Excel download.
          </p>
        </>
      )}
    </Card>

      <Card className="mt-4">
        <CardHead
          title={`Payouts${data ? ` (${data.payouts.length})` : ""}`}
          action={
            flagged > 0 ? (
              <label className="flex items-center gap-2 text-[12px] text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-wine-700" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                Only flagged ({flagged})
              </label>
            ) : undefined
          }
        />
        {!data ? (
          <Skeleton className="h-32" />
        ) : payouts.length === 0 ? (
          <EmptyState bare title="No payouts in this period" hint="Pay run lines for these months show here." />
        ) : (
          <ul className="divide-y divide-mist-100">
            {payouts.map((p) => (
              <PayoutRow key={`${p.runId}-${p.marketerId}`} payout={p} money={money} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      <dl className="divide-y divide-mist-100">{children}</dl>
    </section>
  );
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="min-w-0 text-[13px] text-slate-700">{label}</dt>
      <dd className={`c-num shrink-0 text-right text-[13px] ${strong ? "font-semibold text-plum-950" : "text-plum-950"}`}>
        {value}
      </dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-slate-600">{label}</dt>
      <dd className="c-num truncate font-semibold text-plum-950">{value}</dd>
    </div>
  );
}

function PayoutRow({ payout: p, money }: { payout: PayoutRecord; money: (minor: number) => string }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-plum-950">
          <span className="block truncate">
            {p.displayName} <span className="font-normal text-slate-500">{p.code}</span>
          </span>
        </span>
        <span className="c-num text-[13px] font-semibold text-plum-950">{money(p.totalMinor)}</span>
        <Badge tone={p.status === "paid" ? "green" : p.status === "held" ? "amber" : "neutral"}>
          {p.status === "paid" ? "Paid" : p.status === "held" ? "Held" : "Pending"}
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
