"use client";

import { formatPrice, paymentPlanFor, type PaymentPlan } from "@avhomes/contracts";
import { Field, inputClass } from "@/components/admin/ui";
import { NumberInput } from "./NumberInput";

export interface PaymentPlanDraft extends PaymentPlan {
  /** Held while off, so switching the plan off and on again keeps what was typed. */
  on: boolean;
}

export function toPaymentPlanDraft(plan: PaymentPlan | null): PaymentPlanDraft {
  return plan ? { on: true, ...plan } : { on: false, depositPercent: 30, months: 12, note: "" };
}

export function PaymentPlanFields({
  value,
  onChange,
  example,
  currency,
}: {
  value: PaymentPlanDraft;
  onChange: (patch: Partial<PaymentPlanDraft>) => void;
  /** The cheapest priced option, for the worked example. Null when nothing is priced. */
  example: { label: string; priceMinor: number } | null;
  currency: string;
}) {
  const money = (minor: number) => formatPrice(minor, { listingType: "sale", rentPeriod: null, currency });
  const worked = example ? paymentPlanFor(example.priceMinor, value) : null;

  return (
    <div className="space-y-4">
      <label className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-semibold text-plum-950 active:bg-mist-100 sm:mx-0 sm:min-h-0 sm:gap-2 sm:px-0">
        <input
          type="checkbox"
          role="switch"
          className="h-5 w-5 shrink-0 accent-[var(--wine-600)] sm:h-auto sm:w-auto"
          checked={value.on}
          onChange={(e) => onChange({ on: e.target.checked })}
        />
        Offers a payment plan
      </label>

      {value.on && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deposit" hint="Percent of the price, paid up front.">
              <span className="flex items-center gap-2">
                <NumberInput
                  min={1}
                  max={100}
                  value={value.depositPercent}
                  onChange={(v) => onChange({ depositPercent: v ?? 0 })}
                />
                <span className="shrink-0 text-[13px] text-slate-600">%</span>
              </span>
            </Field>
            <Field label="Spread over" hint="The balance is split evenly across these.">
              <span className="flex items-center gap-2">
                <NumberInput
                  min={1}
                  max={120}
                  value={value.months}
                  onChange={(v) => onChange({ months: v ?? 0 })}
                />
                <span className="shrink-0 text-[13px] text-slate-600">months</span>
              </span>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note" hint="Optional. Shown under the plan, for example No interest.">
                <input
                  className={inputClass}
                  maxLength={200}
                  autoComplete="off"
                  value={value.note}
                  onChange={(e) => onChange({ note: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <p className="rounded-lg bg-mist-50 px-3 py-2.5 text-[13px] text-plum-950">
            {example && worked && value.depositPercent >= 1 && value.months >= 1 ? (
              <>
                On the {example.label} at {money(example.priceMinor)}:{" "}
                <span className="font-semibold">{money(worked.depositMinor)}</span> deposit, then{" "}
                <span className="font-semibold">{money(worked.monthlyMinor)}</span> a month for {value.months}{" "}
                {value.months === 1 ? "month" : "months"}.
              </>
            ) : (
              <span className="text-slate-600">Price an option above to see what a buyer would pay.</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
