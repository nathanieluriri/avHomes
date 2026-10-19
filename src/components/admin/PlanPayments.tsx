"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  PLAN_FREQUENCY_LABEL,
  PLAN_STATE_LABEL,
  formatMoney,
  parseMajor,
  planStanding,
  type Deal,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { fullDate, shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import ImagePicker from "./ImagePicker";
import { Badge, Button, Card, CardHead, DRow, DefinitionList, ErrorNote, Field, inputClass, type Tone } from "./ui";

const STATE_TONE = { paid: "green", "on-track": "neutral", "due-soon": "amber", overdue: "red" } as const satisfies Record<string, Tone>;
const PAYMENT_TONE = { pending: "amber", verified: "green", rejected: "red" } as const satisfies Record<string, Tone>;

/** A payment-plan deal: where it stands, every payment, and the controls to verify, reject or log one. */
export function PlanPayments({ deal, onChange }: { deal: Deal; onChange: (deal: Deal) => void }) {
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<ApiError | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [proof, setProof] = useState<string[]>([]);

  if (!deal.plan) return null;
  const plan = deal.plan;
  const money = (minor: number) => formatMoney(minor, deal.currency);
  const standing = planStanding(deal.amountMinor, plan, deal.payments, now);
  const approved = deal.status === "approved";
  const parsed = parseMajor(amount || "0", deal.currency);

  async function act(run: () => Promise<{ deal: Deal }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await run();
      onChange(res.deal);
      return true;
    } catch (err) {
      setError(toApiError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function logOne() {
    if (!parsed.ok) return;
    const ok = await act(() =>
      api.post<{ deal: Deal }>(`/admin/marketing/deals/${deal.id}/payments`, {
        amountMinor: parsed.minor,
        paidOn: paidOn ? new Date(paidOn).getTime() : 0,
        proof,
      }),
    );
    if (ok) {
      setLogging(false);
      setAmount("");
      setPaidOn("");
      setProof([]);
    }
  }

  return (
    <Card>
      <CardHead title="Payment plan" action={<Badge tone={STATE_TONE[standing.state]}>{PLAN_STATE_LABEL[standing.state]}</Badge>} />
      <DefinitionList>
        <DRow label="Price">{money(deal.amountMinor)}</DRow>
        <DRow label="Deposit">{money(plan.depositMinor)}</DRow>
        <DRow label="Then">
          {plan.instalments} payments, {PLAN_FREQUENCY_LABEL[plan.frequency].toLowerCase()}
        </DRow>
        <DRow label="Verified so far">{money(standing.verifiedMinor)}</DRow>
        {standing.pendingMinor > 0 && <DRow label="Being checked">{money(standing.pendingMinor)}</DRow>}
        <DRow label="Still to pay">{money(standing.leftMinor)}</DRow>
        {standing.next && standing.next.dueOn > 0 && (
          <DRow label="Next due">
            {money(standing.nextLeftMinor)} on {fullDate(standing.next.dueOn)}
          </DRow>
        )}
      </DefinitionList>

      <p className="mb-2 mt-4 text-[12px] font-semibold text-plum-950">Payments</p>
      {deal.payments.length === 0 ? (
        <p className="text-[12px] text-slate-600">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {deal.payments.map((p) => (
            <li key={p.id} className="rounded-xl border border-mist-200 p-3">
              <div className="flex items-center gap-2">
                <span className="c-num flex-1 text-[13px] font-semibold text-plum-950">{money(p.amountMinor)}</span>
                <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
              </div>
              <p className="mt-1 text-[12px] text-slate-600">
                Paid {shortDate(p.paidOn)} · logged by {p.reportedByName}
                {p.reviewedByName && p.status !== "pending" ? ` · checked by ${p.reviewedByName}` : ""}
                {p.note ? ` · ${p.note}` : ""}
              </p>
              {p.reason && <p className="mt-1 text-[12px] text-red-800">{p.reason}</p>}
              {p.proof.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.proof.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-wine-700 underline underline-offset-2">
                      Proof {i + 1}
                    </a>
                  ))}
                </div>
              )}
              {p.status === "pending" &&
                (rejecting === p.id ? (
                  <div className="mt-2 space-y-2">
                    <input className={inputClass} value={reason} placeholder="Why it was not accepted" onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || reason.trim() === ""}
                        onClick={() =>
                          void act(() => api.post(`/admin/marketing/deals/${deal.id}/payments/${p.id}/reject`, { reason })).then((ok) => {
                            if (ok) {
                              setRejecting(null);
                              setReason("");
                            }
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void act(() => api.post(`/admin/marketing/deals/${deal.id}/payments/${p.id}/verify`, {}))}
                    >
                      Verify
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(p.id)}>
                      Reject
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}

      {approved && standing.leftMinor - standing.pendingMinor > 0 && (
        <div className="mt-4 border-t border-mist-100 pt-3">
          {!logging ? (
            <Button variant="ghost" className="w-full" onClick={() => setLogging(true)}>
              Log a payment received
            </Button>
          ) : (
            <div className="space-y-2">
              <Field label="Amount">
                <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Paid on">
                <input type="date" className={inputClass} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="Proof" as="group">
                <ImagePicker value={proof} onChange={setProof} max={5} />
              </Field>
              <p className="text-[11px] text-slate-600">Logged here, it is verified at once and earns its commission.</p>
              <div className="flex gap-2">
                <Button onClick={() => void logOne()} disabled={busy || !parsed.ok || parsed.minor < 1 || proof.length === 0}>
                  Log and verify
                </Button>
                <Button variant="ghost" onClick={() => setLogging(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      )}
    </Card>
  );
}
