"use client";

import { useState } from "react";
import { Handshake, Percent } from "lucide-react";
import {
  DEAL_STATUS_LABEL,
  formatMoney,
  type Deal,
  type DealStatus,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { DEAL_TONE, type MarketingCounts } from "@/lib/admin/marketing";
import { Badge, ButtonLink, EmptyState, ErrorNote, PageHeader } from "@/components/admin/ui";
import { DataTable, IdCell, TableToolbar, type Column } from "@/components/admin/DataTable";
import { SoldStillListed } from "@/components/admin/SoldStillListed";

/**
 * Deals to check: the queue somebody works through every morning.
 *
 * Waiting first, because that is the only tab with anybody standing behind it.
 * The other four are history, and history is read by search rather than by
 * scrolling, which is why the search box is not tied to a tab.
 */

const TABS: readonly { value: DealStatus; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not approved" },
  { value: "info", label: "Need info" },
  { value: "cancelled", label: "Cancelled" },
];

/** One listing, one unit. Two deals on this key are two people claiming a sale. */
function claimKey(deal: Deal): string {
  return `${deal.listingId}::${deal.unitKey}`;
}

interface DealPage {
  items: Deal[];
  total: number;
}

export default function DealsPage() {
  const [tab, setTab] = useState<DealStatus>("pending");
  const [searchInput, setSearchInput] = useState("");
  const query = useDebounced(searchInput).trim();

  const { data, error, loading, reload } = useAsync<DealPage>(
    (signal) =>
      api.get<DealPage>(
        `/admin/marketing/deals?${new URLSearchParams({
          status: tab,
          ...(query ? { q: query } : {}),
        })}`,
        signal,
      ),
    [tab, query],
    /* Hold the rows while the next tab loads. Blanking a long list to four
       skeleton rows clamps the scroller back to the top, so a tap on a status
       pill silently relocates whoever tapped it. */
    { keepPrevious: true },
  );

  /*
   * A second read, with no status on it, and it draws nothing on its own.
   *
   * The duplicate-claim badge has to notice an APPROVED deal sitting under a
   * pending one, and the filtered list above cannot see across its own tab. One
   * request per search term, reused by every tab, is cheaper than asking five
   * times. It inherits the endpoint's own 60 row cap, so on a very busy month
   * the badge is a warning rather than a census; the deal screen itself reads
   * the authoritative list.
   */
  const { data: everyStatus } = useAsync<DealPage>(
    (signal) =>
      api.get<DealPage>(
        `/admin/marketing/deals${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        signal,
      ),
    [query],
    { keepPrevious: true },
  );

  const { data: counts } = useAsync<{ counts: MarketingCounts }>(
    (signal) => api.get<{ counts: MarketingCounts }>("/admin/marketing/counts", signal),
    [],
  );

  const claims = new Map<string, number>();
  for (const deal of everyStatus?.items ?? []) {
    if (deal.status !== "pending" && deal.status !== "approved") continue;
    claims.set(claimKey(deal), (claims.get(claimKey(deal)) ?? 0) + 1);
  }

  /* The open tab counts what it is actually showing, search included. Waiting
     carries the whole queue only while nothing is narrowing it, because a
     number that disagrees with the rows under it is worse than no number. */
  function countFor(value: DealStatus): number | undefined {
    if (value === tab) return data?.total;
    if (value === "pending" && query === "") return counts?.counts.dealsWaiting;
    return undefined;
  }

  const rows = data?.items ?? [];

  /* The check-a-deal walkthrough opens the first deal still waiting, and says so
     when there is none. Never while loading: the rows held over from the last tab
     are not waiting deals. */
  const settled = !loading && !error && Boolean(data);
  const tutorialRow = settled && tab === "pending" ? rows[0] : undefined;

  const columns: Column<Deal>[] = [
    {
      key: "listing",
      header: "Listing",
      primary: true,
      // No photograph on a deal row. The proof shots are of a receipt, not the house.
      thumb: false,
      render: (deal) => (
        <IdCell
          title={deal.listingTitle || "Untitled listing"}
          meta={
            [deal.unitKey, deal.listingEstate, deal.listingLocation].filter(Boolean).join(" · ") ||
            (deal.listingType === "rent" ? "Rental" : "Sale")
          }
        />
      ),
    },
    {
      key: "marketer",
      header: "Marketer",
      mobile: "keep",
      render: (deal) => (
        <span className="block min-w-0">
          <span className="block truncate text-plum-950">{deal.reporterName}</span>
          <span className="block truncate text-[12px] text-slate-600">{deal.reporterCode}</span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      mobile: "keep",
      render: (deal) => formatMoney(deal.amountMinor, deal.currency),
    },
    {
      key: "reported",
      header: "Reported",
      mobile: "tablet",
      render: (deal) => <span className="text-slate-600">{shortDate(deal.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (deal) => {
        const claimed = claims.get(claimKey(deal)) ?? 0;
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5 md:flex-nowrap">
            <Badge tone={DEAL_TONE[deal.status]}>{DEAL_STATUS_LABEL[deal.status]}</Badge>
            {/* Louder than the status beside it, on purpose. Two people claiming
                one sale is the failure this queue exists to catch, and it is the
                one thing on the row that has to be read before the row is
                opened. */}
            {claimed > 1 && <Badge tone="red">{claimed} claims</Badge>}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Deals to check"
        subtitle="Sales and rentals a marketer says they closed. Nothing is owed until one is approved."
        actions={
          <ButtonLink href="/admin/marketers/settings" variant="ghost">
            <Percent className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Commission
          </ButtonLink>
        }
      />

      {/* Above the queue: an approved deal whose house is still advertised is the
          one thing here costing a buyer a wasted call today. */}
      <SoldStillListed />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Deals reported by marketers"
        columns={columns}
        rows={rows}
        rowKey={(deal) => deal.id}
        hrefFor={(deal) => `/admin/marketers/deals/${deal.id}`}
        rowSpotlight={(deal) => (deal === tutorialRow ? "deal-row" : undefined)}
        spotlight={settled && tab === "pending" && query === "" && rows.length === 0 ? "deal-none" : undefined}
        loading={loading}
        toolbar={
          <TableToolbar
            tabs={{
              value: tab,
              options: TABS.map((option) => ({
                value: option.value,
                label: option.label,
                count: countFor(option.value),
              })),
              onChange: (value) => setTab(value as DealStatus),
              spotlight: tab !== "pending" ? { value: "pending", name: "deal-find-waiting" } : undefined,
            }}
            search={{
              value: searchInput,
              placeholder: "Search deals",
              onChange: setSearchInput,
            }}
          />
        }
        empty={
          <EmptyState
            bare
            icon={Handshake}
            title={query ? "Nothing matches that" : "Nothing here"}
            hint={
              query
                ? "Try the marketer's name, their code, or part of the listing title."
                : tab === "pending"
                  ? "Every reported deal has been dealt with."
                  : "No deal has landed in this state yet."
            }
          />
        }
        footer={
          <p className="text-[12px] text-slate-600">
            {rows.length === (data?.total ?? 0)
              ? `${rows.length} ${rows.length === 1 ? "deal" : "deals"}`
              : `Showing ${rows.length} of ${data?.total ?? 0}. Search to narrow it.`}
          </p>
        }
      />
    </>
  );
}
