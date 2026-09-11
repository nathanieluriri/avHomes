"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { IconButton, Skeleton } from "./ui";

/**
 * The console's one table.
 *
 * THE TOOLBAR AND THE HEADER ROW BOTH STICK to the top of the scroller. Past
 * about twenty rows the column titles and the status filter had both scrolled
 * away, which leaves a wall of dates and money with nothing naming the columns,
 * and no way back to the filter that produced them short of scrolling to the
 * top and down again.
 *
 * Declarative columns rather than hand-written `<tr>`s, and the reason is the
 * phone. Below `md` the table stops being a table and becomes a list of
 * records. That collapse has to happen in one place or every screen reinvents
 * it, badly. A table left as a table on a 390px screen is a horizontal scroller
 * that hides the column somebody came to read.
 *
 * THE SWAP IS AT `md`, NOT `sm`, and the band between them is why. At 700px the
 * five columns of the listings table spend 160px on cell padding before a
 * single character is drawn, so the title column, the one thing the screen
 * exists to name, is what the truncation eats. 640 to 767 is a landscape phone
 * and a tablet held in portrait, and a card is plainly the better object at
 * both.
 *
 * So the card has TWO grades rather than one. Below 640 it carries the one or
 * two facts that govern a scan; from 640 to 1023 it is nearly 700px wide and
 * carries the `tablet` columns as well, because three values in that much space
 * read as an unfinished card rather than a dense one.
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
  /**
   * Survives the collapse into a card, and how far down it survives.
   *
   * `keep` shows on the card at every width below `md`. `tablet` shows only in
   * the 640 to 1023 card and is dropped below 640. Reserve `keep` for the one
   * or two facts that actually govern a scan and put the rest on `tablet`: a
   * fourth value is what turns a 360px meta line into a run-on sentence, and is
   * exactly what the 767px card has the room for.
   *
   * `tablet` columns are laid out AFTER every `keep` column whatever order they
   * are declared in. What disappears below 640 is therefore always the tail of
   * the run, which is what stops a middot separator from being left leading the
   * line with nothing in front of it.
   */
  mobile?: "keep" | "tablet";
  /** A badge or chip that should not stretch. */
  tight?: boolean;
  /**
   * A status chip, which gets its own slot on the card between the title and
   * the meta run instead of being carried along inside it. Status is the fact a
   * scan down a list is looking for, and in one flex-wrap bag it was reading as
   * the first two words of a four value sentence.
   *
   * Only meaningful alongside `mobile`, which still decides whether the column
   * reaches the card at all.
   */
  badge?: true;
  /**
   * The noun that completes this value on the card, drawn after it. A bare "3"
   * in a meta run means nothing and "3 beds" means something. The table has a
   * column header doing that job; the card has nothing, so any value that
   * cannot be read on its own needs one here.
   */
  mobileLabel?: string;
  /**
   * Whether this column's cell draws the 36px thumbnail `IdCell` takes. Only
   * the skeleton reads it, and only from the primary column: it draws a
   * thumbnail placeholder, and a placeholder for a thumbnail that never arrives
   * shifts every row up and left on arrival, which is the exact reflow the
   * skeleton exists to prevent.
   *
   * Defaults to true, because every list screen in the console draws one. Set
   * it false on a primary column that does not.
   */
  thumb?: boolean;
}

