"use client";

import {
  PLAN_FREQUENCIES,
  PLAN_FREQUENCY_LABEL,
  PLAN_INSTALMENTS_MAX,
  formatMoney,
  moneyRefusalMessage,
  parseMajor,
  planRefusal,
  planSchedule,
  type DealPlan,
  type PlanFrequency,
} from "@avhomes/contracts";
import { MoneyInput } from "./listing/MoneyInput";
import { Segmented } from "./listing/Segmented";
import { Field, inputClass } from "./ui";

/** What is typed, kept as typed, so switching the plan off and on again loses nothing. */
export interface SalePlanDraft {
  on: boolean;
  deposit: string;
  instalments: string;
  frequency: PlanFrequency;
  firstDue: string;
}

export function salePlanDraft(plan: DealPlan | null | undefined): SalePlanDraft {
  return plan
    ? {
        on: true,
        deposit: String(plan.depositMinor / 100),
        instalments: String(plan.instalments),
        frequency: plan.frequency,
        firstDue: dateInput(plan.firstDueOn),
      }
    : { on: false, deposit: "", instalments: "6", frequency: "monthly", firstDue: "" };
}

/** The plan the draft describes, and why the server would refuse it, against the agreed price. */
export function readSalePlan(
  draft: SalePlanDraft,
  totalMinor: number,
  currency: string,
): { plan: DealPlan | null; problem: string | null } {
  if (!draft.on) return { plan: null, problem: null };
  const deposit = parseMajor(draft.deposit || "0", currency);
  const plan: DealPlan = {
    depositMinor: deposit.ok ? deposit.minor : 0,
    instalments: Math.floor(Number(draft.instalments) || 0),
    frequency: draft.frequency,
    firstDueOn: draft.firstDue ? Date.parse(`${draft.firstDue}T12:00:00`) : 0,
  };
  if (!deposit.ok) return { plan, problem: moneyRefusalMessage(deposit.reason, currency) };
  return { plan, problem: totalMinor > 0 ? planRefusal(totalMinor, plan) : null };
}

/** Paid in full, or a deposit followed by regular payments, for a sale recorded from the console. */
export function SalePlanFields({
  value,
  onChange,
  totalMinor,
  currency,
}: {
  value: SalePlanDraft;
  onChange: (next: SalePlanDraft) => void;
  totalMinor: number;
  currency: string;
}) {
  const set = (patch: Partial<SalePlanDraft>) => onChange({ ...value, ...patch });
  const { plan, problem } = readSalePlan(value, totalMinor, currency);
  const schedule = plan && totalMinor > 0 && !problem ? planSchedule(totalMinor, plan) : [];
  const each = schedule.find((row) => row.n === 1)?.amountMinor ?? 0;
  const money = (minor: number) => formatMoney(minor, currency);

  return (
    <>
      <Field label="How it is being paid" as="group">
        <Segmented
          value={value.on ? "plan" : "full"}
          onChange={(mode) => set({ on: mode === "plan" })}
          options={[
            { value: "full", label: "Paid in full" },
            { value: "plan", label: "Payment plan" },
          ]}
        />
        <p className="mt-1.5 text-[12px] text-slate-600">
          {value.on
            ? "Commission is paid on each payment as it is verified, never on money not yet received."
            : "The whole amount has been received."}
        </p>
      </Field>

      {value.on && (
        <div className="space-y-4 rounded-xl border border-mist-200 p-3">
          <Field label="Deposit paid" hint="What was paid up front. Leave it empty if nothing has been paid yet.">
            <MoneyInput value={value.deposit} onChange={(deposit) => set({ deposit })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payments after the deposit">
              <input
                className={inputClass}
                type="number"
                inputMode="numeric"
                min={1}
                max={PLAN_INSTALMENTS_MAX}
                value={value.instalments}
                onChange={(event) => set({ instalments: event.target.value })}
              />
            </Field>
            <Field label="First payment due">
              <input
                className={inputClass}
                type="date"
                value={value.firstDue}
                onChange={(event) => set({ firstDue: event.target.value })}
              />
            </Field>
          </div>
          <Field label="How often" as="group">
            <Segmented
              value={value.frequency}
              onChange={(frequency) => set({ frequency })}
              options={PLAN_FREQUENCIES.map((f) => ({ value: f, label: PLAN_FREQUENCY_LABEL[f] }))}
            />
          </Field>
          {each > 0 && plan && (
            <p className="text-[12px] leading-relaxed text-slate-600">
              {plan.instalments} {plan.instalments === 1 ? "payment" : "payments"} of about {money(each)}
              {plan.depositMinor > 0 ? ` after a ${money(plan.depositMinor)} deposit` : ""}. Reminders go out before
              each one is due, and each payment is logged and verified on the deal.
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function dateInput(at: number): string {
  const day = new Date(at);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}
