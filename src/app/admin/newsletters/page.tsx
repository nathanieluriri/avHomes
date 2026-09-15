"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Plus } from "lucide-react";
import type { Newsletter, NewsletterStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { Badge, Button, EmptyState, ErrorNote, PageHeader, Skeleton, type Tone } from "@/components/admin/ui";

const TONE: Record<NewsletterStatus, Tone> = { draft: "amber", sending: "wine", sent: "green" };
const LABEL: Record<NewsletterStatus, string> = { draft: "Draft", sending: "Sending", sent: "Sent" };

export default function NewslettersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsync<{ items: Newsletter[] }>(
    (signal) => api.get<{ items: Newsletter[] }>("/admin/newsletters", signal),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  async function create() {
    setBusy(true);
    setCreateError(null);
    try {
      const res = await api.post<{ newsletter: Newsletter }>("/admin/newsletters", {});
      router.push(`/admin/newsletters/${res.newsletter.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Newsletters"
        icon={Mail}
        subtitle="Write once, send to everyone on the subscriber list."
        actions={
          <Button onClick={() => void create()} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {busy ? "Creating" : "New newsletter"}
          </Button>
        }
      />
      {createError && (
        <div className="mb-3">
          <ErrorNote error={createError} />
        </div>
      )}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.items.length === 0 && (
        <EmptyState title="No newsletters yet" hint="Start one, send yourself a test, then send it to your subscribers." />
      )}
      <ul className="flex flex-col gap-2">
        {data?.items.map((n) => (
          <li key={n.id}>
            <Link
              href={`/admin/newsletters/${n.id}`}
              className="flex flex-col gap-1 rounded-xl border border-mist-200 bg-white px-4 py-3 transition-colors hover:border-wine-500 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-plum-950">{n.subject || "Untitled newsletter"}</span>
                <span className="block text-xs text-slate-600">
                  {n.status === "sent" && n.sentAt
                    ? `Sent ${shortDate(n.sentAt)} to ${n.sentCount}${n.failedCount ? `, ${n.failedCount} failed` : ""}`
                    : `Edited ${shortDate(n.updatedAt)} by ${n.createdByName}`}
                </span>
              </span>
              <Badge tone={TONE[n.status]}>{LABEL[n.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
