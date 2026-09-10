"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, History } from "lucide-react";
import type { Page, TeamUser } from "@avhomes/contracts";
import { AUDIT_ENTITIES, type AuditEntity, type AuditEntry } from "@/lib/types";
import { api } from "@/lib/admin/client";
import { useAsync, useCursorStack } from "@/lib/admin/hooks";
import { dateTime, initials, relative } from "@/lib/admin/format";
import {
  ENTITY_FILTER_LABEL,
  auditSentence,
  displayValue,
  entityTarget,
  fieldLabel,
  fieldTable,
  type FieldTable,
} from "@/lib/admin/audit";
import { TablePager } from "@/components/admin/DataTable";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * The audit trail. Gated to the `danger` domain in the rail, same as the API
 * gates the route this reads.
 *
 * Not a `DataTable`: every other list in the console navigates a row to a page
 * of its own, and this one expands a row in place instead. An entry has no
 * page to navigate to, and the whole point of expanding is to stay on the
 * list while reading it.
 */

const PAGE_SIZE = 25;

type EntityFilter = AuditEntity | "all";

export default function AuditPage() {
  const [entity, setEntity] = useState<EntityFilter>("all");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  /* One resetKey covering all four filters, so changing any of them starts
     back at page one. See useCursorStack: it resets during render, which is
     what stops a page-two request for the previous filter from firing and
     flashing its rows. */
  const paging = useCursorStack(`${entity}|${actorId}|${from}|${to}`);

  const fromMs = toStartOfDay(from);
  const toMs = toEndOfDay(to);

  const { data, error, loading, reload } = useAsync<Page<AuditEntry>>(
    (signal) =>
      api.get<Page<AuditEntry>>(
        `/admin/audit?${new URLSearchParams({
          limit: String(PAGE_SIZE),
          ...(entity !== "all" ? { entity } : {}),
          ...(actorId ? { actorId } : {}),
          ...(fromMs !== null ? { from: String(fromMs) } : {}),
          ...(toMs !== null ? { to: String(toMs) } : {}),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [entity, actorId, fromMs, toMs, paging.cursor],
    // Holds the rows while the next filter loads. Without it, four viewports
    // of entries collapse to a skeleton on every keystroke in a date box,
    // which clamps the scroller back to the top.
    { keepPrevious: true },
  );

  /*
   * Independent of every filter above and fetched once, never re-run when a
   * filter changes: this is a health signal for the WHOLE trail, not for
   * whatever page is currently on screen. A filtered view showing nothing
   * recent is an empty filter. This showing nothing recent is a broken
   * writer, and the two must never be able to look alike.
   */
  const latest = useAsync<Page<AuditEntry>>(
    (signal) => api.get<Page<AuditEntry>>(`/admin/audit?limit=1`, signal),
    [],
  );
  const lastAt = latest.data?.items[0]?.at ?? null;

  const users = useAsync<{ items: TeamUser[] }>(
    (signal) => api.get<{ items: TeamUser[] }>("/admin/users", signal),
    [],
  );

  const filtered = entity !== "all" || actorId !== "" || from !== "" || to !== "";
  const rows = data?.items ?? [];

  function clearFilters() {
    setEntity("all");
    setActorId("");
    setFrom("");
    setTo("");
  }

  function subtitle(): string {
    const base = "Every change made in the console, newest first.";
    if (latest.error || latest.loading) return base;
    if (lastAt === null) return `${base} Nothing has been recorded yet.`;
    return `${base} Last recorded ${relative(lastAt)}.`;
  }

  return (
    <>
      <PageHeader icon={History} title="Audit trail" subtitle={subtitle()} />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <Card padded={false} className="overflow-clip">
        <div className="border-b border-mist-200 bg-white p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Entity">
              <select
                className={inputClass}
                value={entity}
                onChange={(e) => setEntity(e.target.value as EntityFilter)}
              >
                <option value="all">All</option>
                {AUDIT_ENTITIES.map((value) => (
                  <option key={value} value={value}>
                    {ENTITY_FILTER_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Actor">
              <select
                className={inputClass}
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
              >
                <option value="">Everyone</option>
                {users.data?.items.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input
                type="date"
                className={inputClass}
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputClass}
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>

          {filtered && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            bare
            icon={History}
            title={filtered ? "Nothing matched" : "Nothing recorded yet"}
            hint={
              filtered
                ? "No entry on this page matches those filters. Try widening the date range, or clear them."
                : "Every change made in the console will show up here as soon as somebody makes one."
            }
            action={
              filtered ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul>
            {rows.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {(loading || rows.length > 0) && (
          <div className="border-t border-mist-200 px-3 py-2.5">
            {loading && rows.length === 0 ? (
              <Skeleton className="h-7 w-full max-w-[16rem]" />
            ) : (
              <TablePager
                note={`${rows.length} ${rows.length === 1 ? "entry" : "entries"} on this page`}
                {...paging.pager(data?.nextCursor)}
              />
            )}
          </div>
        )}
      </Card>
    </>
  );
}

/** Midnight, in the browser's own timezone: what "1 Sept" means to whoever is reading it. */
function toStartOfDay(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The last instant of the day, so `to` is inclusive of the date somebody picked. */
function toEndOfDay(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The wait wears the list's own shape: an avatar disc, a line, a time. */
function RowsSkeleton() {
  return (
    <ul aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the audit trail</span>
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="flex items-center gap-3 border-b border-mist-100 px-4 py-3 last:border-0 sm:px-5"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3 w-12 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/**
 * One entry. Collapsed, it is the sentence, and nothing else: the method,
 * path and status a curious reader wants next sit behind "Technical details",
 * never in the line everybody else is scanning.
 */
function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const target = entityTarget(entry);
  const table = fieldTable(entry);

  return (
    <li className="border-b border-mist-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-mist-50/60 sm:px-5"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist-100 text-[11px] font-bold text-slate-600"
        >
          {initials(entry.actorName)}
        </span>
        <span className="min-w-0 flex-1 text-[13px] text-plum-950">{auditSentence(entry)}</span>
        <span className="shrink-0 text-[12px] text-slate-600" title={dateTime(entry.at)}>
          {relative(entry.at)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-mist-300 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-mist-100 bg-mist-50/60 px-4 py-3 sm:px-5">
          <p className="text-[12px] text-slate-600">
            <span className="font-semibold text-plum-950">{target.label}</span>
            {target.name && <span className="[overflow-wrap:anywhere]"> {target.name}</span>}
            {target.href && (
              <>
                {" "}
                <Link
                  href={target.href}
                  className="font-semibold text-wine-700 underline underline-offset-2"
                >
                  {target.linkText}
                </Link>
              </>
            )}
          </p>

          <FieldGrid table={table} />

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-slate-500">Technical details</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <dt className="font-semibold text-plum-950">Request</dt>
              <dd className="font-mono [overflow-wrap:anywhere]">
                {entry.method} {entry.path}
              </dd>
              <dt className="font-semibold text-plum-950">Status</dt>
              <dd className="font-mono">{entry.status}</dd>
              <dt className="font-semibold text-plum-950">Request ID</dt>
              <dd className="font-mono [overflow-wrap:anywhere]">{entry.requestId}</dd>
              {entry.query && (
                <>
                  <dt className="font-semibold text-plum-950">Query</dt>
                  <dd className="font-mono [overflow-wrap:anywhere]">{displayValue(entry.query)}</dd>
                </>
              )}
            </dl>
          </details>
        </div>
      )}
    </li>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[12px] text-slate-600">{children}</p>;
}

/**
 * The grid under the sentence, or the sentence that replaces it.
 *
 * Six modes rather than a table and an empty state, because "nothing changed",
 * "nothing was recorded" and "it was too big to record" are three different
 * answers and a reader settling an argument needs to know which one they got.
 */
function FieldGrid({ table }: { table: FieldTable }) {
  if (table.mode === "none") {
    return <Note>No field changes recorded for this entry.</Note>;
  }
  if (table.mode === "unchanged") {
    return <Note>Every field submitted already held the value it was given, so nothing changed.</Note>;
  }
  if (table.mode === "truncated") {
    return (
      <Note>
        The submitted values were too large to record, so this entry keeps who and when but not what.
      </Note>
    );
  }

  const changed = table.mode === "changed";
  const caption = changed
    ? "Changed fields"
    : table.mode === "snapshot"
      ? "The record as it stood"
      : "Submitted fields";

  return (
    <>
      {table.mode === "submitted" && (
        <Note>
          Nothing was recorded for how this looked first, so these are the values submitted rather
          than a comparison.
        </Note>
      )}
      {table.mode === "snapshot" && <Note>The record as it stood when it was removed.</Note>}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-1 pr-3">
                Field
              </th>
              {changed && (
                <th scope="col" className="py-1 pr-3">
                  Before
                </th>
              )}
              <th scope="col" className="py-1">
                {changed ? "After" : table.mode === "snapshot" ? "Value" : "Submitted"}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key} className="border-t border-mist-200/70 align-top">
                <td className="py-1.5 pr-3 font-medium text-plum-950">{fieldLabel(row.key)}</td>
                {changed && (
                  <td className="py-1.5 pr-3 text-slate-600 [overflow-wrap:anywhere]">
                    {displayValue(row.before, row.key)}
                  </td>
                )}
                <td className="py-1.5 text-plum-950 [overflow-wrap:anywhere]">
                  {displayValue(row.after, row.key)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
