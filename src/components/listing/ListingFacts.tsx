import { CalendarCheck, Clock, Sofa, Sparkles, type LucideIcon } from "lucide-react";
import type { Property } from "@/lib/types";
import { FURNISHING_LABELS, minStayLabel } from "@/lib/data";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A date already passed reads as now, the same as no date at all. */
function availableLabel(from: number | null, now: number = Date.now()): string {
  return from !== null && from > now ? `From ${DATE.format(from)}` : "Now";
}

// Tailwind only ships classes it can see written out.
const COLS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/**
 * A rental's terms: furnishing, serviced, when it is free, and the shortest let.
 * A term that was not stated is left out rather than printed as "Not stated".
 */
export function RentTerms({ property }: { property: Property }) {
  if (property.listingType !== "rent") return null;

  const terms: { label: string; value: string; icon: LucideIcon }[] = [];
  if (property.furnishing) {
    terms.push({ label: "Furnishing", value: FURNISHING_LABELS[property.furnishing], icon: Sofa });
  }
  if (property.serviced) {
    terms.push({ label: "Service", value: "Serviced", icon: Sparkles });
  }
  // Only a live let is free to move into; "Available now" on a let agreed would be false.
  if (property.status === "live") {
    terms.push({ label: "Available", value: availableLabel(property.availableFrom), icon: CalendarCheck });
  }
  if (property.minStay !== null) {
    terms.push({ label: "Stay", value: minStayLabel(property.minStay, property.rentPeriod), icon: Clock });
  }
  if (terms.length === 0) return null;

  return (
    <dl
      aria-label="Letting terms"
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-200 bg-mist-200 ${COLS[terms.length]}`}
    >
      {terms.map((term) => (
        // An odd last cell spans the row on mobile, so no grey hole shows beside it.
        <div
          key={term.label}
          className="flex items-center gap-3 bg-white px-4 py-5 sm:px-5 max-sm:[&:last-child:nth-child(odd)]:col-span-2"
        >
          <term.icon className="h-5 w-5 shrink-0 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {term.label}
            </dt>
            <dd className="mt-1 text-base font-semibold tracking-tight text-plum-950">{term.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
