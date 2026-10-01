"use client";

import Link from "next/link";
import { DEAL_STATUS_LABEL, formatMoney, type Deal } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { shortDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import { DEAL_TONE } from "@/lib/admin/marketing";
import { Badge, Card, CardHead } from "../ui";

/** Every sale or let recorded against this listing: who, which unit, how much, and where it stands. */
export function ListingSales({
  listingId,
  unitName,
  version,
}: {
  listingId: string;
  unitName: (key: string) => string | null;
  /** Bumped by the caller to re-read after the listing changes. */
  version: unknown;
}) {
  const sales = useAsync<{ items: Deal[] }>(
    (signal) =>
      api.get<{ items: Deal[] }>(`/admin/marketing/deals?listingId=${encodeURIComponent(listingId)}`, signal),
    [listingId, version],
  );
  const items = sales.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="space-y-3">
      <CardHead title="Sales" />
      <ul className="divide-y divide-mist-100">
        {items.map((deal) => {
          const unit = deal.unitKey ? unitName(deal.unitKey) : null;
          return (
            <li key={deal.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link href={`/admin/marketers/deals/${deal.id}`} className="block text-[13px] hover:underline">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-plum-950">{formatMoney(deal.amountMinor, deal.currency)}</span>
                  <Badge tone={DEAL_TONE[deal.status]}>{DEAL_STATUS_LABEL[deal.status]}</Badge>
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  {[
                    shortDate(deal.closedOn),
                    unit ?? (deal.unitKey ? "A removed unit" : null),
                    deal.buyerName ? `to ${deal.buyerName}` : null,
                    deal.closerName ? `by ${deal.closerName}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
