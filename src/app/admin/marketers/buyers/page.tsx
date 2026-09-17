"use client";

import { useState } from "react";
import { UserRoundSearch } from "lucide-react";
import {
  LEAD_STATE_LABEL,
  leadWantLine,
  type Lead,
  type LeadState,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { relative } from "@/lib/admin/format";
import { LEAD_TONE } from "@/lib/admin/marketing";
import { Badge, EmptyState, ErrorNote, PageHeader } from "@/components/admin/ui";
import { DataTable, IdCell, TableToolbar, type Column } from "@/components/admin/DataTable";

/**
 * Potential buyers marketers have handed over.
 *
 * `new` first, because it is the only state with a person waiting for a phone
 * call that nobody has made yet. The rest are work in progress and history, and
 * both are reached by search rather than by scrolling, which is why the search
 * box is not tied to a tab.
 */

const TABS: readonly { value: LeadState | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "meeting", label: "Meeting" },
  { value: "viewed", label: "Viewed" },
  { value: "offer", label: "Offer" },
  { value: "won", label: "Bought" },
  { value: "lost", label: "Closed" },
  { value: "all", label: "Everything" },
];

interface LeadPage {
  items: Lead[];
  total: number;
  counts: Partial<Record<LeadState, number>>;
}

export default function BuyersPage() {
  const [tab, setTab] = useState<LeadState | "all">("new");
  const [searchInput, setSearchInput] = useState("");
  const query = useDebounced(searchInput).trim();

  const { data, error, loading, reload } = useAsync<LeadPage>(
    (signal) =>
      api.get<LeadPage>(
        `/admin/marketing/leads?${new URLSearchParams({
          ...(tab === "all" ? {} : { state: tab }),
          ...(query ? { q: query } : {}),
        })}`,
        signal,
      ),
    [tab, query],
    /* Hold the rows while the next tab loads, so a tap on a state pill does not
       clamp a long list back to the top under whoever tapped it. */
    { keepPrevious: true },
  );

  const rows = data?.items ?? [];

  /* The open tab counts what it is showing. Every other tab shows its own total
     only while nothing is narrowing it: a number that disagrees with the rows
     under it is worse than no number at all. */
  function countFor(value: LeadState | "all"): number | undefined {
    if (value === tab) return data?.total;
    if (query !== "" || value === "all") return undefined;
    return data?.counts[value];
  }

  const columns: Column<Lead>[] = [
    {
      key: "buyer",
      header: "Buyer",
      primary: true,
      thumb: false,
      render: (lead) => <IdCell title={lead.buyerName} meta={lead.buyerPhone} />,
    },
    {
      key: "wants",
      header: "Looking for",
      render: (lead) => <span className="block truncate text-slate-600">{leadWantLine(lead)}</span>,
    },
    {
      key: "from",
      header: "Sent by",
      mobile: "keep",
      render: (lead) => (
        <span className="block min-w-0">
          <span className="block truncate text-plum-950">{lead.reporterName}</span>
          <span className="block truncate text-[12px] text-slate-600">{lead.reporterCode}</span>
        </span>
      ),
    },
    {
      key: "moved",
      header: "Last move",
      mobile: "tablet",
      /* `relative` already degrades to a date past a week, so a second line
         holding the date repeats itself for every row older than that. */
      render: (lead) => <span className="text-slate-600">{relative(lead.updatedAt)}</span>,
    },
    {
      key: "state",
      header: "State",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (lead) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 md:flex-nowrap">
          <Badge tone={LEAD_TONE[lead.state]}>{LEAD_STATE_LABEL[lead.state]}</Badge>
          {lead.state === "won" && lead.dealId && <Badge tone="green">Deal</Badge>}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={UserRoundSearch}
        title="Potential buyers"
        subtitle="People marketers introduced. Call them, move them along, and say why each time."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Potential buyers sent in by marketers"
        columns={columns}
        rows={rows}
        rowKey={(lead) => lead.id}
        hrefFor={(lead) => `/admin/marketers/buyers/${lead.id}`}
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
              onChange: (value) => setTab(value as LeadState | "all"),
            }}
            search={{
              value: searchInput,
              placeholder: "Search buyers",
              onChange: setSearchInput,
            }}
          />
        }
        empty={
          <EmptyState
            bare
            icon={UserRoundSearch}
            title={query ? "Nothing matches that" : "Nothing here"}
            hint={
              query
                ? "Try the buyer's name, their number, or the marketer who sent them."
                : tab === "new"
                  ? "Every new buyer has been picked up."
                  : "No buyer has reached this state yet."
            }
          />
        }
        footer={
          <p className="text-[12px] text-slate-600">
            {rows.length === (data?.total ?? 0)
              ? `${rows.length} ${rows.length === 1 ? "buyer" : "buyers"}`
              : `Showing ${rows.length} of ${data?.total ?? 0}. Search to narrow it.`}
          </p>
        }
      />
    </>
  );
}
