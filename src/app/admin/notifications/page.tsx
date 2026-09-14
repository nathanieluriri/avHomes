"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatBytes, type AppNotification, type QuotaRequest } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { StorageQuota } from "@/components/admin/StorageQuota";
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Skeleton, inputClass } from "@/components/admin/ui";

interface NotificationList {
  items: AppNotification[];
  unread: number;
}

const GB = 1024 * 1024 * 1024;

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function NotificationsPage() {
  const list = useAsync<NotificationList>((signal) => api.get<NotificationList>("/admin/notifications", signal), [], {
    keepPrevious: true,
  });
  const requests = useAsync<{ items: QuotaRequest[] }>(
    (signal) => api.get<{ items: QuotaRequest[] }>("/admin/images/quota/requests", signal),
    [],
    { keepPrevious: true },
  );
  const [quotaKey, setQuotaKey] = useState(0);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const items = list.data?.items ?? [];
  const pending = (requests.data?.items ?? []).filter((r) => r.status === "pending");

  async function markAll() {
    try {
      await api.post("/admin/notifications/read-all", {});
      list.reload();
      window.dispatchEvent(new Event("avhomes:notifications-read"));
    } catch (err) {
      setActionError(asApiError(err));
    }
  }

  async function markRead(n: AppNotification) {
    if (n.readAt) return;
    try {
      await api.post(`/admin/notifications/${n.id}/read`, {});
      list.reload();
      window.dispatchEvent(new Event("avhomes:notifications-read"));
    } catch {
      // Read state is a convenience; the link still opens.
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        icon={Bell}
        subtitle={
          list.data
            ? list.data.unread === 0
              ? "All caught up."
              : `${list.data.unread} unread.`
            : "Storage requests from the owner and activity on customize notes."
        }
        actions={
          list.data && list.data.unread > 0 ? (
            <Button variant="ghost" onClick={() => void markAll()}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <StorageQuota refreshKey={quotaKey} />

      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}

      {pending.map((request) => (
        <QuotaDecision
          key={request.id}
          request={request}
          onDone={() => {
            requests.reload();
            setQuotaKey((k) => k + 1);
          }}
        />
      ))}

      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {list.data && items.length === 0 && (
        <EmptyState title="Nothing yet" hint="Storage requests and customize notes will show up here." />
      )}

      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.href}
              onClick={() => void markRead(n)}
              className={`block rounded-xl border px-4 py-3 transition-colors hover:border-wine-500 ${
                n.readAt ? "border-mist-200 bg-white" : "border-wine-200 bg-wine-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {!n.readAt && <Badge tone="wine">New</Badge>}
                <p className="text-sm font-semibold text-plum-950 [overflow-wrap:anywhere]">{n.title}</p>
              </div>
              <p className="mt-1 line-clamp-3 text-[13px] text-slate-600 [overflow-wrap:anywhere]">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function QuotaDecision({ request, onDone }: { request: QuotaRequest; onDone: () => void }) {
  const [sizeGb, setSizeGb] = useState(String(Math.round((request.requestedBytes / GB) * 10) / 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function decide(decision: "approve" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const limitBytes = Math.round(Number(sizeGb) * GB);
      await api.patch(`/admin/images/quota/requests/${request.id}`, {
        decision,
        ...(decision === "approve" && Number.isFinite(limitBytes) && limitBytes > 0 ? { limitBytes } : {}),
      });
      onDone();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <p className="text-sm font-semibold text-plum-950">
        {request.requestedByName} asked for {formatBytes(request.requestedBytes)} of storage
      </p>
      {request.message && <p className="mt-1 text-[13px] text-slate-600">&ldquo;{request.message}&rdquo;</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[13px] font-medium text-plum-950">
          Grant (GB)
          <input
            type="number"
            min={1}
            value={sizeGb}
            onChange={(e) => setSizeGb(e.target.value)}
            className={`${inputClass} mt-1 w-32`}
          />
        </label>
        <Button onClick={() => void decide("approve")} disabled={busy}>
          Approve
        </Button>
        <Button variant="ghost" onClick={() => void decide("decline")} disabled={busy}>
          Decline
        </Button>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorNote error={error} />
        </div>
      )}
    </Card>
  );
}
