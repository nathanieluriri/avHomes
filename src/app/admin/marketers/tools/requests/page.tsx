"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import type { MerchRequest, MerchRequestStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { Badge, Button, ConfirmButton, EmptyState, ErrorNote, type Tone } from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";
import { ToolsHeader } from "@/components/admin/tools/ToolsTabs";

const STATUS: Record<MerchRequestStatus, { label: string; tone: Tone }> = {
  requested: { label: "Waiting", tone: "amber" },
  sent: { label: "Sent", tone: "green" },
  declined: { label: "Declined", tone: "neutral" },
};

export default function MerchRequestsPage() {
  const { data, loading, error, reload } = useAsync(
    (signal) => api.get<{ items: MerchRequest[] }>("/admin/marketing/merch-requests", signal),
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const rows = data?.items ?? [];
  const waiting = rows.filter((r) => r.status === "requested").length;

  async function settle(id: string, status: "sent" | "declined") {
    setBusy(id);
    setActionError(null);
    try {
      await api.patch(`/admin/marketing/merch-requests/${id}`, { status });
      reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<MerchRequest>[] = [
    {
      key: "who",
      header: "Partner",
      primary: true,
      render: (r) => (
        <IdCell
          title={`${r.marketerName} · ${r.marketerCode}`}
          meta={[r.itemName, r.size && `Size ${r.size}`, r.note].filter(Boolean).join(" · ")}
        />
      ),
    },
    { key: "phone", header: "Phone", mobile: "tablet", render: (r) => <span className="text-slate-600">{r.marketerPhone || "Not given"}</span> },
    { key: "when", header: "Asked", tight: true, mobile: "tablet", render: (r) => shortDate(r.createdAt) },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      render: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>,
    },
    { key: "actions", header: "Actions", tight: true, render: (r) => <Actions row={r} /> },
  ];

  function Actions({ row }: { row: MerchRequest }) {
    if (row.status !== "requested") {
      return <span className="text-[12px] text-slate-500">{row.handledByName ? `By ${row.handledByName}` : ""}</span>;
    }
    return (
      <span className="inline-flex items-center gap-1">
        <ConfirmButton variant="ghost" size="sm" confirmLabel="Yes, decline" onConfirm={() => void settle(row.id, "declined")} disabled={busy !== null}>
          Decline
        </ConfirmButton>
        <Button size="sm" onClick={() => void settle(row.id, "sent")} disabled={busy !== null}>
          {busy === row.id ? "Saving" : "Mark sent"}
        </Button>
      </span>
    );
  }

  return (
    <>
      <ToolsHeader
        subtitle={
          waiting > 0
            ? `${waiting} partner${waiting === 1 ? " is" : "s are"} waiting for merch. Marking one sent tells them on their phone.`
            : "Merch partners asked for. Marking one sent tells them on their phone."
        }
      />
      {(error || actionError) && (
        <div className="mb-4">
          <ErrorNote error={(error ?? actionError)!} onRetry={error ? reload : undefined} />
        </div>
      )}
      <DataTable
        caption="Merch requests"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowAction={(r) => <Actions row={r} />}
        loading={loading}
        empty={error ? null : <EmptyState bare icon={PackageCheck} title="No requests yet" hint="Partners ask for merch from Tools in the partner app." />}
      />
    </>
  );
}
