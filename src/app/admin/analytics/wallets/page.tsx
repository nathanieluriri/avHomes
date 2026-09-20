"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import {
  disbursementRefusal,
  formatMoney,
  quarterLabel,
  type FundBalance,
  type FundEntry,
  type FundKind,
  type RewardOutlook,
} from "@avhomes/contracts";
import { api, ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { BottomSheet } from "@/components/admin/BottomSheet";
import ImagePicker from "@/components/admin/ImagePicker";
import { MoneyInput } from "@/components/admin/listing/MoneyInput";
import {
  Button,
  Card,
  CardHead,
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
 * What is in the two funds and where it went.
 *
 * ONE question, two cards side by side. Each fund's own history opens on request,
 * because a statement is a long list and two of them open at once is the overload
 * these screens avoid.
 *
 * The prize and the community fund behave differently on purpose. Money leaves the
 * prize through an award, which has a winner and a quarter attached. Money leaves
 * the fund through a disbursement, which needs a receipt. Neither can be emptied by
 * typing a number into the other's form.
 */
export default function WalletsPage() {
  const [open, setOpen] = useState<FundKind | null>(null);
  const [spending, setSpending] = useState(false);

  const state = useAsync((signal) => api.get<FundsResponse>("/admin/funds", signal), []);
  const reward = useAsync(
    (signal) => api.get<{ reward: RewardOutlook | null }>("/admin/analytics/overview", signal),
    [],
  );

  const funds = state.data?.funds ?? [];
  const foundation = funds.find((fund) => fund.fund === "foundation");
  const pool = funds.find((fund) => fund.fund === "reward");

  return (
    <>
      <PageHeader
        icon={Wallet}
        backTo="/admin/analytics"
        backLabel="Analytics"
        title="The two funds"
        subtitle="A share of every deal, and what has been done with it."
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {state.loading && funds.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pool && (
            <FundCard
              fund={pool}
              blurb="Paid to the best seller each quarter. It leaves through an award, never a transfer typed in here."
              open={open === "reward"}
              onToggle={() => setOpen((was) => (was === "reward" ? null : "reward"))}
            >
              <RewardPanel outlook={reward.data?.reward ?? null} currency={pool.currency} />
            </FundCard>
          )}

          {foundation && (
            <FundCard
              fund={foundation}
              blurb="Spent on the community. Every payment out carries what it was for and a receipt."
              open={open === "foundation"}
              onToggle={() => setOpen((was) => (was === "foundation" ? null : "foundation"))}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSpending(true)}
                  spotlight="fund-spend"
                >
                  Record a payment out
                </Button>
              }
            />
          )}
        </div>
      )}

      {foundation && (
        <SpendSheet
          open={spending}
          onOpenChange={setSpending}
          fund={foundation}
          onDone={() => {
            setSpending(false);
            state.reload();
          }}
        />
      )}
    </>
  );
}

function FundCard({
  fund,
  blurb,
  open,
  onToggle,
  action,
  children,
}: {
  fund: FundBalance;
  blurb: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const entries = useAsync(
    (signal) =>
      open
        ? api.get<EntriesResponse>(`/admin/funds/${fund.fund}/entries?limit=20`, signal)
        : Promise.resolve(null),
    [open, fund.fund],
  );

  /* Named off the fund rather than passed in, so both cards carry an anchor and
     a walkthrough names the one it means: `fund-foundation`, `fund-reward`. */
  return (
    <Card spotlight={`fund-${fund.fund}`}>
      <CardHead title={fund.name} action={action} />
      <p className="c-num text-[22px] font-semibold text-plum-950">
        {formatMoney(fund.balanceMinor, fund.currency)}
      </p>
      {/* The scope beside the number, always: what it holds now, and the two
          movements that got it there. */}
      <p className="mt-0.5 text-[11px] text-slate-550">
        held now · {formatMoney(fund.accruedMinor, fund.currency)} in ·{" "}
        {formatMoney(fund.paidMinor, fund.currency)} out
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{blurb}</p>

      {children}

      <button
        type="button"
        data-spotlight={`fund-${fund.fund}-history`}
        onClick={onToggle}
        aria-expanded={open}
        className="c-tap mt-3 text-[12px] font-medium text-wine-700 hover:underline"
      >
        {open ? "Hide the history" : `The history (${fund.entries})`}
      </button>

      {open && (
        <div className="mt-2">
          {entries.loading && !entries.data ? (
            <Skeleton className="h-24" />
          ) : entries.data && entries.data.entries.length > 0 ? (
            <ul className="space-y-1.5">
              {entries.data.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[12px] text-plum-950">
                    {entry.note || (entry.dealId ? "From a sale" : "Correction")}
                    <span className="ml-1.5 text-[11px] text-slate-550">
                      {shortDate(entry.createdAt)}
                      {entry.rate > 0 && ` · ${entry.rate}%`}
                    </span>
                  </span>
                  {/* A sign, not only a colour, because the direction is the whole
                      meaning of the row. */}
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

/** The current quarter's standings, and whether it can be closed. */
function RewardPanel({
  outlook,
  currency,
}: {
  outlook: RewardOutlook | null;
  currency: string;
}) {
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
              <span className="c-num w-4 shrink-0 text-[12px] font-semibold text-slate-550">
                {row.rank}
              </span>
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

/**
 * Money leaving the community fund.
 *
 * Every field is required and the refusal comes from `disbursementRefusal`, the
 * server's own function, so Save is never a round trip that comes back saying no.
 */
function SpendSheet({
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
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const minor = Math.round(Number(amount.replace(/[^0-9.]/gu, "") || "0") * 100);
  const refusal = disbursementRefusal({
    amountMinor: minor,
    balanceMinor: fund.balanceMinor,
    note,
    proof,
  });

  async function save() {
    if (refusal) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/funds/${fund.fund}/disburse`, {
        amountMinor: minor,
        note: note.trim(),
        proof,
      });
      setAmount("");
      setNote("");
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
      onOpenChange={onOpenChange}
      title={`Pay out of ${fund.name}`}
      description={`${formatMoney(fund.balanceMinor, fund.currency)} is available.`}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || refusal !== null}
            spotlight="spend-confirm"
          >
            {busy ? "Recording..." : "Record the payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote error={error} />}

        <Field
          label="How much"
          hint={`Up to ${formatMoney(fund.balanceMinor, fund.currency)}.`}
          spotlight="spend-amount"
        >
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <Field
          label="What it paid for"
          hint="What a reader needs a year from now to know what this was."
          spotlight="spend-what"
        >
          <input
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Borehole at the primary school in Ajah"
          />
        </Field>

        {/* The field, not the picker's `image-library` button: the tour must not
            land on another ImagePicker that happens to come first in the document. */}
        <Field
          label="The receipt"
          hint="At least one. Money leaving needs evidence."
          spotlight="spend-receipt"
        >
          <ImagePicker value={proof} onChange={setProof} max={5} />
        </Field>

        {refusal && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {refusal}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
