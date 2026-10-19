"use client";

import { useState } from "react";
import { Paperclip, Plus, TriangleAlert, Wallet } from "lucide-react";
import {
  disbursementRefusal,
  formatMoney,
  fundMonthLabel,
  quarterLabel,
  voidRefusal,
  type FundBalance,
  type FundEntry,
  type FundKind,
  type FundMonth,
  type FundMonthly,
  type RewardOutlook,
} from "@avhomes/contracts";
import { api, ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { BottomSheet } from "@/components/admin/BottomSheet";
import ImagePicker from "@/components/admin/ImagePicker";
import { MoneyInput } from "@/components/admin/listing/MoneyInput";
import { MiniChart } from "@/components/admin/MiniChart";
import { StatRow, StatTile } from "@/components/admin/StatTile";
import { DataTable, type Column } from "@/components/admin/DataTable";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

interface FundsResponse {
  funds: FundBalance[];
}

interface EntriesResponse {
  entries: FundEntry[];
  nextBefore: number | null;
}

/**
 * What is in the two funds, what was paid out of each, and how the reward pool
 * moved month by month.
 *
 * The balance cards answer "how much is there", the payments table answers
 * "where did it go", and the month table answers "how is it trending". Each fund's
 * full statement still opens from its card, for the reader reconciling a figure.
 */
export default function WalletsPage() {
  const [open, setOpen] = useState<FundKind | null>(null);
  const [paying, setPaying] = useState<FundKind | null>(null);
  const [payments, setPayments] = useState<FundKind>("reward");
  const [refresh, setRefresh] = useState(0);

  const state = useAsync((signal) => api.get<FundsResponse>("/admin/funds", signal), [refresh]);
  const reward = useAsync(
    (signal) => api.get<{ reward: RewardOutlook | null }>("/admin/analytics/overview", signal),
    [],
  );

  const funds = state.data?.funds ?? [];
  const byKind = (kind: FundKind) => funds.find((fund) => fund.fund === kind);
  const pool = byKind("reward");
  const foundation = byKind("foundation");
  const payingFund = paying ? byKind(paying) : undefined;

  function changed() {
    setRefresh((n) => n + 1);
  }

  return (
    <>
      <PageHeader
        icon={Wallet}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="The two funds"
        subtitle="A share of every deal, every payment made out of it, and how the reward pool moves month by month."
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {state.loading && funds.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pool && (
            <FundCard
              fund={pool}
              refresh={refresh}
              blurb="Paid to the best seller each quarter. A prize, or anything else the pool pays for, is recorded here."
              open={open === "reward"}
              onToggle={() => setOpen((was) => (was === "reward" ? null : "reward"))}
              onPay={() => setPaying("reward")}
            >
              <RewardPanel outlook={reward.data?.reward ?? null} currency={pool.currency} />
            </FundCard>
          )}
          {foundation && (
            <FundCard
              fund={foundation}
              refresh={refresh}
              blurb="Spent on the community. Every payment out says who received it, when and what for."
              open={open === "foundation"}
              onToggle={() => setOpen((was) => (was === "foundation" ? null : "foundation"))}
              onPay={() => setPaying("foundation")}
            />
          )}
        </div>
      )}

      {funds.length > 0 && (
        <>
          <section className="mt-8" aria-labelledby="payments-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="payments-title" className="text-[15px] font-semibold text-plum-950">
                Payments out
              </h2>
              <FundSwitch funds={funds} value={payments} onChange={setPayments} label="Payments from" />
            </div>
            {byKind(payments) && (
              <PaymentsTable
                fund={byKind(payments)!}
                refresh={refresh}
                onPay={() => setPaying(payments)}
                onChanged={changed}
              />
            )}
          </section>

          {pool && <MonthlySection pool={pool} refresh={refresh} />}
        </>
      )}

      {payingFund && (
        <PaySheet
          open={paying !== null}
          onOpenChange={(next) => {
            if (!next) setPaying(null);
          }}
          fund={payingFund}
          onDone={() => {
            setPaying(null);
            changed();
          }}
        />
      )}
    </>
  );
}

