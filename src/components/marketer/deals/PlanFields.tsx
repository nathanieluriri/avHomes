"use client";

import {
  PLAN_FREQUENCIES,
  PLAN_FREQUENCY_LABEL,
  formatMoney,
  planRefusal,
  planSchedule,
  type DealPlan,
  type PlanFrequency,
} from "@avhomes/contracts";
import { NairaInput } from "./NairaInput";
import { Field, Note, Segmented, inputCls } from "@/components/marketer/ui";

export interface PlanDraft {
  on: boolean;
  depositMinor: number;
  instalments: string;
  frequency: PlanFrequency;
  firstDue: string;
}

export const NO_PLAN: PlanDraft = { on: false, depositMinor: 0, instalments: "6", frequency: "monthly", firstDue: "" };

export function planFromDraft(draft: PlanDraft): DealPlan | null {
  if (!draft.on) return null;
  const [y, m, d] = draft.firstDue.split("-").map(Number);
  return {
    depositMinor: draft.depositMinor,
    instalments: Math.floor(Number(draft.instalments) || 0),
    frequency: draft.frequency,
    firstDueOn: y && m && d ? new Date(y, m - 1, d, 12).getTime() : 0,
  };
}

export function planDraftRefusal(totalMinor: number, draft: PlanDraft): string | null {
  const plan = planFromDraft(draft);
  return plan ? planRefusal(totalMinor, plan) : null;
}

const MODES = [
  { value: "full", label: "Paid in full" },
  { value: "plan", label: "Payment plan" },
] as const;

/** Outright, or a deposit followed by regular payments. Commission follows each verified payment. */
export function PlanFields({
  totalMinor,
  currency,
  value,
  onChange,
  showErrors,
}: {
  totalMinor: number;
  currency: string;
  value: PlanDraft;
  onChange: (next: PlanDraft) => void;
  showErrors: boolean;
}) {
  const set = (patch: Partial<PlanDraft>) => onChange({ ...value, ...patch });
  const plan = planFromDraft(value);
  const refusal = plan ? planRefusal(totalMinor, plan) : null;
  const schedule = plan && !refusal ? planSchedule(totalMinor, plan) : [];
  const each = schedule.find((row) => row.n === 1)?.amountMinor ?? 0;

  return (
    <div className="space-y-4">
      <Field label="How it is being paid" as="group">
        <Segmented
          value={value.on ? "plan" : "full"}
          options={MODES}
          onChange={(mode) => set({ on: mode === "plan" })}
          label="How it is being paid"
        />
      </Field>
      {value.on && (
        <>
          <Field label="Deposit paid" hint="What was paid up front. Your proof on the next step is for this." as="group">
            <NairaInput value={value.depositMinor} onChange={(minor) => set({ depositMinor: minor })} label="Deposit, in naira" />
          </Field>
          <Field label="Payments after the deposit">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={value.instalments}
              onChange={(e) => set({ instalments: e.target.value })}
              className={`m-num ${inputCls}`}
            />
          </Field>
          <Field label="How often" as="group">
            <Segmented
              value={value.frequency}
              options={PLAN_FREQUENCIES.map((f) => ({ value: f, label: PLAN_FREQUENCY_LABEL[f] }))}
              onChange={(frequency) => set({ frequency })}
              label="How often"
            />
          </Field>
          <Field label="First payment due">
            <input
              type="date"
              value={value.firstDue}
              onChange={(e) => set({ firstDue: e.target.value })}
              className={`m-num ${inputCls}`}
            />
          </Field>
          {refusal && showErrors ? (
            <Note tone="warn">{refusal}</Note>
          ) : (
            each > 0 && (
              <Note>
                {schedule.length - (value.depositMinor > 0 ? 1 : 0)} payments of about {formatMoney(each, currency)}. Commission is
                earned on each payment once AV Homes verifies it.
              </Note>
            )
          )}
        </>
      )}
    </div>
  );
}
