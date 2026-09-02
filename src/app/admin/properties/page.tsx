"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROPERTY_STATUSES, formatPriceShort, statusLabel, type Page, type Property, type PropertyStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/admin/ui";

const TABS: readonly { value: "all" | PropertyStatus; label: string }[] = [
  { value: "all", label: "All" },
  ...PROPERTY_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
];

const STATUS_TONE: Record<PropertyStatus, "green" | "blue" | "neutral" | "amber"> = {
  "for-sale": "green",
  "for-rent": "blue",
  sold: "neutral",
  draft: "amber",
  archived: "neutral",
};

export default function PropertiesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PropertyStatus>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const query = useDebounced(search);

  const { data, error, loading, reload } = useAsync<Page<Property>>(
    (signal) =>
      api.get<Page<Property>>(
        `/admin/properties?${new URLSearchParams({
          limit: "25",
          ...(tab === "all" ? {} : { status: tab }),
          ...(query ? { q: query } : {}),
        })}`,
        signal,
      ),
    [tab, query],
  );

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ property: Property }>("/admin/properties");
      router.push(`/admin/properties/${res.property.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Listings"
        subtitle="Every property, including drafts and the trash."
        actions={
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating" : "New listing"}
          </Button>
        }
      />

      {createError && (
        <div className="mb-4">
          <ErrorNote error={createError} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.value ? "bg-navy-950 text-white" : "bg-white text-navy-950 hover:bg-mist-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search title, city, description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No listings here"
          hint={query ? "Nothing matched that search." : "Create one to get started."}
        />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-mist-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">City</th>
                <th className="px-5 py-3 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-mist-100 last:border-0 hover:bg-mist-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/properties/${p.id}`}
                      className="font-semibold text-navy-950 underline-offset-2 hover:underline"
                    >
                      {p.title || "Untitled listing"}
                    </Link>
                    {p.deletedAt !== null && (
                      <span className="ml-2 text-xs font-semibold text-red-600">in trash</span>
                    )}
                    {p.featured && <span className="ml-2 text-xs text-blue-600">featured</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{p.type}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.city || "-"}</td>
                  <td className="px-5 py-3 text-right font-medium text-navy-950">
                    {formatPriceShort(p.priceMinor, p.status, p.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data?.nextCursor && (
        <p className="mt-4 text-xs text-muted-foreground">
          More listings exist beyond this page. Narrow the filter to reach them.
        </p>
      )}
    </>
  );
}
