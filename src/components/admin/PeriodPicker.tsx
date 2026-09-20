"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PERIOD_KEYS, PERIOD_LABEL, isPeriodKey, type PeriodKey } from "@avhomes/contracts";

/**
 * The period every analytics page shares.
 *
 * It writes the key to the URL rather than to local state, so a period survives a
 * refresh and a screen can be linked to somebody else already narrowed to the
 * window being discussed. "Look at last 7 days" is then a link rather than an
 * instruction.
 *
 * The filter row sits above the charts, which is where a reader looks for it.
 */
export function PeriodPicker({
  current,
  spotlight,
}: {
  current: PeriodKey;
  /** A tutorial anchor, rendered as `data-spotlight`. */
  spotlight?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(key: PeriodKey) {
    const next = new URLSearchParams(params.toString());
    next.set("period", key);
    /* `scroll: false`, because changing the window should re-read the figures
       under the reader's eye, not throw them back to the top of the page. */
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label="Period"
      data-spotlight={spotlight}
      /* Scrolls sideways on a phone rather than wrapping to two rows: six short
         chips wrapped mid-row read as two unrelated groups. */
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:px-0"
    >
      {PERIOD_KEYS.map((key) => {
        const on = key === current;
        return (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            aria-pressed={on}
            className={`c-tap shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              on
                ? "bg-plum-950 text-white"
                : "bg-white text-slate-600 shadow-card hover:text-plum-950"
            }`}
          >
            {PERIOD_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}

/** The period from the URL, or the default. One reader, so no page guesses. */
export function periodFromParams(params: URLSearchParams | null): PeriodKey {
  const raw = params?.get("period") ?? "";
  return isPeriodKey(raw) ? raw : "30d";
}
