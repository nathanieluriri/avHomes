"use client";

import { useState } from "react";
import { Download, UserPlus, Users } from "lucide-react";
import type { Subscriber } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { MailNotConfiguredAlert } from "@/components/admin/MailStatus";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

interface SubscriberList {
  items: Subscriber[];
  active: number;
  unsubscribed: number;
}

type Filter = "active" | "unsubscribed" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "Subscribed" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "all", label: "All" },
];

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function SubscribersPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 250);
  const { data, error, loading, reload } = useAsync<SubscriberList>(
    (signal) =>
      api.get<SubscriberList>(`/admin/subscribers?status=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`, signal),
    [filter, q],
    { keepPrevious: true },
  );
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  async function add() {
    const list = emails.split(/[\s,;]+/u).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.post<{ added: number; skipped: number }>("/admin/subscribers", { emails: list });
      setNotice(
        `${res.added} added.${res.skipped > 0 ? ` ${res.skipped} skipped (already on the list, left earlier, or not an email address).` : ""}`,
      );
      setEmails("");
      setAdding(false);
      reload();
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(subscriber: Subscriber) {
    setActionError(null);
    try {
      await api.post(`/admin/subscribers/${subscriber.id}/unsubscribe`, {});
      reload();
    } catch (err) {
      setActionError(asApiError(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Subscribers"
        icon={Users}
        subtitle={
          data
            ? `${data.active} subscribed${data.unsubscribed > 0 ? `, ${data.unsubscribed} unsubscribed` : ""}.`
            : "Everyone who signed up for the newsletter."
        }
        actions={
          <>
            {/* A file download from the API, not a page: next/link would try to route it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/admin/subscribers/export"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mist-200 bg-white px-3 text-[13px] font-semibold text-plum-950 transition-colors hover:bg-mist-100"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </a>
            <Button onClick={() => setAdding((v) => !v)}>
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add subscribers
            </Button>
          </>
        }
      />

      <MailNotConfiguredAlert />

      {adding && (
        <Card className="mb-4 space-y-2">
          <label htmlFor="add-emails" className="block text-[13px] font-semibold text-plum-950">
            Email addresses
          </label>
          <p className="text-xs text-slate-600">
            Paste one or many, separated by commas, spaces or new lines. Only add people who agreed to hear from you.
            Anyone who unsubscribed before is left off.
          </p>
          <textarea
            id="add-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="ada@example.com, tunde@example.com"
          />
          <div className="flex gap-2">
            <Button onClick={() => void add()} disabled={busy || emails.trim() === ""}>
              {busy ? "Adding" : "Add to list"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{notice}</p>}
      {actionError && (
        <div className="mb-3">
          <ErrorNote error={actionError} />
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Filter subscribers" className="flex gap-1">
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
            </button>
          ))}
        </div>
        <label className="sm:ml-auto sm:w-72">
          <span className="sr-only">Search by email</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email"
            className={inputClass}
          />
        </label>
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.items.length === 0 && (
        <EmptyState
          title={q ? "No matches" : "No subscribers yet"}
          hint="People who subscribe from the site footer or a journal post appear here."
        />
      )}

      {data && data.items.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-[13px]">
            <thead className="border-b border-mist-200 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Email</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Joined from</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Since</th>
                <th scope="col" className="px-4 py-2.5 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="border-b border-mist-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-plum-950 [overflow-wrap:anywhere]">{s.email}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.source ?? "Site footer"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{shortDate(s.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.unsubscribedAt ? (
                      <Badge tone="neutral">Unsubscribed</Badge>
                    ) : (
                      <ConfirmButton confirmLabel="Yes, remove" onConfirm={() => void remove(s)}>
                        Unsubscribe
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
