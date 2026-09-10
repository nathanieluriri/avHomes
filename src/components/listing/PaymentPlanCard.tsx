import type { Property } from "@/lib/types";
import { prototypeLabel } from "@/lib/data";
import { planLine, saleMoney } from "./estate-text";

/**
 * The plan in its own terms, then worked through on the cheapest option a
 * buyer can still take, because "30% over 12 months" means little until it is
 * a naira figure per month.
 */
export default function PaymentPlanCard({ property }: { property: Property }) {
  const plan = property.paymentPlan;
  if (!plan) return null;

  const priced = property.prototypes.filter((p) => p.priceMinor > 0);
  const pool = priced.some((p) => p.available) ? priced.filter((p) => p.available) : priced;
  const example = pool.reduce<(typeof pool)[number] | null>(
    (low, p) => (low === null || p.priceMinor < low.priceMinor ? p : low),
    null,
  );
  const note = plan.note.trim();

  return (
    <section aria-labelledby="payment-plan">
      <h2 id="payment-plan" className="text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
        Payment plan
      </h2>

      <div className="mt-5 overflow-hidden rounded-2xl border border-mist-200 bg-white">
        <div className="grid grid-cols-2 gap-px bg-mist-200">
          <div className="flex flex-col items-center justify-center gap-2 bg-white px-4 py-7 text-center">
            <div className="text-2xl font-bold leading-none tracking-tight text-plum-950 sm:text-3xl">
              {plan.depositPercent}%
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Deposit
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 bg-white px-4 py-7 text-center">
            <div className="text-2xl font-bold leading-none tracking-tight text-plum-950 sm:text-3xl">
              {plan.months} {plan.months === 1 ? "month" : "months"}
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              To pay the balance
            </div>
          </div>
        </div>

        {(example || note) && (
          <div className="space-y-2 border-t border-mist-200 bg-mist-50 px-5 py-4 sm:px-6">
            {example && (
              <p className="text-sm leading-relaxed text-plum-950/80">
                On the{" "}
                <span className="font-semibold text-plum-950">{prototypeLabel(example)}</span> at{" "}
                {saleMoney(example.priceMinor, property)}:{" "}
                {planLine(example.priceMinor, plan, property)}.
              </p>
            )}
            {note && <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
