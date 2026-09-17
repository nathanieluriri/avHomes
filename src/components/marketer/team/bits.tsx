"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { CommissionRates } from "@avhomes/contracts";

/**
 * Small pieces the team, invite, listings, account and help screens share and
 * the shared system does not have yet: a 3D object standing in the hero, the
 * hero's hint beside it, and the percent a rate is said as.
 */

/** "5%", "1.5%". */
export function pct(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

export function sameRates(a: CommissionRates, b: CommissionRates): boolean {
  return a.every((rate, i) => rate === b[i]);
}

/**
 * A 3D object at the right of an inner screen's hero, level with the title.
 * Decorative, and kept out of the hint's way by `HeroHint`.
 */
export function HeroArt({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-3 top-[calc(env(safe-area-inset-top,0px)+3.6rem)] [filter:drop-shadow(0_16px_18px_rgb(38_4_16/0.42))]"
    >
      {children}
    </span>
  );
}

/** The line under an inner title, stopping short of the hero art when there is some. */
export function HeroHint({ children, art = true }: { children: ReactNode; art?: boolean }) {
  return (
    <p
      className={`mt-1.5 max-w-[24rem] text-[14px] leading-relaxed text-white/75 ${art ? "pr-[5.5rem]" : ""}`}
    >
      {children}
    </p>
  );
}

/** A plain rule with a tick, for the lists of promises. */
export function RuleLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-(--m-good-bg) text-(--m-good-fg)"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 text-[14px] leading-relaxed text-m-text">{children}</span>
    </li>
  );
}
