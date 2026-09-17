"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { MarketerBalance } from "@avhomes/contracts";
import { payDayLabel } from "@/lib/marketer/api";
import { Money, Skeleton } from "./ui";

/**
 * The one figure this whole app exists to show.
 *
 * Waiting money is the headline because it is the number a marketer opens the
 * app to check. The two beneath it are context, not competition: half the size,
 * grey label above, so a glance lands on the big one first every time.
 *
 * Scheduled money gets its own line rather than being folded into the headline.
 * Money that is already inside an open pay run is a different promise from money
 * still waiting for one, and merging them would let a figure fall on pay day
 * with no explanation.
 */
export function MoneyCard({
  balance,
  href,
  className = "",
}: {
  balance: MarketerBalance;
  /** Makes the whole card a way into the money screen. */
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-600">Waiting for pay day</p>
        {href && <ChevronRight className="h-4 w-4 shrink-0 text-mist-400" aria-hidden />}
      </div>

      <p className="mt-2 text-plum-950">
        <Money minor={balance.waitingMinor} currency={balance.currency} size="hero" animate />
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
        {balance.scheduledMinor > 0 ? (
          <>
            <span className="font-semibold text-wine-700">
              <Money minor={balance.scheduledMinor} currency={balance.currency} size="sm" /> is on
              the way
            </span>
            . The rest goes out on {payDayLabel()}.
          </>
        ) : (
          <>We send this on {payDayLabel()}.</>
        )}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-mist-100 pt-4">
        <div>
          <p className="text-[12px] font-semibold text-slate-550">Being checked</p>
          <p className="mt-1 text-plum-950">
            <Money minor={balance.pendingMinor} currency={balance.currency} size="md" />
          </p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-slate-550">Paid so far</p>
          <p className="mt-1 text-plum-950">
            <Money minor={balance.paidMinor} currency={balance.currency} size="md" />
          </p>
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`m-card m-card--lg m-press m-press-light block p-5 ${className}`}>
        {body}
      </Link>
    );
  }
  return <div className={`m-card m-card--lg p-5 ${className}`}>{body}</div>;
}

/** The same card before the numbers land, at the same height so nothing jumps. */
export function MoneyCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`m-card m-card--lg p-5 ${className}`}>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-3 h-10 w-52" />
      <Skeleton className="mt-3 h-3.5 w-44" />
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-mist-100 pt-4">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-5 w-20" />
        </div>
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-5 w-24" />
        </div>
      </div>
    </div>
  );
}
