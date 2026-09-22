"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney, type AwaitingClose } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { relative } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import { Button, ErrorNote } from "./ui";

/**
 * Sold through an approved deal and still advertised, each with its own way down.
 *
 * Where the "still on the market" alert sends people. Drawn only while there is
 * something in it, so a clean day costs this screen nothing. Taking one down
 * writes no money: the commission and both fund shares were written when the
 * deal was approved.
 */
export function SoldStillListed() {
  const state = useAsync(
    (signal) => api.get<{ items: AwaitingClose[] }>("/admin/marketing/awaiting-close", signal),
    [],
  );
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const items = state.data?.items ?? [];
  if (items.length === 0) return null;

  async function takeDown(dealId: string) {
    setClosing(dealId);
    setError(null);
    try {
      await api.post(`/admin/marketing/deals/${encodeURIComponent(dealId)}/close-listing`);
      state.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setClosing(null);
    }
  }

  return (
    <section
      data-spotlight="sold-still-listed"
      aria-labelledby="sold-still-listed-title"
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <h2 id="sold-still-listed-title" className="text-[13px] font-semibold text-amber-900">
        Sold, but still on the market
      </h2>
      <p className="mt-0.5 text-[12px] leading-relaxed text-amber-900/90">
        The money for each of these is on the record and everybody has been paid. The site still shows
        {items.length === 1 ? " it" : " them"}, so buyers are still enquiring.
      </p>
      {error && (
        <div className="mt-2">
          <ErrorNote error={error} />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.dealId}
            className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 shadow-card sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <Link
                href={`/admin/properties/${item.listingId}`}
                className="block truncate text-[13px] font-semibold text-plum-950 hover:underline"
              >
                {item.listingTitle || "A listing"}
              </Link>
              <p className="text-[12px] text-slate-600">
                {item.kind === "rent" ? "Let" : "Sold"} by {item.closerName || "a marketer"} for{" "}
                <span className="c-num">{formatMoney(item.amountMinor, item.currency)}</span> · approved{" "}
                {relative(item.approvedAt)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => void takeDown(item.dealId)}
              disabled={closing !== null}
              className="shrink-0"
            >
              {closing === item.dealId ? "Taking it down..." : "Take it off the market"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
