"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, Search, X } from "lucide-react";
import { hasDomain, listingLabel, type AuthUser, type Page, type Property } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useDebounced, useIsTouch } from "@/lib/admin/hooks";
import { BottomSheet } from "./BottomSheet";
import { IconButton } from "./ui";
import { NAV_ITEMS, type NavItem } from "./nav";

/**
 * The topbar's search, opened by its handle or by Ctrl+K.
 *
 * It searches two things and says which is which: the console's own screens,
 * and listings by title through the endpoint the Listings screen already uses.
 * Nothing here is decorative. A search field in an admin topbar that only
 * filters a static menu is the kind of control that teaches an operator to stop
 * reaching for it.
 *
 * IT IS A BOTTOM SHEET BELOW `sm`, and that is not a preference. Drawn as the
 * desktop box it was, it started 12vh down a 844px phone, which put the results
 * behind the keyboard the moment the field it opened with took focus. `vh` did
 * not save it either: that is the LARGE viewport and it does not shrink for a
 * keyboard. `BottomSheet` owns all of that now, so this file worries about the
 * search and nothing else.
 */

interface Row {
  key: string;
  href: string;
  title: string;
  meta: string;
  icon: React.ReactNode;
  group: "Go to" | "Listings";
}

export function Palette({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<Property[]>([]);
  // Trimmed for the same reason the Listings box is: a trailing space is a
  // keystroke, not a search term.
  const debounced = useDebounced(query, 220).trim();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* The cursor is a MOUSE affordance, so a device without one does not get it.
     The highlight is driven by `onMouseMove`, which never fires on a touch
     screen, so the fill, the wine text and the "press Enter" chevron were
     pinned to row zero forever: a phone read the first result as pre-selected
     and about to fire, on a device with no Enter key to fire it with. */
  const isTouch = useIsTouch();

  const destinations = useMemo(
    () => NAV_ITEMS.filter((item) => hasDomain(user.role, item.domain)),
    [user.role],
  );

  // The listing search only runs for somebody whose role could open the result.
  const maySearchListings = hasDomain(user.role, "listings");

  /*
   * Both resets happen DURING RENDER rather than in an effect. That is React's
   * own answer to "start over when an input changed", and it matters here: an
   * effect would paint the last search's results for one frame every time the
   * palette reopens.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setQuery("");
    setHits([]);
  }

  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    // A query too short to search must not leave the previous one's hits on
    // screen under it.
    if (query.trim().length < 2) setHits([]);
  }

  /*
   * The field takes focus, because the field is what somebody opened this for.
   *
   * The sheet is titled `srOnlyTitle`, so its header (Close button included) is
   * visually hidden rather than absent, and a visually hidden button is still
   * the first tabbable thing inside the panel. Radix focuses that on mount. This
   * runs after it: child effects commit before the parent's, so the last word on
   * where focus lands belongs to the component that knows what the sheet is for.
   */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !maySearchListings || debounced.length < 2) return;
    const controller = new AbortController();
    api
      .get<Page<Property>>(
        `/admin/properties?${new URLSearchParams({ q: debounced, limit: "6" })}`,
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted) setHits(page.items);
      })
      .catch(() => {
        // A failed lookup narrows the palette to its destinations, which still
        // work. Surfacing it would put an error banner inside a search box.
        if (!controller.signal.aborted) setHits([]);
      });
    return () => controller.abort();
  }, [open, debounced, maySearchListings]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = destinations.filter(
      (item) =>
        q === "" ||
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q),
    );
    const go: Row[] = matched.map((item: NavItem) => ({
      key: `nav:${item.href}`,
      href: item.href,
      title: item.label,
      meta: item.hint,
      icon: <item.icon className="h-4 w-4" aria-hidden="true" />,
      group: "Go to",
    }));
    const listings: Row[] = hits.map((p) => ({
      key: `listing:${p.id}`,
      href: `/admin/properties/${p.id}`,
      title: p.title || "Untitled listing",
      // The reader's own vocabulary, not the raw lifecycle: "Live" alone no
      // longer says whether this is a sale or a rental, now that the two are
      // split. listingLabel says both.
      meta: [listingLabel(p.listingType, p.status), p.city].filter(Boolean).join(" · "),
      icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
      group: "Listings",
    }));
    return [...go, ...listings];
  }, [destinations, hits, query]);

  /* Clamped rather than reset, so a highlight cannot survive into an index the
     new result set does not have and send Enter somewhere nobody chose. */
  const cursor = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);

  /* Arrowing past the fold has to bring the row with it, or the highlight walks
     off the bottom of a scrolled list and Enter fires on something unseen. */
  useEffect(() => {
    listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function go(row: Row | undefined) {
    if (!row) return;
    onClose();
    router.push(row.href);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Search the console"
      /* The sheet draws its own heading: the field IS the title here, and a
         "Search the console" line above a search box is the same sentence
         twice. The name stays for a screen reader, and so does the sentence
         saying what is searchable, which a sighted reader gets from the
         placeholder instead. */
      srOnlyTitle
      description="Type to find a screen, or a listing by title."
      /* ANCHORED NEAR THE TOP, not centred. The result list grows and shrinks
         with every keystroke, and a vertically centred box is re-centred each
         time it does: at 1280px the whole palette walked up and down the screen
         while somebody was reading it. */
      topAligned
      /* REPLACES the sheet's own `sm` width. Appending a second `sm:w-*` to
         `className` puts two arbitrary values of the same utility in the same
         variant, which resolves by Tailwind's build order rather than by which
         one was written last. */
      widthClassName="sm:w-[min(38rem,calc(100vw-1.5rem))]"
      /* Edges the `sm` and up box only. Below `sm` the sheet is full width and
         borderless, like every other one in the console. */
      className="sm:border sm:border-mist-200"
    >
      {/* The sheet's body pads its content, and both of these are full bleed:
          the field's rule has to reach the panel edges and the rows carry their
          own inset. Cancelled with margins rather than by overriding the
          padding, because two competing `px` utilities resolve by Tailwind's
          build order rather than by which one was written last.

          The keyboard handler sits here rather than on each control, so arrows
          and Enter work whether focus is in the field or on a row. */}
      <div
        className="-mx-4 -mb-4 sm:-mx-5"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(rows.length === 0 ? 0 : (cursor + 1) % rows.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(rows.length === 0 ? 0 : (cursor - 1 + rows.length) % rows.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(rows[cursor]);
          }
        }}
      >
        {/* Sticky, so a keyboard that squeezes the sheet down to a few rows
            cannot push the field somebody is typing in off the top of it. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-mist-200 bg-white pl-4 pr-2 sm:gap-3 sm:pr-4">
          <Search className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              maySearchListings ? "Search screens and listings" : "Search screens"
            }
            aria-label="Search the console"
            className="h-13 w-full bg-transparent py-4 text-sm text-plum-950 outline-none placeholder:text-slate-550"
          />
          {/* A phone has no Esc key, and with the keyboard up the only other
              way out was a tap on whatever sliver of overlay was left. The
              hint stays for the machine that has the key. */}
          <IconButton label="Close search" icon={X} onClick={onClose} className="sm:hidden" />
          <kbd className="hidden shrink-0 rounded border border-mist-200 bg-mist-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 sm:block">
            Esc
          </kbd>
        </div>

        {/* `dvh`, not `vh`: `vh` is the large viewport, so a cap measured in it
            does not shrink when the browser chrome or the keyboard arrives,
            which is the one moment the cap exists for. */}
        <div
          ref={listRef}
          className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain p-2"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-600">
              {query.trim() === ""
                ? "Type to search."
                : `Nothing matched "${query.trim()}".`}
            </p>
          ) : (
            rows.map((row, index) => {
              const first = index === 0 || rows[index - 1].group !== row.group;
              const marked = index === cursor && !isTouch;
              return (
                <div key={row.key}>
                  {first && (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-550 first:pt-1">
                      {row.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(row)}
                    aria-current={marked}
                    data-cursor={index === cursor}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      marked ? "bg-wine-50 text-wine-700" : "text-plum-950"
                    }`}
                  >
                    <span className={marked ? "text-wine-600" : "text-slate-550"}>
                      {row.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      <span className="block truncate text-xs text-slate-600">{row.meta}</span>
                    </span>
                    {marked && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-wine-600" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
