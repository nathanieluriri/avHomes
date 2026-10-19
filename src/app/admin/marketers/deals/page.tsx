"use client";

import { useState } from "react";
import { Handshake, Percent } from "lucide-react";
import {
  DEAL_STATUS_LABEL,
  formatMoney,
  type Deal,
  type DealStatus,
  type PlanStanding,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced, useHoldsDomain } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { DEAL_TONE, type MarketingCounts } from "@/lib/admin/marketing";
import { Badge, Button, ButtonLink, EmptyState, ErrorNote, PageHeader, type Tone } from "@/components/admin/ui";
import { DataTable, IdCell, TableToolbar, type Column } from "@/components/admin/DataTable";
import { SoldStillListed } from "@/components/admin/SoldStillListed";

/**
 * Deals to check: the queue somebody works through every morning.
 *
 * Waiting first, because that is the only tab with anybody standing behind it.
 * The other four are history, and history is read by search rather than by
 * scrolling, which is why the search box is not tied to a tab.
 */

type Tab = DealStatus | "plans";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "plans", label: "Payment plans" },
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

interface PlanRow {
  deal: Deal;
  standing: PlanStanding;
}

const PLAN_STATE: Record<PlanStanding["state"], { label: string; tone: Tone }> = {
  overdue: { label: "Overdue", tone: "red" },
  "due-soon": { label: "Due soon", tone: "amber" },
  "on-track": { label: "On track", tone: "neutral" },
  paid: { label: "Paid", tone: "green" },
};

const waitingOn = (row: PlanRow) => row.deal.payments.filter((payment) => payment.status === "pending").length;

/** Payments to verify first, then whoever is behind, then the next to fall due. */
function planOrder(a: PlanRow, b: PlanRow): number {
  const rank = (row: PlanRow) =>
    waitingOn(row) > 0 ? 0 : row.standing.state === "overdue" ? 1 : row.standing.state === "due-soon" ? 2 : 3;
  return rank(a) - rank(b) || (a.standing.next?.dueOn ?? Infinity) - (b.standing.next?.dueOn ?? Infinity);
}

function matches(row: PlanRow, query: string): boolean {
  const q = query.toLowerCase();
  const { deal } = row;
  return [deal.listingTitle, deal.buyerName, deal.reporterName, deal.reporterCode].some((text) =>
    text.toLowerCase().includes(q),
  );
}

