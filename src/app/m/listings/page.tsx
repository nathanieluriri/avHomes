"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { ListingType, Page, Property } from "@avhomes/contracts";
import { AppShell, useMarketer, useReportBlock } from "@/components/marketer/AppShell";
import { IconListings } from "@/components/marketer/icons3d";
import {
  ListingCard,
  ListingCardSkeleton,
  listingPlace,
  listingPriceText,
} from "@/components/marketer/listings/ListingCard";
import { HeroArt, HeroHint } from "@/components/marketer/team/bits";
import { shareOrWhatsApp, useCanShare, useSpotlight } from "@/components/marketer/team/share";
import { Button, EmptyState, ErrorNote, Segmented } from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";

/**
 * Listings: every live home, to share with a buyer or to report a deal on.
 *
 * A shared link carries the marketer's code as `?ref=`, which the public
 * listing page keeps for the visit, so an enquiry sent from it names them.
 *
 * `?focus=<id>` comes from an Updates card about one listing. The list opens
 * on that listing's kind, scrolls to it and rings it once.
 */

const KINDS: readonly { value: ListingType; label: string }[] = [
  { value: "sale", label: "For sale" },
  { value: "rent", label: "For rent" },
];

const PAGE = 24;
/** The API's own ceiling is 100. */
const MOST = 96;

function homesPath(kind: ListingType, q: string, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), status: "live", listingType: kind });
  if (q !== "") params.set("q", q);
  return `/public/properties?${params.toString()}`;
}

function onPopState(change: () => void) {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

/**
 * Read from the address rather than `useSearchParams`, which would need a
 * Suspense boundary to build. The store is re-read after the commit that
 * changes the address, so an in-app link lands with the right value.
 */
function useFocusParam(): string | null {
  return useSyncExternalStore(
    onPopState,
    () => new URLSearchParams(window.location.search).get("focus"),
    () => null,
  );
}

export default function ListingsPage() {
  const [typed, setTyped] = useState("");

  return (
    <AppShell
      title="Listings"
      back="/m"
      tab="Homes to share"
      hero={
        <>
          <HeroArt>
            <IconListings size={92} />
          </HeroArt>
          <HeroHint>Every home you share carries your code.</HeroHint>
          <SearchField value={typed} onChange={setTyped} />
        </>
      }
    >
      <ListingsBody typed={typed} onClear={() => setTyped("")} />
    </AppShell>
  );
}

/** Glass on the wine, so it reads as part of the hero rather than a form. */
function SearchField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="relative mt-4">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/70"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search a name, an area or a city"
        aria-label="Search homes"
        autoComplete="off"
        enterKeyHint="search"
        className="m-glass h-12 w-full rounded-[16px] pl-11 pr-12 text-white outline-none transition-colors placeholder:text-white/60 focus:bg-white/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the search"
          className="m-press m-tap absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-white/85 active:bg-white/15"
        >
          <X className="h-[18px] w-[18px]" aria-hidden />
        </button>
      )}
    </div>
  );
}

function ListingsBody({ typed, onClear }: { typed: string; onClear: () => void }) {
  const { me } = useMarketer();
  const canReport = useReportBlock() === null;
  const canShare = useCanShare();
  const focus = useFocusParam();
  const spotlight = useSpotlight(focus);

  const query = useDebounced(typed.trim(), 350);
  const [chosen, setChosen] = useState<ListingType | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // A new search starts from the first page again.
  const [limitFor, setLimitFor] = useState(query);
  if (limitFor !== query) {
    setLimitFor(query);
    setLimit(PAGE);
  }

  const list = useAsync(
    async (signal) => {
      const first = chosen ?? "sale";
      const page = await api.get<Page<Property>>(homesPath(first, query, limit), signal);
      // A focused rent listing is not in the sale list the screen opens on.
      if (focus && chosen === null && query === "" && !page.items.some((p) => p.id === focus)) {
        const other = await api.get<Page<Property>>(homesPath("rent", "", limit), signal);
        if (other.items.some((p) => p.id === focus)) return { kind: "rent" as const, page: other };
      }
      return { kind: first, page };
    },
    [chosen, query, limit, focus],
    { keepPrevious: true },
  );

  const kind = chosen ?? list.data?.kind ?? "sale";
  const items = list.data?.page.items ?? [];
  const more = Boolean(list.data?.page.nextCursor) && query === "" && limit < MOST;

  function share(property: Property) {
    if (!me || !property.slug) return;
    const url = `${window.location.origin}/listings/${property.slug}?ref=${encodeURIComponent(me.marketer.code)}`;
    const place = listingPlace(property);
    void shareOrWhatsApp({
      title: property.title,
      text: `Have a look at this home on AV Homes: ${property.title}${place ? `, ${place}` : ""}. ${listingPriceText(property)}.`,
      url,
    });
  }

  let content: ReactNode;
  if (list.error) {
    content = <ErrorNote error={list.error} onRetry={list.reload} />;
  } else if (!list.data) {
    content = (
      <div className="space-y-4">
        <ListingCardSkeleton />
        <ListingCardSkeleton />
      </div>
    );
  } else if (items.length === 0) {
    content =
      query !== "" ? (
        <EmptyState
          art={<IconListings size={104} />}
          title="No home matches that"
          hint="Try fewer words, or just the name of the area or the estate."
          action={
            <Button variant="secondary" size="lg" onClick={onClear}>
              Clear the search
            </Button>
          }
        />
      ) : (
        <EmptyState
          art={<IconListings size={104} />}
          title={kind === "sale" ? "No homes for sale right now" : "No homes for rent right now"}
          hint="New homes show up here the day they go live."
        />
      );
  } else {
    content = (
      <>
        <ul
          aria-busy={list.loading || undefined}
          className={`space-y-4 transition-opacity duration-200 ${list.loading ? "opacity-60" : ""}`}
        >
          {items.map((property) => (
            <li key={property.id}>
              <ListingCard
                property={property}
                canShare={canShare}
                shareReady={me !== null}
                canReport={canReport}
                onShare={() => share(property)}
                spotlight={property.id === focus ? spotlight : undefined}
              />
            </li>
          ))}
        </ul>
        {more && (
          <Button
            variant="secondary"
            size="lg"
            full
            className="mt-5"
            busy={list.loading}
            onClick={() => setLimit((was) => Math.min(MOST, was + PAGE))}
          >
            Show more homes
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="px-4">
      <Segmented
        value={kind}
        options={KINDS}
        onChange={(next) => {
          setChosen(next);
          setLimit(PAGE);
        }}
        label="Which homes"
      />
      <div className="mt-4">{content}</div>
    </div>
  );
}
