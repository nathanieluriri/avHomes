"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PLAN_STATE_LABEL,
  formatMoney,
  planStanding,
  type Deal,
  type DealShare,
} from "@avhomes/contracts";
import { NairaInput } from "./NairaInput";
import { ProofPicker, useProofUploads } from "./ProofPicker";
import { Field, Note, PrimaryButton, ErrorNote, inputCls } from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { shortDate, fullDate } from "@/lib/admin/format";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";

/** A payment-plan deal: what is paid, what was earned so far, what is still to come, and logging the next payment. */
export function PlanCard({
  deal,
  myShare,
  canLog,
  onLogged,
}: {
  deal: Deal;
  myShare: DealShare | null;
  canLog: boolean;
  onLogged: () => void;
}) {
  const [hidden] = useMoneyHidden();
  const [now] = useState(() => Date.now());
  const uploads = useProofUploads();
  const [amountMinor, setAmountMinor] = useState(0);
  const [paidOn, setPaidOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!deal.plan) return null;
  const money = (minor: number) => {
    const text = formatMoney(minor, deal.currency);
    return hidden ? maskMoney(text) : text;
  };
  const standing = planStanding(deal.amountMinor, deal.plan, deal.payments, now);
  const full = deal.planShares.find((s) => s.marketerId === myShare?.marketerId && s.level === myShare?.level);
  const earned = myShare?.amountMinor ?? 0;
  const toCome = Math.max(0, (full?.amountMinor ?? 0) - earned);
  const room = standing.leftMinor - standing.pendingMinor;

  async function send() {
    setTried(true);
    if (amountMinor < 1 || uploads.items.length === 0 || uploads.sending) return;
    setBusy(true);
    setError(null);
    try {
      const [y, m, d] = paidOn.split("-").map(Number);
      await api.post(
        `/marketing/deals/${encodeURIComponent(deal.id)}/payments`,
        { amountMinor, paidOn: y && m && d ? new Date(y, m - 1, d, 12).getTime() : 0, proof: uploads.urls },
      );
      onLogged();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  return (
    <div className="m-card space-y-4 p-4">
      <div>
        <p className="text-[13px] font-semibold text-m-muted">{PLAN_STATE_LABEL[standing.state]}</p>
        <p className="mt-1 text-[15px] font-semibold text-m-text">
          {money(standing.verifiedMinor)} paid of {money(deal.amountMinor)}
        </p>
        {standing.next && standing.next.dueOn > 0 && (
          <p className="mt-1 text-[13px] text-m-muted">
            Next: {money(standing.nextLeftMinor)} due {fullDate(standing.next.dueOn)}
          </p>
        )}
      </div>

      {myShare && deal.status === "approved" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[14px] bg-m-raised p-3 ring-1 ring-m-line">
            <p className="text-[12px] text-m-muted">Earned so far</p>
            <p className="m-num text-[15px] font-semibold text-m-text">{money(earned)}</p>
          </div>
          <div className="rounded-[14px] bg-m-raised p-3 ring-1 ring-m-line">
            <p className="text-[12px] text-m-muted">Still to come</p>
            <p className="m-num text-[15px] font-semibold text-m-text">{money(toCome)}</p>
          </div>
        </div>
      )}

      {deal.payments.length > 0 && (
        <ul className="space-y-2">
          {deal.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-m-text">
                {money(p.amountMinor)} <span className="text-m-muted">· {shortDate(p.paidOn)}</span>
              </span>
              <span className="text-m-muted">{PAYMENT_STATUS_LABEL[p.status]}</span>
            </li>
          ))}
        </ul>
      )}

      {canLog && deal.status === "approved" && room > 0 && (
        <div className="space-y-4 border-t border-m-line pt-4">
          <p className="text-[14px] font-semibold text-m-text">Log a payment</p>
          <Field label="Amount paid" as="group" error={tried && amountMinor < 1 ? "Put in the amount paid." : undefined}>
            <NairaInput value={amountMinor} onChange={setAmountMinor} label="Amount paid, in naira" />
          </Field>
          <Field label="Date paid">
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={`m-num ${inputCls}`} />
          </Field>
          <ProofPicker
            uploads={uploads}
            label="Proof of payment"
            hint="A bank alert or receipt."
            error={tried && uploads.items.length === 0 ? "Add at least one photo." : undefined}
          />
          <Note>AV Homes checks it, then your commission on it is added.</Note>
          {error && <ErrorNote error={error} onRetry={() => void send()} />}
          <PrimaryButton busy={busy} disabled={uploads.sending !== null} onClick={() => void send()}>
            {!busy && <Send className="h-5 w-5" aria-hidden />}
            {busy ? "Sending" : "Send payment"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