export default function DealsPage() {
  const decides = useHoldsDomain("marketing");
  const [tab, setTab] = useState<Tab>("pending");
  const [searchInput, setSearchInput] = useState("");
  const query = useDebounced(searchInput).trim();

  const { data, error, loading, reload } = useAsync<DealPage>(
    (signal) =>
      tab === "plans"
        ? Promise.resolve({ items: [], total: 0 })
        : api.get<DealPage>(
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

  const plans = useAsync<{ items: PlanRow[] }>(
    (signal) =>
      tab === "plans"
        ? api.get<{ items: PlanRow[] }>("/admin/marketing/plans", signal)
        : Promise.resolve({ items: [] }),
    [tab],
    { keepPrevious: true },
  );
  const planRows = (plans.data?.items ?? []).filter((row) => query === "" || matches(row, query)).sort(planOrder);
  const paymentsWaiting = counts?.counts.paymentsWaiting ?? 0;

  const claims = new Map<string, number>();
  for (const deal of everyStatus?.items ?? []) {
    if (deal.status !== "pending" && deal.status !== "approved") continue;
    claims.set(claimKey(deal), (claims.get(claimKey(deal)) ?? 0) + 1);
  }

  /* The open tab counts what it is actually showing, search included. Waiting
     carries the whole queue only while nothing is narrowing it, because a
     number that disagrees with the rows under it is worse than no number. */
  function countFor(value: Tab): number | undefined {
    if (value === "plans") return tab === "plans" && plans.data ? planRows.length : undefined;
    if (value === tab) return data?.total;
    if (value === "pending" && query === "") return counts?.counts.dealsWaiting;
    return undefined;
  }

  const rows = data?.items ?? [];

  const planColumns: Column<PlanRow>[] = [
    {
      key: "listing",
      header: "Listing",
      primary: true,
      thumb: false,
      render: ({ deal }) => (
        <IdCell title={deal.listingTitle || "Untitled listing"} meta={`Bought by ${deal.buyerName || "a buyer"}`} />
      ),
    },
    {
      key: "partner",
      header: "Partner",
      mobile: "tablet",
      render: ({ deal }) => (
        <span className="block min-w-0">
          <span className="block truncate text-plum-950">{deal.reporterName}</span>
          <span className="block truncate text-[12px] text-slate-600">{deal.reporterCode}</span>
        </span>
      ),
    },
    {
      key: "paid",
      header: "Paid",
      numeric: true,
      mobile: "keep",
      mobileLabel: "paid",
      render: ({ deal, standing }) => {
        const pct = deal.amountMinor > 0 ? Math.min(100, Math.round((standing.verifiedMinor / deal.amountMinor) * 100)) : 0;
        return (
          <span className="inline-block min-w-0 text-right">
            <span className="block">
              {formatMoney(standing.verifiedMinor, deal.currency)}{" "}
              <span className="text-slate-600">of {formatMoney(deal.amountMinor, deal.currency)}</span>
            </span>
            <span className="mt-1 hidden h-1 w-full overflow-hidden rounded-full bg-mist-100 md:block" aria-hidden="true">
              <span className="block h-full rounded-full bg-wine-600" style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "next",
      header: "Next payment",
      mobile: "keep",
      render: ({ deal, standing }) =>
        standing.next && standing.next.dueOn > 0 ? (
          <span className="text-slate-600">
            <span className="c-num text-plum-950">{formatMoney(standing.nextLeftMinor, deal.currency)}</span> on{" "}
            {shortDate(standing.next.dueOn)}
          </span>
        ) : (
          <span className="text-slate-600">All logged</span>
        ),
      card: ({ deal, standing }) =>
        standing.next && standing.next.dueOn > 0 ? (
          <>
            Next <span className="c-num text-plum-950">{formatMoney(standing.nextLeftMinor, deal.currency)}</span> on{" "}
            {shortDate(standing.next.dueOn)}
          </>
        ) : (
          "Every payment logged"
        ),
    },
    {
      key: "state",
      header: "Status",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (row) => {
        const waiting = waitingOn(row);
        const state = PLAN_STATE[row.standing.state];
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5 md:flex-nowrap">
            {waiting > 0 && <Badge tone="wine">{waiting === 1 ? "Payment to verify" : `${waiting} payments to verify`}</Badge>}
            <Badge tone={state.tone}>{state.label}</Badge>
            {row.deal.selfPurchase && <Badge tone="neutral">Partner purchase</Badge>}
          </span>
        );
      },
    },
  ];

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
            {deal.selfPurchase && <Badge tone="wine">Partner purchase</Badge>}
            {deal.plan && <Badge tone="neutral">Payment plan</Badge>}
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

  const toolbar = (
    <TableToolbar
      tabs={{
        value: tab,
        options: TABS.map((option) => ({
          value: option.value,
          label: option.label,
          count: countFor(option.value),
        })),
        onChange: (value) => setTab(value as Tab),
        spotlight: tab !== "pending" ? { value: "pending", name: "deal-find-waiting" } : undefined,
      }}
      search={{
        value: searchInput,
        placeholder: "Search deals",
        onChange: setSearchInput,
      }}
    />
  );

  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Deals to check"
        subtitle="Sales and rentals a marketer says they closed. Nothing is owed until one is approved."
        actions={
          decides && (
            <ButtonLink href="/admin/marketers/settings" variant="ghost">
              <Percent className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Commission
            </ButtonLink>
          )
        }
      />

      {/* Above the queue: an approved deal whose house is still advertised is the
          one thing here costing a buyer a wasted call today. */}
      {decides && <SoldStillListed />}

      {decides && paymentsWaiting > 0 && tab !== "plans" && (
        <section className="mb-4 flex flex-col gap-2 rounded-2xl border border-wine-100 bg-wine-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-wine-700">
            <span className="font-semibold">
              {paymentsWaiting} {paymentsWaiting === 1 ? "payment on a plan is" : "payments on plans are"} waiting to be verified.
            </span>{" "}
            Commission on each is paid once it is verified.
          </p>
          <Button variant="ghost" onClick={() => setTab("plans")}>
            See them
          </Button>
        </section>
      )}

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      {tab === "plans" && plans.error && (
        <div className="mb-4">
          <ErrorNote error={plans.error} onRetry={plans.reload} />
        </div>
      )}

      {tab === "plans" ? (
        <DataTable
          caption="Deals on payment plans still being paid"
          columns={planColumns}
          rows={planRows}
          rowKey={(row) => row.deal.id}
          hrefFor={(row) => `/admin/marketers/deals/${row.deal.id}`}
          loading={plans.loading}
          toolbar={toolbar}
          empty={
            <EmptyState
              bare
              icon={Handshake}
              title={query ? "Nothing matches that" : "No plan is still being paid"}
              hint={
                query
                  ? "Try the buyer's name, the partner's name or code, or part of the listing title."
                  : "Deals sold on a payment plan show here until the last payment is verified."
              }
            />
          }
          footer={
            <p className="text-[12px] text-slate-600">
              {planRows.length} {planRows.length === 1 ? "plan" : "plans"} still being paid. Open one to log or verify a
              payment.
            </p>
          }
        />
      ) : (
        <DataTable
          caption="Deals reported by marketers"
          columns={columns}
          rows={rows}
          rowKey={(deal) => deal.id}
          hrefFor={(deal) => `/admin/marketers/deals/${deal.id}`}
          rowSpotlight={(deal) => (deal === tutorialRow ? "deal-row" : undefined)}
          spotlight={settled && tab === "pending" && query === "" && rows.length === 0 ? "deal-none" : undefined}
          loading={loading}
          toolbar={toolbar}
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
      )}
    </>
  );
}