function FundSwitch({
  funds,
  value,
  onChange,
  label,
}: {
  funds: readonly FundBalance[];
  value: FundKind;
  onChange: (fund: FundKind) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {funds.map((fund) => {
        const on = fund.fund === value;
        return (
          <button
            key={fund.fund}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(fund.fund)}
            className={`c-tap shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              on ? "bg-plum-950 text-white" : "bg-white text-slate-600 shadow-card hover:text-plum-950"
            }`}
          >
            {fund.name}
          </button>
        );
      })}
    </div>
  );
}

function FundCard({
  fund,
  refresh,
  blurb,
  open,
  onToggle,
  onPay,
  children,
}: {
  fund: FundBalance;
  refresh: number;
  blurb: string;
  open: boolean;
  onToggle: () => void;
  onPay: () => void;
  children?: React.ReactNode;
}) {
  const entries = useAsync(
    (signal) =>
      open
        ? api.get<EntriesResponse>(`/admin/funds/${fund.fund}/entries?limit=30`, signal)
        : Promise.resolve(null),
    [open, fund.fund, refresh],
  );
  const short = fund.balanceMinor < 0;

  return (
    <Card spotlight={`fund-${fund.fund}`}>
      <CardHead
        title={fund.name}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={onPay}
            disabled={fund.balanceMinor <= 0}
            spotlight={fund.fund === "foundation" ? "fund-spend" : undefined}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Record a payment
          </Button>
        }
      />
      <p className={`c-num text-[26px] font-semibold ${short ? "text-red-700" : "text-plum-950"}`}>
        {formatMoney(fund.balanceMinor, fund.currency)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-mist-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">From deals</dt>
          <dd className="c-num mt-0.5 text-[14px] font-semibold text-plum-950">
            {formatMoney(fund.accruedMinor, fund.currency)}
          </dd>
        </div>
        <div className="rounded-xl bg-mist-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Paid out</dt>
          <dd className="c-num mt-0.5 text-[14px] font-semibold text-plum-950">
            {formatMoney(fund.paidMinor, fund.currency)}
          </dd>
        </div>
      </dl>
      {short && (
        <p className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          This fund is {formatMoney(-fund.balanceMinor, fund.currency)} short. A deal was cancelled after money had
          already been paid out of its share. No more payments can be recorded until new deals cover it.
        </p>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">{blurb}</p>

      {children}

      <button
        type="button"
        data-spotlight={`fund-${fund.fund}-history`}
        onClick={onToggle}
        aria-expanded={open}
        className="c-tap mt-3 text-[12px] font-medium text-wine-700 hover:underline"
      >
        {open ? "Hide the statement" : `Full statement (${fund.entries})`}
      </button>

      {open && (
        <div className="mt-2">
          {entries.loading && !entries.data ? (
            <Skeleton className="h-24" />
          ) : entries.data && entries.data.entries.length > 0 ? (
            <ul className="divide-y divide-mist-100">
              {entries.data.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className={`min-w-0 text-[12px] text-plum-950 ${entry.voidedAt ? "line-through opacity-60" : ""}`}>
                    {describe(entry)}
                    <span className="ml-1.5 text-[11px] text-slate-550">
                      {shortDate(entry.paidAt ?? entry.createdAt)}
                      {entry.rate > 0 && ` · ${entry.rate}%`}
                    </span>
                  </span>
                  {/* A sign, not only a colour, because the direction is the whole meaning of the row. */}
                  <span
                    className={`c-num shrink-0 text-[12px] font-medium ${
                      entry.amountMinor < 0 ? "text-red-600" : "text-plum-950"
                    }`}
                  >
                    {entry.amountMinor < 0 ? "-" : "+"}
                    {formatMoney(Math.abs(entry.amountMinor), entry.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-600">Nothing has moved yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function describe(entry: FundEntry): string {
  if (entry.kind === "payout") {
    return entry.recipient ? `To ${entry.recipient}: ${entry.note}` : entry.note || "Paid out";
  }
  if (entry.kind === "accrual") return "From a sale";
  if (entry.dealId) return entry.note ? `Deal cancelled: ${entry.note}` : "Deal cancelled";
  return entry.note || "Correction";
}

/** The current quarter's standings, and whether it can be closed. */
function RewardPanel({ outlook, currency }: { outlook: RewardOutlook | null; currency: string }) {
  if (!outlook) return null;
  return (
    <div className="mt-3 rounded-xl bg-mist-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {quarterLabel(outlook.quarter)}
      </p>
      {outlook.standings.length === 0 ? (
        <p className="mt-1 text-[12px] text-slate-600">Nobody has closed anything yet.</p>
      ) : (
        <ol className="mt-1.5 space-y-1">
          {outlook.standings.slice(0, 3).map((row) => (
            <li key={`${row.kind}-${row.personId}`} className="flex items-baseline gap-2">
              <span className="c-num w-4 shrink-0 text-[12px] font-semibold text-slate-550">{row.rank}</span>
              <span className="min-w-0 text-[12px] text-plum-950">{row.name}</span>
              <span className="c-num ml-auto shrink-0 text-[12px] font-medium text-plum-950">
                {formatMoney(row.valueMinor, currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-550">
        {outlook.closable
          ? "This quarter is over and the prize can be decided."
          : "Still running. The prize is decided once the quarter ends."}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ PAYMENTS ══ */

function PaymentsTable({
  fund,
  refresh,
  onPay,
  onChanged,
}: {
  fund: FundBalance;
  refresh: number;
  onPay: () => void;
  onChanged: () => void;
}) {
  const list = useAsync(
    (signal) => api.get<{ payments: FundEntry[] }>(`/admin/funds/${fund.fund}/payments?limit=100`, signal),
    [fund.fund, refresh],
  );
  const [voiding, setVoiding] = useState<FundEntry | null>(null);
  const rows = list.data?.payments ?? [];
  const live = rows.filter((row) => !row.voidedAt);
  const total = live.reduce((sum, row) => sum - row.amountMinor, 0);

  const columns: Column<FundEntry>[] = [
    {
      key: "who",
      header: "Paid to",
      primary: true,
      render: (row) => (
        <span className={`block min-w-0 ${row.voidedAt ? "opacity-60" : ""}`}>
          <span className={`block truncate font-medium text-plum-950 ${row.voidedAt ? "line-through" : ""}`}>
            {row.recipient || "Not recorded"}
          </span>
          <span className="block truncate text-[12px] text-slate-600">{row.note}</span>
          {row.voidedAt && (
            <span className="mt-0.5 block text-[11.5px] text-red-700">
              Voided {shortDate(row.voidedAt)} by {row.voidedByName}: {row.voidReason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "paid",
      header: "Paid on",
      mobile: "keep",
      render: (row) => <span className="text-slate-600">{shortDate(row.paidAt ?? row.createdAt)}</span>,
    },
    {
      key: "ref",
      header: "Reference",
      mobile: "tablet",
      render: (row) => (
        <span className="inline-flex items-center gap-2 text-slate-600">
          <span className="font-mono text-[12px]">{row.reference || "None"}</span>
          {row.proof[0] && (
            <a
              href={row.proof[0]}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[12px] font-medium text-wine-700 hover:underline"
            >
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              Receipt{row.proof.length > 1 ? `s (${row.proof.length})` : ""}
            </a>
          )}
        </span>
      ),
    },
    {
      key: "by",
      header: "Recorded by",
      mobile: "tablet",
      render: (row) => <span className="text-slate-600">{row.byName}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      mobile: "keep",
      render: (row) => (
        <span className={`c-num font-semibold ${row.voidedAt ? "text-slate-500 line-through" : "text-plum-950"}`}>
          {formatMoney(Math.abs(row.amountMinor), row.currency)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      badge: true,
      mobile: "keep",
      render: (row) =>
        row.voidedAt ? <Badge tone="red">Voided</Badge> : row.awardId ? <Badge tone="wine">Prize</Badge> : <Badge tone="green">Paid</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      tight: true,
      render: (row) => <RowAction row={row} />,
    },
  ];

  function RowAction({ row }: { row: FundEntry }) {
    if (row.voidedAt || row.awardId) return null;
    return (
      <Button size="sm" variant="ghost" onClick={() => setVoiding(row)}>
        Void
      </Button>
    );
  }

  return (
    <>
      {list.error && (
        <div className="mb-3">
          <ErrorNote error={list.error} onRetry={list.reload} />
        </div>
      )}
      <DataTable
        caption={`Payments from ${fund.name}`}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowAction={(row) => <RowAction row={row} />}
        loading={list.loading && !list.data}
        toolbar={
          rows.length > 0 ? (
            <p className="text-[12px] text-slate-600">
              {live.length} payment{live.length === 1 ? "" : "s"} totalling{" "}
              <span className="c-num font-semibold text-plum-950">{formatMoney(total, fund.currency)}</span>
            </p>
          ) : undefined
        }
        empty={
          list.error ? null : (
            <EmptyState
              bare
              icon={Wallet}
              title={`Nothing paid out of ${fund.name} yet`}
              hint="Each payment you record shows here with who received it, the day it was paid and its receipt."
              action={
                fund.balanceMinor > 0 ? (
                  <Button size="sm" onClick={onPay}>
                    Record a payment
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <VoidSheet
        payment={voiding}
        fund={fund}
        onClose={() => setVoiding(null)}
        onDone={() => {
          setVoiding(null);
          onChanged();
        }}
      />
    </>
  );
}

function VoidSheet({
  payment,
  fund,
  onClose,
  onDone,
}: {
  payment: FundEntry | null;
  fund: FundBalance;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const refusal = payment ? voidRefusal(payment, reason) : null;

  async function save() {
    if (!payment || refusal) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/funds/${fund.fund}/payments/${payment.id}/void`, { reason: reason.trim() });
      setReason("");
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={payment !== null}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title="Void this payment"
      description={
        payment
          ? `${formatMoney(Math.abs(payment.amountMinor), payment.currency)} to ${payment.recipient || "an unnamed recipient"}, paid ${shortDate(payment.paidAt ?? payment.createdAt)}. The money goes back into ${fund.name} and the record stays, marked void.`
          : undefined
      }
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void save()} disabled={busy || refusal !== null}>
            {busy ? "Voiding" : "Void the payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote error={error} />}
        <Field label="Why" hint="Kept with the record, so a reader later knows what went wrong.">
          <input
            className={inputClass}
            value={reason}
            maxLength={400}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded twice"
          />
        </Field>
      </div>
    </BottomSheet>
  );
}

/** `yyyy-mm-dd` in the reader's zone, for a date input. */
function dayValue(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Midday on the picked day, so no zone shift can move it to the day before. */
function dayToTime(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * Money leaving a fund.
 *
 * The refusal comes from `disbursementRefusal`, the server's own function, so
 * Save is never a round trip that comes back saying no.
 */
function PaySheet({
  open,
  onOpenChange,
  fund,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fund: FundBalance;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [today] = useState(() => dayValue(Date.now()));
  const [day, setDay] = useState(today);
  const [proof, setProof] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const minor = Math.round(Number(amount.replace(/[^0-9.]/gu, "") || "0") * 100);
  const paidAt = dayToTime(day);
  const refusal = disbursementRefusal({
    amountMinor: minor,
    balanceMinor: fund.balanceMinor,
    recipient,
    note,
    paidAt,
  });
  const left = fund.balanceMinor - minor;

  async function save() {
    if (refusal) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/funds/${fund.fund}/payments`, {
        amountMinor: minor,
        recipient: recipient.trim(),
        note: note.trim(),
        reference: reference.trim(),
        paidAt,
        proof,
      });
      setAmount("");
      setRecipient("");
      setNote("");
      setReference("");
      setProof([]);
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={`Record a payment from ${fund.name}`}
      description={`${formatMoney(fund.balanceMinor, fund.currency)} is available.`}
      widthClassName="sm:w-[min(36rem,calc(100vw-2rem))]"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="ml-auto" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || refusal !== null} spotlight="spend-confirm">
            {busy ? "Recording" : "Record the payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="How much"
            hint={
              minor > 0 && left >= 0
                ? `${formatMoney(left, fund.currency)} will be left.`
                : `Up to ${formatMoney(fund.balanceMinor, fund.currency)}.`
            }
            spotlight="spend-amount"
          >
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Paid on">
            <input
              type="date"
              className={inputClass}
              value={day}
              max={today}
              onChange={(event) => setDay(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Paid to" hint="The person, school or supplier who received the money.">
          <input
            className={inputClass}
            value={recipient}
            maxLength={200}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder={fund.fund === "reward" ? "Ada Obi" : "Ajah Primary School"}
          />
        </Field>

        <Field label="What it paid for" hint="What a reader needs a year from now to know what this was." spotlight="spend-what">
          <input
            className={inputClass}
            value={note}
            maxLength={400}
            onChange={(event) => setNote(event.target.value)}
            placeholder={fund.fund === "reward" ? "Top seller prize, July to September" : "Borehole repair"}
          />
        </Field>

        <Field label="Transfer reference" hint="Optional. The bank's reference, so the payment can be traced.">
          <input
            className={inputClass}
            value={reference}
            maxLength={120}
            onChange={(event) => setReference(event.target.value)}
            placeholder="TRF-20261015-0042"
          />
        </Field>

        {/* The field, not the picker's `image-library` button: the tour must not
            land on another ImagePicker that happens to come first in the document. */}
        <Field label="Receipt" hint="Optional, but a photo of the receipt or transfer slip saves questions later." spotlight="spend-receipt" as="group">
          <ImagePicker value={proof} onChange={setProof} max={5} />
        </Field>

        {refusal && (amount !== "" || recipient !== "" || note !== "") && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{refusal}</p>
        )}
      </div>
    </BottomSheet>
  );
}

/* ═════════════════════════════════════════════════════════════════ MONTHLY ══ */

function MonthlySection({ pool, refresh }: { pool: FundBalance; refresh: number }) {
  const [months, setMonths] = useState(12);
  const data = useAsync(
    (signal) => api.get<FundMonthly>(`/admin/funds/reward/monthly?months=${months}`, signal),
    [months, refresh],
  );
  const monthly = data.data;
  const rows = monthly ? [...monthly.months].reverse() : [];
  const current = monthly?.months.at(-1);
  const currency = monthly?.currency ?? pool.currency;
  const inWindow = monthly?.months.reduce((sum, m) => sum + m.inMinor - m.reversedMinor, 0) ?? 0;
  const dealsInWindow = monthly?.dealsInWindow ?? monthly?.months.reduce((sum, m) => sum + m.deals, 0) ?? 0;
  const paidInWindow = monthly?.months.reduce((sum, m) => sum + m.paidMinor, 0) ?? 0;
  const money = (minor: number) => formatMoney(minor, currency);

  const columns: Column<FundMonth>[] = [
    {
      key: "month",
      header: "Month",
      primary: true,
      render: (m) => <span className="font-medium text-plum-950">{fundMonthLabel(m.month)}</span>,
    },
    {
      key: "in",
      header: "Came in",
      numeric: true,
      mobile: "keep",
      render: (m) => (
        <span className="c-num">
          {money(m.inMinor)}
          <span className="ml-1 text-[11.5px] text-slate-500">
            {m.deals} deal{m.deals === 1 ? "" : "s"}
          </span>
        </span>
      ),
      card: (m) => (
        <>
          In <span className="c-num text-plum-950">{money(m.inMinor)}</span> from {m.deals} deal{m.deals === 1 ? "" : "s"}
        </>
      ),
    },
    {
      key: "back",
      header: "Cancelled",
      numeric: true,
      mobile: "tablet",
      render: (m) =>
        m.reversedMinor > 0 ? (
          <span className="c-num text-red-700">-{money(m.reversedMinor)}</span>
        ) : (
          <span className="text-slate-400">None</span>
        ),
      card: (m) =>
        m.reversedMinor > 0 ? (
          <>
            <span className="c-num text-red-700">{money(m.reversedMinor)}</span> handed back
          </>
        ) : null,
    },
    {
      key: "paid",
      header: "Paid out",
      numeric: true,
      mobile: "keep",
      render: (m) =>
        m.paidMinor > 0 ? (
          <span className="c-num">
            -{money(m.paidMinor)}
            <span className="ml-1 text-[11.5px] text-slate-500">
              {m.payments} payment{m.payments === 1 ? "" : "s"}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">None</span>
        ),
      card: (m) =>
        m.paidMinor > 0 ? (
          <>
            Paid out <span className="c-num text-plum-950">{money(m.paidMinor)}</span>
          </>
        ) : (
          "Nothing paid out"
        ),
    },
    {
      key: "close",
      header: "Balance at month end",
      numeric: true,
      mobile: "keep",
      render: (m) => <span className="c-num font-semibold text-plum-950">{money(m.closingMinor)}</span>,
      card: (m) => (
        <>
          Ends at <span className="c-num font-semibold text-plum-950">{money(m.closingMinor)}</span>
        </>
      ),
    },
  ];

  return (
    <section className="mt-8" aria-labelledby="monthly-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="monthly-title" className="text-[15px] font-semibold text-plum-950">
            {pool.name}, month by month
          </h2>
          <p className="text-[12px] text-slate-600">What each month&apos;s deals put in, what was paid out, and where it closed.</p>
        </div>
        <div role="group" aria-label="How many months" className="flex gap-1">
          {[6, 12, 24].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={months === n}
              onClick={() => setMonths(n)}
              className={`c-tap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                months === n ? "bg-plum-950 text-white" : "bg-white text-slate-600 shadow-card hover:text-plum-950"
              }`}
            >
              {n} months
            </button>
          ))}
        </div>
      </div>

      {data.error && <ErrorNote error={data.error} onRetry={data.reload} />}
      {!monthly && !data.error && <Skeleton className="h-64" />}
      {monthly && current && (
        <div className="space-y-4">
          <StatRow>
            <StatTile label="This month in" value={money(current.inMinor - current.reversedMinor)} scope={`${current.deals} deal${current.deals === 1 ? "" : "s"}, ${fundMonthLabel(current.month)}`} />
            <StatTile label="This month out" value={money(current.paidMinor)} scope={`${current.payments} payment${current.payments === 1 ? "" : "s"}`} />
            <StatTile label={`In, ${months} months`} value={money(inWindow)} scope={`${dealsInWindow} deal${dealsInWindow === 1 ? "" : "s"}, net of cancellations`} tone="quiet" />
            <StatTile label={`Out, ${months} months`} value={money(paidInWindow)} scope="Voided payments left out" tone="quiet" />
          </StatRow>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHead title="Came in each month" />
              <MiniChart
                mode="bars"
                unit="month"
                label={`${pool.name}: what came in each month`}
                points={monthly.months.map((m) => ({
                  label: fundMonthLabel(m.month),
                  value: Math.max(0, m.inMinor - m.reversedMinor),
                  detail: `${money(m.inMinor - m.reversedMinor)} from ${m.deals} deal${m.deals === 1 ? "" : "s"}`,
                }))}
              />
            </Card>
            <Card>
              <CardHead title="Balance at month end" />
              <MiniChart
                mode="line"
                unit="month"
                label={`${pool.name}: balance at the end of each month`}
                points={monthly.months.map((m) => ({
                  label: fundMonthLabel(m.month),
                  value: Math.max(0, m.closingMinor),
                  detail: `${money(m.closingMinor)}, ${money(m.paidMinor)} paid out`,
                }))}
              />
            </Card>
          </div>

          <DataTable
            caption={`${pool.name} by month`}
            columns={columns}
            rows={rows}
            rowKey={(m) => m.month}
            footer={
              <p className="px-1 text-[12px] text-slate-600">
                Opening balance before {fundMonthLabel(monthly.months[0]!.month)}:{" "}
                <span className="c-num font-semibold text-plum-950">{money(monthly.openingMinor)}</span>
              </p>
            }
          />
        </div>
      )}
    </section>
  );
}
