"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { trendOf, type Trend } from "@avhomes/contracts";

/**
 * One number, its label, and the scope it is true of.
 *
 * Extracted from `PulseStrip`, which had this shape inlined twice, so the
 * dashboard's tiles and the six analytics pages render one object rather than
 * six near-copies that drift.
 *
 * THE SCOPE IS A PROP, NOT A TOOLTIP, and that is the whole reason it exists.
 * A tooltip does not exist on a touch screen, so a figure whose definition lives
 * in a `title` attribute is undefined for every reader on a phone. It renders
 * under the value, always.
 */
export function StatTile({
  label,
  value,
  scope,
  trend,
  tone = "plain",
  onClick,
  expanded,
  controls,
  spotlight,
}: {
  label: string;
  /** Already formatted. This component never decides how money reads. */
  value: string;
  /** The period or population the figure is true of. Rendered, not hinted. */
  scope: string;
  /**
   * Null means there was nothing to compare against, and the tile says so rather
   * than drawing an arrow. Omit entirely for a figure a trend makes no sense of.
   */
  trend?: Trend | undefined;
  /** `quiet` for a supporting figure beside a headline one. */
  tone?: "plain" | "quiet";
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  /** A tutorial anchor, rendered as `data-spotlight`. */
  spotlight?: string;
}) {
  const body = (
    <>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      <span
        className={`c-num mt-0.5 block font-semibold text-plum-950 ${
          tone === "quiet" ? "text-[15px]" : "text-[19px]"
        }`}
      >
        {value}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[11px] text-slate-550">{scope}</span>
        {trend !== undefined && <TrendNote trend={trend} />}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div data-spotlight={spotlight} className="min-w-0 rounded-xl bg-white p-3 shadow-card">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-spotlight={spotlight}
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      /* A real button, because the disclosure has to be announced rather than
         implied by a chevron somebody cannot reach with a keyboard. */
      className={`c-tap min-w-0 rounded-xl bg-white p-3 text-left shadow-card transition-colors ${
        expanded ? "bg-mist-100" : "hover:bg-mist-50"
      }`}
    >
      {body}
      <ChevronDown
        aria-hidden
        className={`mt-1 h-3.5 w-3.5 text-slate-550 transition-transform ${
          expanded ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

/**
 * The comparison, or an honest refusal to make one.
 *
 * `null` is not zero. A rise from nothing is not a percentage, and printing one is
 * how a dashboard starts lying on its first day of use.
 */
function TrendNote({ trend }: { trend: Trend }) {
  if (trend === null) {
    return <span className="text-[11px] text-slate-550">first in this window</span>;
  }
  return (
    <span
      className={`text-[11px] font-semibold ${trend.up ? "text-emerald-700" : "text-red-600"}`}
    >
      {/* An arrow AND a sign, so the direction is not carried by colour alone. */}
      {trend.up ? "▲" : "▼"} {trend.pct}%
    </span>
  );
}

/** The tile row every analytics page opens with. At most four; see the UX rules. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
  );
}

export { trendOf };