/** A `tablet` column is drawn on the 640 to 1023 card only. */
function cardGrade<T>(column: Column<T>): string {
  return column.mobile === "tablet" ? "max-sm:hidden" : "";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  hrefFor,
  rowAction,
  rowSpotlight,
  spotlight,
  loading = false,
  empty,
  toolbar,
  footer,
  footerWhenEmpty = false,
  caption,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** A real href, so middle-click, open-in-new-tab and the status bar preview
   *  all keep working. Prefer it over an onClick handler on the row. */
  hrefFor?: (row: T) => string;
  /**
   * A control pinned to the right of the CARD, on the phone list only. The
   * desktop table has columns for this and a phantom sixth column would break
   * the header alignment; the card had nowhere at all to put a quick status
   * change or a select, so the only thing a row could do on a phone was
   * navigate.
   *
   * It is a SIBLING of the row's link rather than a child of it, which is what
   * keeps it tappable at all. See the card below for how that is arranged.
   */
  rowAction?: (row: T) => ReactNode;
  /** A tutorial anchor for a row, rendered as `data-spotlight` on both the table row and the card. */
  rowSpotlight?: (row: T) => string | undefined;
  /** A tutorial anchor for the whole table. */
  spotlight?: string;
  loading?: boolean;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Keep the footer even with no rows. For a screen whose empty is a CLIENT
   *  filter over a page that still has rows and a next cursor: taking the pager
   *  away there strands the record the reader is looking for. */
  footerWhenEmpty?: boolean;
  /** Names the table for a screen reader, and names the card list too. Not
   *  painted. */
  caption: string;
}) {
  const router = useRouter();
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const rest = columns.filter((column) => column !== primary);
  const onCard = rest.filter((column) => column.mobile);
  const cardBadges = onCard.filter((column) => column.badge);
  /* `keep` before `tablet`, so what vanishes below 640 is always the tail of the
     run and no separator is ever left leading the line. */
  const cardMeta = [
    ...onCard.filter((column) => !column.badge && column.mobile === "keep"),
    ...onCard.filter((column) => !column.badge && column.mobile === "tablet"),
  ];

  /*
   * The header row parks under the toolbar, so it has to know how tall the
   * toolbar is. Measured, not a constant: the toolbar reflows from one row to
   * two below `xl`, and its height moves again when the status pills wrap. Any
   * fixed number is wrong at some width, and wrong here means either a strip of
   * rows showing through the gap or the column titles hidden behind the
   * filters.
   *
   * It is consumed by the `<th>` style and nowhere else, so it costs nothing
   * below `md`, where there is no header row, and nothing below `sm`, where the
   * toolbar does not stick either.
   */
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [headTop, setHeadTop] = useState(0);
  const hasToolbar = Boolean(toolbar);

  /* Keyed on WHETHER there is a toolbar, never on the node itself. `toolbar` is
     JSX built inline by the caller, so it is a new object on every render, and
     depending on it would tear the observer down and rebuild it on every
     keystroke in the search box it contains. */
  useEffect(() => {
    const node = toolbarRef.current;
    if (!node) {
      setHeadTop(0);
      return;
    }
    // `offsetHeight`, not `getBoundingClientRect`. The sheet animates a scale on
    // arrival and a rect is measured through that transform, which would read a
    // height a couple of pixels short and then never correct itself: the
    // observer watches the border box, which a transform does not touch, so it
    // has no second firing to correct with.
    const observer = new ResizeObserver(() => setHeadTop(node.offsetHeight));
    observer.observe(node);
    setHeadTop(node.offsetHeight);
    return () => observer.disconnect();
  }, [hasToolbar]);

  return (
    /*
     * `overflow-clip`, NOT `overflow-hidden`, and that is the whole reason the
     * sticking works. `hidden` makes this element a scroll container, so a
     * sticky descendant sticks to a box that never scrolls, which is a silent
     * no-op rather than an error. `clip` still trims the table to the radius
     * but creates no scrollport, so the sticky cells resolve against `.c-main`,
     * which is the thing actually moving.
     */
    <div data-spotlight={spotlight} className="overflow-clip rounded-2xl bg-white shadow-card">
      {toolbar && (
        /* Sticky from `sm` up only. On a 640px-tall phone the toolbar is two
           44px rows sitting under a 52px topbar, and pinning all of that leaves
           four records visible for the whole life of the screen. From `sm` up it
           is one dense row, and pinning it is what keeps the filter reachable
           from row two hundred. */
        <div
          ref={toolbarRef}
          className="z-30 border-b border-mist-200 bg-white p-3 sm:sticky sm:top-0"
        >
          {toolbar}
        </div>
      )}

      {/* Loading is a skeleton in the exact shape the rows will land in, never
          a spinner. The columns are known before the data is, so the wait can
          show the real shape and the page does not reflow on arrival.

          ONLY WHEN THERE IS NOTHING TO SHOW, which is what makes `keepPrevious`
          mean anything. `useAsync` raises `loading` on every refetch whether or
          not it kept the last payload, so branching on the flag alone threw the
          held rows away and did exactly what `keepPrevious` was added to stop:
          a status-pill tap collapsed a list several viewports tall into four
          skeleton rows, which clamps `.c-main` to the top and relocates a
          reader who was halfway down. Held rows simply stay up until the new
          ones replace them. */}
      {loading && rows.length === 0 ? (
        <TableSkeleton columns={columns} caption={caption} />
      ) : rows.length === 0 ? (
        /* No empty means the caller knows why the list is empty and is saying
           so somewhere else. A failed load must not fall through to an
           onboarding illustration.

           Drawn flush, with no padding around it. This surface is already a
           `rounded-2xl bg-white shadow-card`, so an empty state carrying its own
           card drew a second shadowed rectangle 8px inside the first. The empty
           states here pass `bare` and let this card be the card. */
        empty ?? null
      ) : (
        <>
          <table className="hidden w-full text-[13px] md:table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              {/*
                The CELLS stick, not the row. `position: sticky` on a `<tr>` is
                ignored under `border-collapse: collapse`, which is the default
                Tailwind sets, so each `<th>` carries it.

                Each also carries its own OPAQUE fill and draws its own bottom
                rule. The tint was `bg-mist-50/60` on the row and the rule was a
                `border-b`: at 60% the rows underneath read straight through a
                stuck header, and a collapsed border belongs to the table grid
                rather than to the cell, so it stays behind while the cell
                travels. An inset shadow is painted by the cell and goes where
                the cell goes.
              */}
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    style={{ top: headTop }}
                    className={`sticky z-20 bg-mist-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-[inset_0_-1px_0_0_var(--mist-200)] ${
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
                 * already hover-highlights and turns its title wine, so a click
                 * on the price or the date has to do what that appearance
                 * promises. The primary cell keeps a real `<a>` underneath, so
                 * middle-click, open-in-new-tab and the status bar preview all
                 * still work; this handler is only for the rest of the width.
                 */
                <tr
                  key={rowKey(row)}
                  data-spotlight={rowSpotlight?.(row)}
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
                  /* `focus-within` as well as `hover`: the whole row responds
                     to a pointer, so it has to respond the same way when a
                     keyboard reaches the link inside it. */
                  className={`group border-b border-mist-100 last:border-0 hover:bg-wine-50/40 focus-within:bg-wine-50/40 ${
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

          {/* The card list. Same data, different object, and `aria-label`
              because the `<caption>` above it lives inside a table that is
              `display: none` at exactly the widths a phone reader is at. */}
          <ul className="md:hidden" aria-label={caption}>
            {rows.map((row) => (
              /*
               * THE WHOLE CARD IS THE TAP TARGET AND THE LINK IS NOT THE CARD.
               *
               * The link wraps the title and stretches its hit area across the
               * row with an `::after` at `inset-0`. Three things follow, and all
               * three were wrong when an anchor wrapped the whole card instead.
               * The link keeps a real accessible name, because the title is
               * still inside it. Everything else in the row is a SIBLING of the
               * anchor rather than a descendant, so `rowAction` is not a button
               * nested in an anchor, which the parser unnests into two elements
               * and one dead tap. And a sibling raised to `z-10` sits above the
               * stretched pseudo-element, so it takes its own taps while every
               * pixel around it still navigates.
               *
               * The press tint hangs off `has-[a:active]` on the row rather than
               * off the anchor, because the thing being pressed is drawn as a
               * card and has to answer as one.
               */
              <li
                key={rowKey(row)}
                data-spotlight={rowSpotlight?.(row)}
                className="relative flex items-center gap-3 border-b border-mist-100 px-4 py-3 last:border-0 has-[a:active]:bg-wine-50/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-plum-950">
                    {hrefFor ? (
                      <Link
                        href={hrefFor(row)}
                        className="block after:absolute after:inset-0 after:content-['']"
                      >
                        {primary.render(row)}
                      </Link>
                    ) : (
                      primary.render(row)
                    )}
                  </div>

                  {/* The status chip gets a line to itself, ahead of the meta
                      run. It is the value a scan down this list is looking for
                      and it does not read as one mid-sentence. */}
                  {cardBadges.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {cardBadges.map((column) => (
                        <span key={column.key} className={cardGrade(column)}>
                          {column.render(row)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* The meta run. The middot is what makes four values read as
                      four values rather than as one sentence, and `truncate` on
                      each of them is what stops a long unbroken token from
                      pushing the card wider than the surface clipping it. */}
                  {cardMeta.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600">
                      {cardMeta.map((column, index) => (
                        <Fragment key={column.key}>
                          {index > 0 && (
                            <span
                              aria-hidden="true"
                              className={`text-mist-300 ${cardGrade(column)}`}
                            >
                              ·
                            </span>
                          )}
                          <span
                            className={`min-w-0 max-w-full truncate ${
                              column.numeric ? "c-num" : ""
                            } ${cardGrade(column)}`}
                          >
                            {column.render(row)}
                            {column.mobileLabel && (
                              <span className="ml-1 text-slate-550">{column.mobileLabel}</span>
                            )}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>

                {rowAction && <div className="relative z-10 shrink-0">{rowAction(row)}</div>}

                {hrefFor && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-mist-300" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {footer && (loading || rows.length > 0 || footerWhenEmpty) && (
        <div className="border-t border-mist-200 px-3 py-2.5">
          {/* Same rule as the rows above. Replacing the pager with a skeleton
              on every refetch took the Next chevron away at the exact moment it
              was pressed, so a reader paging through a list lost the control
              under their thumb between one page and the next. */}
          {loading && rows.length === 0 ? (
            <Skeleton className="h-7 w-full max-w-[16rem]" />
          ) : (
            footer
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The wait wears the table's own frame.
 *
 * The REAL header row, not a placeholder for it, because the columns are known
 * before the rows are. Without it the header popped in on arrival and pushed
 * every row down, which is the reflow a skeleton exists to prevent, and it made
 * this the one screen in the console whose wait did not hold its shape.
 */
function TableSkeleton<T>({
  columns,
  caption,
}: {
  columns: readonly Column<T>[];
  caption: string;
}) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  /* A thumbnail placeholder for a cell that has no thumbnail is the same reflow
     the header row was fixed for, one axis over: every row shifts up and left
     the moment the real data lands. */
  const showThumb = primary?.thumb !== false;

  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading rows</span>

      <table className="hidden w-full text-[13px] md:table">
        <thead>
          {/* Same opaque fill and same drawn rule as the real header, so the
              swap from skeleton to rows changes nothing but the rows. */}
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`bg-mist-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-[inset_0_-1px_0_0_var(--mist-200)] ${
                  column.numeric ? "text-right" : "text-left"
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }, (_, row) => (
            <tr key={row} className="border-b border-mist-100 last:border-0">
              {columns.map((column, index) => (
                <td key={column.key} className="px-4 py-2.5">
                  {index === 0 ? (
                    <span className="flex items-center gap-3">
                      {showThumb && <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />}
                      <Skeleton className="h-3.5 w-40" />
                    </span>
                  ) : (
                    <Skeleton className={`h-3.5 w-16 ${column.numeric ? "ml-auto" : ""}`} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="md:hidden" aria-label={caption}>
        {Array.from({ length: 4 }, (_, row) => (
          <li
            key={row}
            className="flex items-center gap-3 border-b border-mist-100 px-4 py-3 last:border-0"
          >
            {showThumb && <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />}
            <span className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The identity cell: thumbnail, title, and one line of meta.
 *
 * It carries no link of its own. `DataTable` wraps the primary column on the
 * desktop row and on the phone card alike, so a link here would nest an anchor
 * inside an anchor, which the parser silently unnests into two siblings and one
 * dead click target.
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
          {/* Two lines on a card, one line in a table row. The card has about
              268px for a title, which elides most listing names to the point
              where two different records read identically; the table row needs
              the single line to hold its height. */}
          <span className="line-clamp-2 font-semibold text-plum-950 group-hover:text-wine-700 md:truncate md:line-clamp-none">
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
      {/* `gap-2`, never `gap-1`. Both chevrons carry `.c-tap`, whose 44px halo
          bleeds outside the drawn button, and at 4px apart the two halos overlap
          and steal each other's edges. These sit closer together than anything
          else in the console and they are the only way to reach page two. */}
      <div className="flex items-center gap-2">
        {/* `dense`, so the desk size stays 28px. Growing these to 36px would
            change the footer of every list screen in the console for a problem
            that only exists on a phone, and `.c-tap` already answers that. */}
        <IconButton
          label="Previous page"
          icon={ChevronLeft}
          size="dense"
          onClick={onPrev}
          disabled={!canPrev}
        />
        <IconButton
          label="Next page"
          icon={ChevronRight}
          size="dense"
          onClick={onNext}
          disabled={!canNext}
        />
      </div>
    </div>
  );
}

/**
 * The filter row: status tabs on the left, a search box on the right.
 *
 * BELOW `sm` THE STRIP IS A SHEET, not a scroller. Six statuses need about
 * 440px of pills in a 312px scrollport, and the strip hides its own scrollbar
 * because an always-on bar draws a grey rule straight through the pills on
 * Windows, so two of the six were unreachable with nothing at all to say they
 * existed. One `Filter` button in their place, naming the status that is
 * currently on, because that state was the one thing the strip did show and a
 * closed sheet would otherwise hide it.
 *
 * From `sm` up the strip is the right control and stays what it was, with
 * `.c-scroll-fade` added to say it scrolls in the band where it can still
 * overflow. The fade is dropped again at `xl`, where the strip shrinks to its
 * content width and a trailing mask would fade the last pill rather than the
 * gap after it.
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
    /** A tutorial anchor on one option's pill, and on the phone's filter button that reaches it. */
    spotlight?: { value: string; name: string };
  };
  search: { value: string; placeholder: string; onChange: (value: string) => void };
  /** A sort control or similar, kept beside the search from `sm` up and moved
   *  into the filter sheet below it, where the search box needs the whole row.
   *  Rendered in one place at a time, never in both. */
  trailing?: ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const active = tabs.options.find((option) => option.value === tabs.value);

  /*
   * The row layout waits for `xl`, not `lg`. At 1024 the tabs, the search box
   * and the sort control shared one row and the last status pill was clipped
   * off the right edge with nothing to say the strip scrolled. 1024x768 is a
   * real laptop and a landscape tablet, so the band mattered. Stacked, the
   * strip has the full width and every status fits.
   */
  return (
    <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
      {/* The phone's whole filter surface, in one 44px control that says what is
          filtered without having to be opened. */}
      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        data-spotlight={tabs.spotlight?.name}
        className="c-bevel flex h-11 w-full items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] text-plum-950 transition-colors hover:bg-mist-50 sm:hidden"
      >
        <Filter className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
        <span className="shrink-0 text-slate-600">Filter:</span>
        <span className="truncate font-semibold">{active?.label ?? "All"}</span>
        {active?.count !== undefined && (
          <span className="c-num ml-auto shrink-0 rounded bg-mist-100 px-1 text-[11px] font-semibold text-slate-600">
            {active.count}
          </span>
        )}
      </button>

      <BottomSheet open={filterOpen} onOpenChange={setFilterOpen} title="Filter by status">
        {/* Full-width rows rather than pills. The sheet has the width the strip
            never had, so nothing in here has to be found by scrolling. */}
        <div role="group" aria-label="Filter by status" className="space-y-1">
          {tabs.options.map((option) => {
            const isActive = tabs.value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  tabs.onChange(option.value);
                  setFilterOpen(false);
                }}
                className={`flex h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] font-medium transition-colors ${
                  isActive ? "bg-plum-950 text-white" : "text-plum-950 hover:bg-mist-100"
                }`}
              >
                {/* Held in the layout rather than dropped from it, so the labels
                    do not shift sideways as the choice moves down the list. */}
                <Check
                  className={`h-4 w-4 shrink-0 ${isActive ? "" : "invisible"}`}
                  aria-hidden="true"
                />
                <span className="truncate">{option.label}</span>
                {option.count !== undefined && (
                  <span
                    className={`c-num ml-auto shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${
                      isActive ? "bg-white/20 text-white" : "bg-mist-100 text-slate-600"
                    }`}
                  >
                    {option.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* The sort control follows the statuses rather than being dropped on a
            phone. `[&>*]:w-full` because the caller sized it for a dense toolbar
            row and it is in a sheet now. */}
        {trailing && (
          <div className="mt-3 border-t border-mist-200 pt-3 [&>*]:w-full">{trailing}</div>
        )}
      </BottomSheet>

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
        /* `gap-2`, not `gap-1`: each pill carries `.c-tap`, whose 44px halo
           bleeds vertically past a 28px box, and neighbours 4px apart steal each
           other's edges. The pills are all wider than 44px, so nothing about the
           drawn density changes.

           The fade cancels from `lg` up in console.css rather than as a
           `[mask-image:none]` variant here. Tailwind's utilities are layered and
           that file is not, so the variant would never win, and the strip would
           keep dimming its last pill at widths where it no longer scrolls. */
        className="no-scrollbar c-scroll-fade c-scroll-fade--from-lg -mx-1 hidden gap-2 overflow-x-auto px-1 sm:flex"
      >
        {tabs.options.map((option) => {
          const isActive = tabs.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => tabs.onChange(option.value)}
              data-spotlight={tabs.spotlight?.value === option.value ? tabs.spotlight.name : undefined}
              /* 36px through the tablet band and the desk density from `md` up,
                 plus `.c-tap` at EVERY width. Width alone is the wrong question
                 here: an iPad in portrait is 768px and is all thumb, so keying
                 the target size off the breakpoint handed the console's primary
                 filter to a finger as a row of 28px pills. The drawn density is
                 unchanged; only the hit area grows, and only where the pointer
                 is coarse. */
              className={`c-tap flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors md:h-7 md:px-2.5 ${
                isActive
                  ? "bg-plum-950 text-white"
                  : "text-slate-600 hover:bg-mist-100 hover:text-plum-950"
              }`}
            >
              {option.label}
              {option.count !== undefined && (
                <span
                  className={`c-num rounded px-1 text-[11px] font-semibold ${
                    isActive ? "bg-white/20 text-white" : "bg-mist-100 text-slate-600"
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The search box takes the whole row below `sm`. It used to share it with
          the caller's sort control, which is sized by its longest option and
          does not shrink, so "Recently updated" left the search about 145px at
          360px. At that width the sort control is in the sheet instead. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:ml-auto">
        <input
          type="search"
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className="h-11 w-full min-w-0 rounded-lg border border-mist-200 bg-white px-3 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500 sm:h-8 sm:px-2.5 xl:w-56"
        />
        {/* `sm:contents`, so from `sm` up the caller's node is a direct child of
            this row exactly as it was before the sheet existed. */}
        {trailing && <div className="hidden sm:contents">{trailing}</div>}
      </div>
    </div>
  );
}
