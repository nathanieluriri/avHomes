"use client";

import { useState } from "react";
import { Percent, ShieldCheck, UsersRound } from "lucide-react";
import { MARKETER_STATUSES, type Marketer } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { initials } from "@/lib/admin/format";
import {
  MARKETER_ADMIN_LABEL,
  MARKETER_TONE,
  bankLine,
  joinedOn,
  type MarketingCounts,
} from "@/lib/admin/marketing";
import { Badge, ButtonLink, EmptyState, ErrorNote, PageHeader } from "@/components/admin/ui";
import { DataTable, IdCell, TableToolbar, type Column } from "@/components/admin/DataTable";

/**
 * Everyone selling.
 *
 * The columns are what the list endpoint actually answers with. A person's team
 * size, what they have earned and what they have been paid are three different
 * aggregations over three collections, and the list route does not run them, so
 * they live on the record itself rather than being invented here from a number
 * that would be wrong.
 */

const TABS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...MARKETER_STATUSES.map((status) => ({
    value: status,
    label: MARKETER_ADMIN_LABEL[status],
  })),
];

interface MarketerPage {
  items: Marketer[];
  total: number;
}

export default function MarketersPage() {
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const query = useDebounced(searchInput).trim();

  const { data, error, loading, reload } = useAsync<MarketerPage>(
    (signal) =>
      api.get<MarketerPage>(
        `/admin/marketing/marketers?${new URLSearchParams({
          ...(status ? { status } : {}),
          ...(query ? { q: query } : {}),
        })}`,
        signal,
      ),
    [status, query],
    { keepPrevious: true },
  );

  const { data: counts } = useAsync<{ counts: MarketingCounts }>(
    (signal) => api.get<{ counts: MarketingCounts }>("/admin/marketing/counts", signal),
    [],
  );

  const rows = data?.items ?? [];

  const columns: Column<Marketer>[] = [
    {
      key: "person",
      header: "Marketer",
      primary: true,
      render: (marketer) => (
        <IdCell
          thumb={
            <span className="text-[11px] font-bold">{initials(marketer.displayName, "AV")}</span>
          }
          title={marketer.displayName || "No name"}
          meta={marketer.code}
          trailing={
            marketer.isAdmin ? (
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 text-slate-550"
                aria-label="Also holds a console account"
              />
            ) : null
          }
        />
      ),
    },
    {
      key: "contact",
      header: "Contact",
      mobile: "tablet",
      render: (marketer) => (
        <span className="block min-w-0">
          <span className="block truncate text-slate-600">{marketer.email}</span>
          <span className="block truncate text-[12px] text-slate-550">
            {[marketer.phone, marketer.state].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "bank",
      header: "Bank",
      mobile: "tablet",
      render: (marketer) =>
        marketer.bank ? (
          <span className="text-slate-600">{bankLine(marketer.bank)}</span>
        ) : (
          <Badge tone="amber">No bank account</Badge>
        ),
    },
    {
      key: "joined",
      header: "Joined",
      mobile: "keep",
      render: (marketer) => (
        <span className="text-slate-600">{joinedOn(marketer.joinedAt)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (marketer) => (
        <Badge tone={MARKETER_TONE[marketer.status]}>
          {MARKETER_ADMIN_LABEL[marketer.status]}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={UsersRound}
        title="Marketers"
        subtitle={
          counts
            ? `${counts.counts.marketersActive} active. Open anyone to see their team, their deals and their money.`
            : "Everyone selling, and the people they brought in."
        }
        actions={
          <ButtonLink href="/admin/marketers/settings" variant="ghost">
            <Percent className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Commission
          </ButtonLink>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Marketers"
        columns={columns}
        rows={rows}
        rowKey={(marketer) => marketer.id}
        hrefFor={(marketer) => `/admin/marketers/${marketer.id}`}
        loading={loading}
        toolbar={
          <TableToolbar
            tabs={{
              value: status,
              options: TABS.map((option) => ({
                value: option.value,
                label: option.label,
                count: option.value === status ? data?.total : undefined,
              })),
              onChange: setStatus,
            }}
            search={{
              value: searchInput,
              placeholder: "Search marketers",
              onChange: setSearchInput,
            }}
          />
        }
        empty={
          <EmptyState
            bare
            icon={UsersRound}
            title={query ? "Nobody matches that" : "No marketers yet"}
            hint={
              query
                ? "Try their code, such as AV-0042, or the number they signed up with."
                : "People join from the sign up link. Commission has the switch that opens and closes it."
            }
            action={
              query ? undefined : (
                <ButtonLink href="/admin/marketers/settings" variant="ghost">
                  Open Commission
                </ButtonLink>
              )
            }
          />
        }
        footer={
          <p className="text-[12px] text-slate-600">
            {rows.length === (data?.total ?? 0)
              ? `${rows.length} ${rows.length === 1 ? "marketer" : "marketers"}`
              : `Showing ${rows.length} of ${data?.total ?? 0}. Search to narrow it.`}
          </p>
        }
      />
    </>
  );
}
