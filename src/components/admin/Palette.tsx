"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Building2, CornerDownLeft, Search } from "lucide-react";
import { hasDomain, statusLabel, type AuthUser, type Page, type Property } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useDebounced } from "@/lib/admin/hooks";
import { NAV_ITEMS, type NavItem } from "./nav";

/**
 * The topbar's search, opened by its handle or by Ctrl+K.
 *
 * It searches two things and says which is which: the console's own screens,
 * and listings by title through the endpoint the Listings screen already uses.
 * Nothing here is decorative. A search field in an admin topbar that only
 * filters a static menu is the kind of control that teaches an operator to stop
 * reaching for it.
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
      meta: [statusLabel(p.status), p.city].filter(Boolean).join(" · "),
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
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="console-float fixed inset-0 z-[70] bg-navy-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Radix focuses the panel; the input is what somebody opened this for.
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
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
          className="console-float fixed left-1/2 top-[12vh] z-[71] w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-mist-200 bg-white shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="sr-only">Search the console</Dialog.Title>

          <div className="flex items-center gap-3 border-b border-mist-200 px-4">
            <Search className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                maySearchListings ? "Search screens and listings" : "Search screens"
              }
              aria-label="Search the console"
              className="h-13 w-full bg-transparent py-4 text-sm text-navy-950 outline-none placeholder:text-slate-550"
            />
            <kbd className="hidden shrink-0 rounded border border-mist-200 bg-mist-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 sm:block">
              Esc
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-600">
                {query.trim() === ""
                  ? "Type to search."
                  : `Nothing matched "${query.trim()}".`}
              </p>
            ) : (
              rows.map((row, index) => {
                const first = index === 0 || rows[index - 1].group !== row.group;
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
                      aria-current={index === cursor}
                      data-cursor={index === cursor}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        index === cursor ? "bg-blue-50 text-blue-700" : "text-navy-950"
                      }`}
                    >
                      <span
                        className={index === cursor ? "text-blue-600" : "text-slate-550"}
                      >
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.title}</span>
                        <span className="block truncate text-xs text-slate-600">{row.meta}</span>
                      </span>
                      {index === cursor && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
