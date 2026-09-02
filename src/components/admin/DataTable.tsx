"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "./ui";

/**
 * The console's one table.
 *
 * Declarative columns rather than hand-written `<tr>`s, and the reason is the
 * phone. Below `sm` the table stops being a table and becomes a list of
 * records: the primary column is the card's title, `mobile: "keep"` columns
 * sit under it as a meta line, and everything else is dropped. That collapse
 * has to happen in one place or every screen reinvents it, badly. A table left
 * as a table on a 390px screen is a horizontal scroller that hides the column
 * somebody came to read.
 */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Exactly one. The identity column: it titles the mobile card and is never
   *  dropped. */
  primary?: boolean;
  /** Money and counts. Right aligned with tabular figures, or a scan down the
   *  column for the largest value fails because the digits do not line up. */
  numeric?: boolean;
  /** Survives the phone collapse, as part of the card's meta line. Reserve it
   *  for the one or two facts that actually govern a scan. */
  mobile?: "keep";
  /** A badge or chip that should not stretch. */
  tight?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  hrefFor,
  loading = false,
  empty,
  toolbar,
  footer,
  caption,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** A real href, so middle-click, open-in-new-tab and the status bar preview
   *  all keep working. Prefer it over an onClick handler on the row. */
  hrefFor?: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Names the table for a screen reader. Not painted. */
  caption: string;
}) {
  const router = useRouter();
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const rest = columns.filter((column) => column !== primary);
  const mobileMeta = rest.filter((column) => column.mobile === "keep");

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      {toolbar && <div className="border-b border-mist-200 p-3">{toolbar}</div>}

      {/* Loading is a skeleton in the exact shape the rows will land in, never
          a spinner. The columns are known before the data is, so the wait can
          show the real shape and the page does not reflow on arrival. */}
      {loading ? (
        <TableSkeleton columns={columns.length} />
      ) : rows.length === 0 ? (
        <div className="p-2">{empty}</div>
      ) : (
        <>
          <table className="hidden w-full text-[13px] sm:table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-mist-200 bg-mist-50/60">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${
                      column.numeric ? "text-right" : "text-left"
                    } ${column.tight ? "w-px whitespace-nowrap" : ""}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                /*
                 * The whole row navigates, not just the title cell. The row
                 * already hover-highlights and turns its title blue, so a click
                 * on the price or the date has to do what that appearance
                 * promises. The primary cell keeps a real `<a>` underneath, so
                 * middle-click, open-in-new-tab and the status bar preview all
                 * still work; this handler is only for the rest of the width.
                 */
                <tr
                  key={rowKey(row)}
                  onClick={
                    hrefFor
                      ? (event) => {
                          // Anything with its own behaviour wins. Without this a
                          // click on a future inline control also navigates.
                          if ((event.target as HTMLElement).closest("a,button,input,label,select"))
                            return;
                          if (event.metaKey || event.ctrlKey) {
                            window.open(hrefFor(row), "_blank", "noreferrer");
                            return;
                          }
                          if (window.getSelection()?.toString()) return;
                          router.push(hrefFor(row));
                        }
                      : undefined
                  }
                  className={`group border-b border-mist-100 last:border-0 hover:bg-blue-50/40 ${
                    hrefFor ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-2.5 align-middle ${
                        column.numeric ? "c-num text-right" : "text-left"
                      } ${column.tight ? "w-px whitespace-nowrap" : ""}`}
                    >
                      {column === primary && hrefFor ? (
                        <Link
                          href={hrefFor(row)}
                          className="-mx-1 block rounded px-1 outline-none"
                        >
                          {column.render(row)}
                        </Link>
                      ) : (
                        column.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* The phone list. Same data, different object. */}
          <ul className="sm:hidden">
            {rows.map((row) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-navy-950">
                      {primary.render(row)}
                    </div>
                    {mobileMeta.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600">
                        {mobileMeta.map((column) => (
                          <span key={column.key} className={column.numeric ? "c-num" : undefined}>
                            {column.render(row)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {hrefFor && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-mist-300" aria-hidden="true" />
                  )}
                </>
              );
              return (
                <li key={rowKey(row)} className="border-b border-mist-100 last:border-0">
                  {hrefFor ? (
                    <Link
                      href={hrefFor(row)}
                      className="flex items-center gap-3 px-4 py-3 active:bg-blue-50/60"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {footer && !loading && rows.length > 0 && (
        <div className="border-t border-mist-200 px-3 py-2.5">{footer}</div>
      )}
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="p-4" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading rows</span>
      {Array.from({ length: 4 }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-mist-100 py-3 last:border-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <Skeleton className="h-3.5 flex-1" />
          {Array.from({ length: Math.max(0, columns - 2) }, (_, cell) => (
            <Skeleton key={cell} className="hidden h-3.5 w-16 sm:block" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The identity cell: thumbnail, title, and one line of meta.
 *
 * It carries no link of its own. `DataTable` wraps the primary column, so a
 * link here would nest an anchor inside an anchor, which the parser silently
 * unnests into two siblings and one dead click target.
 */
export function IdCell({
  thumb,
  title,
  meta,
  trailing,
}: {
  thumb?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <span className="flex items-center gap-3">
      {thumb && (
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-mist-100 text-slate-550">
          {thumb}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-navy-950 group-hover:text-blue-700">
            {title}
          </span>
          {trailing}
        </span>
        {meta && <span className="mt-0.5 block truncate text-[12px] text-slate-600">{meta}</span>}
      </span>
    </span>
  );
}

/**
 * Cursor paging, drawn as two chevrons and a count.
 *
 * `note` states the real scope of what is on screen. A pager that says
 * "1 to 25" without saying of what is a claim the caller cannot check.
 */
export function TablePager({
  note,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  note: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12px] text-slate-600">{note}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous page"
          className="c-bevel grid h-9 w-9 place-items-center rounded-lg bg-white text-navy-950 transition-colors hover:bg-mist-50 disabled:cursor-not-allowed disabled:text-mist-300 sm:h-7 sm:w-7"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next page"
          className="c-bevel grid h-9 w-9 place-items-center rounded-lg bg-white text-navy-950 transition-colors hover:bg-mist-50 disabled:cursor-not-allowed disabled:text-mist-300 sm:h-7 sm:w-7"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * The filter row: status tabs on the left, a search box on the right.
 *
 * The tabs scroll horizontally on a phone rather than wrapping to three rows,
 * and the bar is hidden because an always-on scrollbar draws a grey rule
 * straight through the pills on Windows.
 */
export function TableToolbar({
  tabs,
  search,
  trailing,
}: {
  tabs: {
    value: string;
    options: readonly { value: string; label: string; count?: number }[];
    onChange: (value: string) => void;
  };
  search: { value: string; placeholder: string; onChange: (value: string) => void };
  /** A sort control or similar, kept beside the search rather than above it. */
  trailing?: ReactNode;
}) {
  /*
   * The row layout waits for `xl`, not `lg`. At 1024 the tabs, the search box
   * and the sort control shared one row and the last status pill was clipped
   * off the right edge with nothing to say the strip scrolled. 1024x768 is a
   * real laptop and a landscape tablet, so the band mattered. Stacked, the
   * strip has the full width and every status fits.
   */
  return (
    <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
      {/*
        `group` and `aria-pressed`, NOT `tablist` and `tab`. The ARIA tab pattern
        is a contract: one tab stop for the set, arrow keys to move between them,
        and `aria-controls` pointing at a panel. These are filter toggles over a
        table that is always present, they are each their own tab stop, and
        claiming the role without the keyboard behaviour tells a screen reader
        user to press keys that do nothing.
      */}
      <div
        role="group"
        aria-label="Filter by status"
        className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1"
      >
        {tabs.options.map((option) => {
          const active = tabs.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => tabs.onChange(option.value)}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors sm:h-7 sm:px-2.5 ${
                active
                  ? "bg-navy-950 text-white"
                  : "text-slate-600 hover:bg-mist-100 hover:text-navy-950"
              }`}
            >
              {option.label}
              {option.count !== undefined && (
                <span
                  className={`c-num rounded px-1 text-[11px] font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-mist-100 text-slate-600"
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 xl:ml-auto">
        <input
          type="search"
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className="h-8 w-full min-w-0 rounded-lg border border-mist-200 bg-white px-2.5 text-[13px] text-navy-950 outline-none transition-colors placeholder:text-slate-550 focus:border-blue-500 xl:w-56"
        />
        {trailing}
      </div>
    </div>
  );
}
