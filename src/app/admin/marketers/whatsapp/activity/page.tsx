"use client";

import { useMemo, useState } from "react";
import type { WhatsappClickRow, WhatsappReport } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { WhatsappHeader } from "@/components/admin/whatsapp/WhatsappTabs";
import { ActivityLine } from "@/components/admin/whatsapp/ActivityLine";
import { Card, EmptyState, ErrorNote, Skeleton } from "@/components/admin/ui";

type Filter = "all" | "self" | "forward";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "self", label: "Partners joining" },
  { value: "forward", label: "Forwarded links" },
];

function dayLabel(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function WhatsappActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, reload } = useAsync(
    (signal) => api.get<WhatsappReport>("/admin/marketing/whatsapp", signal),
    [],
  );

  const days = useMemo(() => {
    const groups = new Map<string, WhatsappClickRow[]>();
    for (const row of data?.recent ?? []) {
      if (filter !== "all" && row.kind !== filter) continue;
      const key = dayLabel(row.at);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()];
  }, [data, filter]);

  return (
    <>
      <WhatsappHeader subtitle="Every open of a partner's link, newest first: partners joining, and their links being forwarded." />

      <div role="tablist" aria-label="Filter activity" className="mb-3 flex flex-wrap gap-1">
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

      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-64" />}
      {data && days.length === 0 && (
        <Card>
          <EmptyState bare title="Nothing yet" hint="Opens of partners' links show here as they happen." />
        </Card>
      )}
      <div className="space-y-4">
        {days.map(([day, rows]) => (
          <Card key={day}>
            <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-600">{day}</h2>
            <ul className="divide-y divide-mist-100">
              {rows.map((row) => (
                <ActivityLine key={row.id} row={row} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {data && data.recent.length >= 200 && (
        <p className="mt-3 text-[12px] text-slate-500">Showing the latest 200 opens.</p>
      )}
    </>
  );
}
