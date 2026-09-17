"use client";

import { previewEarning, type MarketerBalance } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { DealsResponse, MeResponse } from "./api";

/**
 * What the deals being checked would pay this marketer if AV Homes approves
 * them. Null until it is known.
 *
 * `balance.pendingMinor` is the price of those deals, which is not the
 * marketer's money. This works the share out exactly as the Money screen's
 * "Being checked" tile does, so the two screens agree to the kobo: one rate for
 * sale and rent turns the total straight into a share, and different rates
 * need each deal's own kind. `load` holds that per deal read back until the
 * figure is actually on screen.
 */
export function useIfApproved(
  balance: MarketerBalance | null,
  rates: MeResponse["rates"] | null,
  load = true,
): number | null {
  const perDeal =
    balance !== null && rates !== null && rates.sale[0] !== rates.rent[0] && balance.pendingMinor > 0;
  const deals = useAsync(
    (signal) =>
      perDeal && load
        ? api.get<DealsResponse>("/marketing/deals?scope=mine", signal)
        : Promise.resolve(null),
    [perDeal && load],
  );

  if (balance === null || rates === null) return null;
  if (!perDeal) return previewEarning(balance.pendingMinor, rates.sale);
  if (deals.data) {
    return deals.data.items
      .filter((deal) => deal.status === "pending")
      .reduce((sum, deal) => sum + previewEarning(deal.amountMinor, rates[deal.listingType]), 0);
  }
  // After a failed deals read, the nearest honest figure, as on the Money screen.
  if (deals.error) return previewEarning(balance.pendingMinor, rates.sale);
  return null;
}
