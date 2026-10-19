"use client";

import { useState } from "react";
import { Download, Landmark } from "lucide-react";
import {
  PAYOUT_FLAG_LABELS,
  formatMoney,
  fundMonthLabel,
  fundMonthOf,
  plainMajor,
  type AccountsMonth,
  type AccountsReport,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { downloadCsv, toCsv } from "@/lib/admin/marketing";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import {
  Badge,
  Button,
  Card,
  CardHead,
  DRow,
  DefinitionList,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

const COLUMNS: { key: Exclude<keyof AccountsMonth, "month">; label: string; money: boolean }[] = [
  { key: "deals", label: "Deals", money: false },
  { key: "salesMinor", label: "Sales", money: true },
  { key: "commissionMinor", label: "Commission owed", money: true },
  { key: "paidOutMinor", label: "Commission paid", money: true },
  { key: "clawbackMinor", label: "Clawed back", money: true },
  { key: "fundsMinor", label: "To the funds", money: true },
  { key: "fundInMinor", label: "Fund inflows", money: true },
  { key: "fundOutMinor", label: "Fund payments", money: true },
  { key: "keptMinor", label: "AV Homes kept", money: true },
];

function defaultFrom(): string {
  const now = new Date();
  return fundMonthOf(new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime());
}

export default function AccountsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => fundMonthOf(Date.now()));
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const state = useAsync(
    (signal) => api.get<AccountsReport>(`/admin/accounts?from=${from}&to=${to}`, signal),
    [from, to],
    { keepPrevious: true },
  );
  const data = state.data;
  const currency = data?.currency ?? "NGN";
  const money = (minor: number) => formatMoney(minor, currency);
  const scope = data ? `${fundMonthLabel(data.from, "short")} to ${fundMonthLabel(data.to, "short")}` : "";

  function exportCsv() {
    if (!data) return;
    const plain = (minor: number) => plainMajor(minor, currency);
    const head = ["Month", ...COLUMNS.map((c) => c.label)];
    const rows = data.months.map((m) => [m.month, ...COLUMNS.map((c) => (c.money ? plain(m[c.key]) : String(m[c.key])))]);
    const total = ["Total", ...COLUMNS.map((c) => (c.money ? plain(data.totals[c.key]) : String(data.totals[c.key])))];
    const position = [
      [],
      ["Position today"],
      ["Commission owed", plain(data.position.commissionOwedMinor)],
      ["Of which on a pay run", plain(data.position.commissionScheduledMinor)],
      ...data.position.funds.map((f) => [`${f.name} balance`, plain(f.balanceMinor)]),
      ["Deals still being checked", plain(data.position.pendingDealsMinor)],
    ];
    downloadCsv(`av-balance-sheet-${data.from}-to-${data.to}.csv`, toCsv([head, ...rows, total, ...position]));
  }

  const payouts = (data?.payouts ?? []).filter((p) => !flaggedOnly || p.flags.length > 0);

  return (
    <>
      <PageHeader
        icon={Landmark}
        title="Accounts"
        subtitle="Money in, what is owed and paid, both funds, and whether every payout has its proof."
        actions={
          <Button variant="ghost" onClick={exportCsv} disabled={!data}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <Field label="From">
            <input type="month" className={inputClass} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="month" className={inputClass} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHead title="By month" />
          {!data ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-[12.5px]">
                <thead>
                  <tr className="border-b border-mist-200 text-left text-slate-600">
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="py-2 pr-3 text-right font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month} className="border-b border-mist-100">
                      <td className="py-1.5 pr-3 text-plum-950">{fundMonthLabel(m.month, "short")}</td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="c-num py-1.5 pr-3 text-right">
                          {c.money ? money(m[c.key]) : m[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="font-semibold text-plum-950">
                    <td className="py-2 pr-3">Total</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="c-num py-2 pr-3 text-right">
                        {c.money ? money(data.totals[c.key]) : data.totals[c.key]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Where things stand today" />
          {!data ? (
            <Skeleton className="h-40" />
          ) : (
            <DefinitionList>
              <DRow label="Commission owed">{money(data.position.commissionOwedMinor)}</DRow>
              <DRow label="Of which on a pay run">{money(data.position.commissionScheduledMinor)}</DRow>
              {data.position.funds.map((f) => (
                <DRow key={f.fund} label={f.name}>
                  {money(f.balanceMinor)}
                </DRow>
              ))}
              <DRow label="Deals still being checked">{money(data.position.pendingDealsMinor)}</DRow>
            </DefinitionList>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHead
          title="Payouts"
          action={
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
              Only flagged
            </label>
          }
        />
        {!data ? (
          <Skeleton className="h-32" />
        ) : payouts.length === 0 ? (
          <EmptyState bare title="Nothing to show" hint="No pay run lines in this period match." />
        ) : (
          <ul className="space-y-2">
            {payouts.map((p) => (
              <li key={`${p.runId}-${p.marketerId}`} className="rounded-xl border border-mist-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-plum-950">
                    {p.displayName} <span className="font-normal text-slate-500">{p.code}</span>
                  </span>
                  <span className="c-num text-[13px] font-semibold">{money(p.totalMinor)}</span>
                  <Badge tone={p.status === "paid" ? "green" : p.status === "held" ? "amber" : "neutral"}>
                    {p.status === "paid" ? "Paid" : p.status === "held" ? "Held" : "Pending"}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-slate-600">
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
                        Proof {i + 1}
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
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
