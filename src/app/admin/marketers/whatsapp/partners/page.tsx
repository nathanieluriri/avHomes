"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import type { WhatsappPartnerRow, WhatsappReport } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { relative, shortDate } from "@/lib/admin/format";
import { WhatsappHeader, partnerLink } from "@/components/admin/whatsapp/WhatsappTabs";
import { Badge, EmptyState, ErrorNote, IconButton, inputClass } from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

type Filter = "all" | "waiting" | "joined" | "not-invited";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "waiting", label: "Invited, not joined" },
  { value: "joined", label: "Joined" },
  { value: "not-invited", label: "Not invited" },
];

function matches(row: WhatsappPartnerRow, filter: Filter): boolean {
  if (filter === "waiting") return row.invitedAt !== null && row.joinedAt === null;
  if (filter === "joined") return row.joinedAt !== null;
  if (filter === "not-invited") return row.invitedAt === null;
  return true;
}

export default function WhatsappPartnersPage() {
  return (
    <Suspense fallback={null}>
      <Partners />
    </Suspense>
  );
}

function Partners() {
  const params = useSearchParams();
  const initial = (FILTERS.find((f) => f.value === params.get("filter"))?.value ?? "all") as Filter;
  const [filter, setFilter] = useState<Filter>(initial);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(
    (signal) => api.get<WhatsappReport>("/admin/marketing/whatsapp", signal),
    [],
  );

  const counts = useMemo(() => {
    const rows = data?.partners ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.value, rows.filter((r) => matches(r, f.value)).length])) as Record<Filter, number>;
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.partners ?? []).filter(
      (row) => matches(row, filter) && (q === "" || row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q)),
    );
  }, [data, filter, query]);

  async function copy(row: WhatsappPartnerRow) {
    await navigator.clipboard?.writeText(partnerLink(row.code)).catch(() => {});
    setCopied(row.marketerId);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const columns: Column<WhatsappPartnerRow>[] = [
    { key: "partner", header: "Partner", primary: true, render: (row) => <IdCell title={row.name} meta={row.code} /> },
    {
      key: "status",
      header: "Status",
      mobile: "keep",
      badge: true,
      render: (row) =>
        row.joinedAt ? (
          <Badge tone="green">Joined {shortDate(row.joinedAt)}</Badge>
        ) : row.invitedAt ? (
          <Badge tone="amber">Invited {shortDate(row.invitedAt)}</Badge>
        ) : (
          <Badge tone="neutral">Not invited</Badge>
        ),
    },
    {
      key: "forwards",
      header: "Forwarded opens",
      tight: true,
      mobile: "keep",
      render: (row) => <span className="c-num font-semibold text-plum-950">{row.forwardClicks}</span>,
    },
    {
      key: "people",
      header: "People reached",
      tight: true,
      mobile: "tablet",
      render: (row) => <span className="c-num text-slate-600">{row.forwardPeople}</span>,
    },
    {
      key: "last",
      header: "Last open",
      mobile: "tablet",
      render: (row) => <span className="text-slate-600">{row.lastClickAt ? relative(row.lastClickAt) : "Never"}</span>,
    },
    {
      key: "link",
      header: "Their link",
      tight: true,
      render: (row) => (
        <IconButton
          size="dense"
          label={copied === row.marketerId ? `Copied ${row.name}'s link` : `Copy ${row.name}'s link`}
          icon={copied === row.marketerId ? Check : Copy}
          onClick={() => void copy(row)}
        />
      ),
    },
  ];

  return (
    <>
      <WhatsappHeader subtitle="Every active partner, whether they have been invited and opened the group, and how far their link travelled." />

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div role="tablist" aria-label="Filter partners" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`c-tap h-8 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                filter === f.value ? "bg-plum-950 text-white" : "text-slate-600 hover:bg-mist-200/60"
              }`}
            >
              {f.label}
              {data && <span className={`ml-1.5 ${filter === f.value ? "text-white/70" : "text-slate-400"}`}>{counts[f.value]}</span>}
            </button>
          ))}
        </div>
        <label className="lg:ml-auto lg:w-72">
          <span className="sr-only">Search partners</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or code"
            className={inputClass}
          />
        </label>
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}

      <DataTable
        caption="Partners and the WhatsApp group"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.marketerId}
        loading={loading}
        empty={
          error ? null : (
            <EmptyState
              bare
              title={query ? "Nobody matches that search" : "Nobody here"}
              hint={filter === "waiting" ? "Every invited partner has opened the group." : "Try another filter."}
            />
          )
        }
      />
    </>
  );
}
