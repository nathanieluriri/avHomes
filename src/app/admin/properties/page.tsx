"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Building2, LandPlot, Plus, Star, Trash2 } from "lucide-react";
import {
  ESTATE_TYPE,
  LISTING_TYPES,
  PROPERTY_STATUSES,
  canFeature,
  estateSummary,
  formatPriceShort,
  formatSqm,
  isEstate,
  prototypeLabel,
  statusLabel,
  type EstatePrototype,
  type EstateSummary,
  type ListingType,
  type Page,
  type Property,
  type PropertyStatus,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced, useCursorStack } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  PageHeader,
  inputClass,
  type Tone,
} from "@/components/admin/ui";
import {
  DataTable,
  IdCell,
  TablePager,
  TableToolbar,
  type Column,
} from "@/components/admin/DataTable";

/**
 * The Listings screen.
 *
 * The workhorse shape: header, toolbar, one table, pager. Everything that could
 * have been a second table on this page is either a column or its own route.
 */

const TABS = [
  { value: "all", label: "All" },
  ...PROPERTY_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
] as const;

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Recently published" },
  { value: "price-high", label: "Price, high to low" },
  { value: "price-low", label: "Price, low to high" },
] as const;

type Kind = "home" | "estate";

const KINDS = [
  { value: "", label: "All" },
  { value: "home", label: "Homes" },
  { value: "estate", label: "Estates" },
] as const;

const NEW_KINDS = [
  { value: "home", label: "Home" },
  { value: "estate", label: "Estate" },
] as const;

const STATUS_TONE: Record<PropertyStatus, Tone> = {
  draft: "amber",
  live: "green",
  "under-offer": "wine",
  closed: "neutral",
  archived: "neutral",
};

/**
 * A Suspense boundary, because the screen below reads `useSearchParams`.
 *
 * Next prerenders this route, and a client component reading the query string
 * inside a prerender has to sit under a boundary or the build refuses. This is
 * the same construct that costs the PUBLIC listings page its server-rendered
 * grid, and it is free here: the console is noindex, client-driven, and fetches
 * everything after mount anyway, so there is no crawler to lose and nothing to
 * server-render that was not already going to arrive late.
 */
export default function PropertiesPage() {
  return (
    <Suspense fallback={null}>
      <PropertiesScreen />
    </Suspense>
  );
}

function PropertiesScreen() {
  const router = useRouter();
  const params = useSearchParams();

  /*
   * THE URL IS THE SOURCE OF TRUTH for every filter on this screen.
   *
   * All four lived in `useState`, so `location.search` stayed empty and a
   * filtered view could not be bookmarked, sent to somebody, or survive a
   * refresh: an operator working through drafts lost their place on every
   * reload. The public listings page has always done this correctly, which made
   * the console the odd one out.
   *
   * Derived rather than mirrored. A second copy in state would need syncing
   * back on every navigation, including the browser's own Back button, and that
   * is the bug this shape avoids rather than manages.
   */
  // Unknown values read as "all", so the empty state can never name a filter that is not on.
  const statusParam = params.get("status");
  const tab: "all" | PropertyStatus = PROPERTY_STATUSES.find((s) => s === statusParam) ?? "all";
  const kindParam = params.get("kind");
  const kind: Kind | "" = kindParam === "estate" || kindParam === "home" ? kindParam : "";
  /* An estate is always a sale, so a Sale/Rent choice carried over from another
     view would only ever empty the estates list. Ignored rather than trusted. */
  const typeParam = params.get("type");
  const listingTypeFilter: "all" | ListingType =
    kind === "estate" ? "all" : (LISTING_TYPES.find((t) => t === typeParam) ?? "all");
  const sortParam = params.get("sort");
  const sort = (SORTS.some((s) => s.value === sortParam) ? sortParam : "updated") as
    (typeof SORTS)[number]["value"];
  const urlQuery = params.get("q") ?? "";

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  /*
   * The New button ASKS FOR A TITLE before it writes anything.
   *
   * It used to POST on the click and navigate, so a mis-click persisted a row
   * titled "Untitled listing" with a price of zero, and backing out left it
   * behind for somebody to find and clear later. The only feedback during the
   * round trip was the label changing.
   *
   * Naming it first removes both problems at once and one more besides: the
   * slug is derived from the title at publish and never regenerated, so a
   * listing published while still called "Untitled listing" was stuck at
   * /listings/untitled-listing for good. A title typed here is the title that
   * becomes the URL.
   */
  const [namingNew, setNamingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<Kind>("home");
  const newTitleRef = useRef<HTMLInputElement>(null);

  // Starts in Estate mode while the estates view is on, since that is what the reader is looking at.
  function startNew(kindOfNew: Kind = kind === "estate" ? "estate" : "home") {
    setNewKind(kindOfNew);
    setNamingNew(true);
    // `autoFocus` only fires on mount, so a form that is already open needs the focus moved by hand.
    newTitleRef.current?.focus();
  }

  function cancelNew() {
    setNamingNew(false);
    setNewTitle("");
    setNewKind("home");
    setCreateError(null);
  }

  /*
   * `replace`, not `push`: typing in the filter box would otherwise put one
   * history entry per keystroke between the operator and wherever they came
   * from. `scroll: false` because a filter change is not a navigation.
   */
  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      /*
       * EMPTY deletes. "all" does not, and treating it as a sentinel for every
       * key was a bug with teeth: `q` is free text, so typing "allen" into the
       * filter box deleted the param on the third keystroke and the input
       * snapped back to empty. Allen Avenue is one of the best-known addresses
       * in Lagos. The tabs that do use "all" now map it to "" themselves.
       */
      for (const [key, value] of Object.entries(updates)) {
        if (value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "/admin/properties", { scroll: false });
    },
    [params, router],
  );

  const setParam = useCallback(
    (key: string, value: string) => setParams({ [key]: value }),
    [setParams],
  );

  /*
   * Trimmed once, here, and every consumer reads this. Passing the raw box
   * through meant "lag " matched nothing while "lag" matched, and the empty
   * state then quoted the trimmed string back: the console showed the operator
   * a query that works next to the news that it did not.
   */
  /*
   * The box keeps its OWN state and the URL gets the settled value.
   *
   * Reading the box straight off the query string made every keystroke a
   * `router.replace`, which is a full RSC round trip: eight characters cost
   * eight history writes, eight server renders and eight API calls, and typing
   * a word took tens of seconds. `useDebounced` could not coalesce anything,
   * because consecutive values never arrived inside its window when each one
   * had to wait for the router to commit first.
   *
   * So the input is local, the debounce sits between it and the URL, and the
   * URL still ends up carrying exactly what the operator meant, which is what
   * makes a filtered view shareable.
   */
  const [searchInput, setSearchInput] = useState(urlQuery);
  const query = useDebounced(searchInput).trim();

  /* Writes only when the SETTLED value moves. When the URL could trigger it too,
     "Clear the filter" dropped `q` while the debounce still held the old term,
     and this wrote it straight back. */
  const writtenQuery = useRef(query);
  useEffect(() => {
    if (query === writtenQuery.current) return;
    writtenQuery.current = query;
    if (query !== urlQuery.trim()) setParam("q", query);
  }, [query, urlQuery, setParam]);

  /* Keyset paging, and the reset that comes with a changed filter, both live in
     one hook so three list screens cannot drift apart. */
  const paging = useCursorStack(query);

  function refilter(apply: () => void) {
    apply();
    paging.reset();
  }

  /* The debounce still applies to what is TYPED; the URL carries the settled
     value, so a bookmarked link is the query the operator meant. */

  const { data, error, loading, reload } = useAsync<Page<Property>>(
    (signal) =>
      api.get<Page<Property>>(
        `/admin/properties?${new URLSearchParams({
          limit: "25",
          sort,
          withTotal: "1",
          ...(tab === "all" ? {} : { status: tab }),
          ...(kind === "" ? {} : { kind }),
          ...(listingTypeFilter === "all" ? {} : { listingType: listingTypeFilter }),
          ...(query ? { q: query } : {}),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [tab, kind, listingTypeFilter, sort, query, paging.cursor],
    /* Hold the rows while the next filter loads. Blanking a list this long to
       four skeleton rows clamps the console's scroller back to the top, so a
       tap on a status pill silently relocates the reader. */
    { keepPrevious: true },
  );

  async function create(title: string, kindOfNew: Kind) {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ property: Property }>(
        "/admin/properties",
        kindOfNew === "estate" ? { title, type: ESTATE_TYPE } : { title },
      );
      router.push(`/admin/properties/${res.property.id}`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      setCreating(false);
    }
  }

  const rows = data?.items ?? [];
  // Kind is left out: an empty kind with nothing else narrowing it gets its own first-run state below.
  const filtered = tab !== "all" || listingTypeFilter !== "all" || query !== "";

  const columns: Column<Property>[] = [
    {
      key: "listing",
      header: "Listing",
      primary: true,
      render: (p) => {
        const estate = isEstate(p.type);
        // An estate with no photos of its own yet can still show an option's render.
        const thumb = p.images[0] || (estate ? p.prototypes.find((o) => o.image)?.image : null);
        const meta = [p.type, p.city].filter(Boolean).join(" · ") || "No location yet";
        const options = estate ? optionNames(p) : "";
        const featured = isFeatured(p);
        return (
          <IdCell
            thumb={
              thumb ? (
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : estate ? (
                <LandPlot className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Building2 className="h-4 w-4" aria-hidden="true" />
              )
            }
            title={p.title || "Untitled listing"}
            meta={
              options ? (
                <>
                  <span className="block truncate">{meta}</span>
                  {/* The card only. The table says this under the Spec column,
                      where it does not add a third line to the row. */}
                  <span className="block truncate text-slate-550 md:hidden">{options}</span>
                </>
              ) : (
                meta
              )
            }
            trailing={
              /* Icons in the TABLE only. Below `md` these two are drawn as badges
                 on the card's chip line instead, because a 14px glyph pinned to
                 the ellipsis of a two-line title is the least readable place in
                 the row for the fact that decides whether the row is worth
                 opening. The wrapper is conditional rather than always present:
                 an empty flex item still spends the parent's 6px gap. */
              featured || p.deletedAt !== null ? (
                <span className="hidden items-center gap-1 md:flex">
                  {featured && (
                    <Star
                      className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                      aria-label="Featured on the homepage"
                    />
                  )}
                  {p.deletedAt !== null && (
                    <Trash2
                      className="h-3.5 w-3.5 shrink-0 text-red-500"
                      aria-label="In the trash"
                    />
                  )}
                </span>
              ) : null
            }
          />
        );
      },
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      // The card's own slot, ahead of the meta run. Status is the value a scan
      // down this list is looking for and it does not read as one mid-sentence.
      badge: true,
      /* Featured and In trash ride along in this cell rather than claiming two
         columns of their own, because a column exists at every width and these
         two are already said by the icons in the table. Both change what a row
         MEANS, so neither may be what the collapse drops. */
      render: (p) => {
        const estate = isEstate(p.type);
        return (
          // One line in the table: the cell is `w-px`, so wrapping stacks every badge.
          <span className="inline-flex flex-wrap items-center gap-1.5 md:flex-nowrap">
            <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
            {/* Quieter than the lifecycle badge on purpose: the deal type does not
                change on its own the way a status does, so it reads as a label
                rather than as a second thing that just happened. An estate is
                always a sale, so its slot names what it is instead. */}
            <Badge tone="neutral">
              {estate ? "Estate" : p.listingType === "sale" ? "Sale" : "Rent"}
            </Badge>
            {/* The card's chip line only. The table says it under Spec, beside
                the availability it summarises. */}
            {estate && estateSummary(p.prototypes).soldOut && (
              <span className="md:hidden">
                <Badge tone="amber">Sold out</Badge>
              </span>
            )}
            {isFeatured(p) && (
              <span className="md:hidden">
                <Badge tone="amber">Featured</Badge>
              </span>
            )}
            {p.deletedAt !== null && (
              <span className="md:hidden">
                <Badge tone="red">In trash</Badge>
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "spec",
      header: "Spec",
      // Kept on the phone card. The collapse drops what it cannot fit, and a
      // bed count is one of the two facts that actually govern a scan here.
      mobile: "keep",
      render: (p) => {
        if (isEstate(p.type)) {
          const options = optionNames(p);
          const summary = estateSummary(p.prototypes);
          return (
            <span className="text-slate-600">
              <span className="md:flex md:items-center md:gap-2">
                {estateSpec(summary, p.prototypes)}
                {summary.soldOut && (
                  <span className="hidden md:inline-flex">
                    <Badge tone="amber">Sold out</Badge>
                  </span>
                )}
              </span>
              {/* `max-w` because a table cell sizes to its content, so a bare
                  `truncate` would widen the column instead of eliding. */}
              {options && (
                <span className="hidden max-w-[16rem] truncate text-[12px] text-slate-550 md:block">
                  {options}
                </span>
              )}
            </span>
          );
        }
        return (
          <span className="text-slate-600">
            {p.bedrooms || p.bathrooms ? `${p.bedrooms} bed · ${p.bathrooms} bath` : "Not set"}
          </span>
        );
      },
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      mobile: "keep",
      render: (p) => {
        const shape = {
          listingType: p.listingType,
          rentPeriod: p.rentPeriod,
          currency: p.currency,
        };
        if (isEstate(p.type)) {
          const { fromMinor } = estateSummary(p.prototypes);
          if (fromMinor === 0) return <span className="text-slate-600">Not set</span>;
          return (
            <span className="font-semibold text-plum-950">
              From {formatPriceShort(fromMinor, shape)}
            </span>
          );
        }
        if (p.priceMinor === 0) return <span className="text-slate-600">Not set</span>;
        return (
          <span className="font-semibold text-plum-950">
            {formatPriceShort(p.priceMinor, shape)}
          </span>
        );
      },
    },
    {
      key: "updated",
      header: "Updated",
      numeric: true,
      /* The 640 to 1023 card only. Below 640 the run is already the spec and
         the price, and a fourth value there is what turns a 328px meta line
         into a run-on sentence. */
      mobile: "tablet",
      // A bare "12 Sep" on a card has no column header saying which date it is.
      mobileLabel: "updated",
      render: (p) => <span className="text-slate-600">{shortDate(p.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={Building2}
        title="Listings"
        subtitle="Every property, including drafts and the trash."
        actions={
          namingNew ? (
            /* The kind is asked here, with the name, because it decides which
               form the editor opens on. Its own row on a phone so the title box
               keeps the width to type in. */
            <form
              data-spotlight="new-listing-form"
              className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                const title = newTitle.trim();
                if (title !== "") void create(title, newKind);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelNew();
              }}
            >
              <Segmented
                label="Kind of listing"
                value={newKind}
                options={NEW_KINDS}
                onChange={(value) => {
                  setNewKind(value);
                  // Back to the title, which is what gets typed next.
                  newTitleRef.current?.focus();
                }}
                className="h-11 flex-1 sm:h-9 sm:flex-none"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={newTitleRef}
                  className={`${inputClass} sm:w-64`}
                  autoFocus
                  required
                  maxLength={300}
                  value={newTitle}
                  placeholder={
                    newKind === "estate" ? "Estate name, like Kuje Estate" : "What is it called?"
                  }
                  aria-label={newKind === "estate" ? "New estate name" : "New listing title"}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
                <Button type="submit" disabled={creating || newTitle.trim() === ""} size="lg">
                  {creating ? "Creating" : "Create"}
                </Button>
                <Button variant="ghost" onClick={cancelNew} disabled={creating} size="lg">
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button onClick={() => startNew()} disabled={creating} size="lg" spotlight="new-listing">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New listing
            </Button>
          )
        }
      />

      {/* Errors sit above the content they concern and below the header that
          says where you are. A banner under a table is a banner nobody reads. */}
      {createError && (
        <div className="mb-4">
          <ErrorNote error={createError} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Listings"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        hrefFor={(p) => `/admin/properties/${p.id}`}
        loading={loading}
        toolbar={
          /*
           * Homes or estates on a row of its own, above the statuses. In the
           * trailing slot it would overflow the one-row `xl` toolbar and clip the
           * last status pill, and below `sm` it would be hidden in the filter
           * sheet whose button only names the status, so an estates-only list
           * would look like the whole account.
           */
          <div className="flex flex-col gap-3">
            <ViewTabs
              label="Show homes or estates"
              value={kind}
              options={KINDS}
              onChange={(value) =>
                refilter(() =>
                  setParams(value === "estate" ? { kind: value, type: "" } : { kind: value }),
                )
              }
            />
            <TableToolbar
              tabs={{
                value: tab,
                options: TABS,
                onChange: (value) =>
                  refilter(() => setParam("status", value === "all" ? "" : value)),
              }}
              search={{
                value: searchInput,
                // The admin endpoint matches substrings across title, city,
                // location and tagline, so the box narrows as you type and the
                // placeholder can say so without overclaiming.
                placeholder: "Filter by title, city or area",
                onChange: setSearchInput,
              }}
              trailing={
                <>
                  {/* A separate axis from the status tabs. "Type" already means
                      Villa or Duplex on this screen, so this is named for what it
                      actually filters rather than reusing that word. Absent for
                      estates, which are always sales. */}
                  {kind !== "estate" && (
                    <label className="w-full sm:w-auto sm:shrink-0">
                      <span className="sr-only">Filter by sale or rent</span>
                      <select
                        value={listingTypeFilter}
                        onChange={(event) =>
                          refilter(() =>
                            setParam(
                              "type",
                              event.target.value === "all" ? "" : event.target.value,
                            ),
                          )
                        }
                        className={`${inputClass} font-medium sm:h-8 sm:w-auto sm:px-2 sm:py-0`}
                      >
                        <option value="all">All types</option>
                        {LISTING_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t === "sale" ? "Sale" : "Rent"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="w-full sm:w-auto sm:shrink-0">
                    <span className="sr-only">Sort listings</span>
                    {/* `inputClass` rather than a hand-rolled height, so the phone
                        inherits the console's one answer to field sizing and to the
                        iOS focus zoom. Below `sm` this control lives in the filter
                        sheet and wants the full width; the `sm:` overrides put the
                        dense 32px toolbar box back exactly as it was. */}
                    <select
                      value={sort}
                      onChange={(event) => refilter(() => setParam("sort", event.target.value))}
                      className={`${inputClass} font-medium sm:h-8 sm:w-auto sm:px-2 sm:py-0`}
                    >
                      {SORTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              }
            />
          </div>
        }
        /*
         * Nothing at all when the load failed. The banner above already says the
         * server is unreachable, and the first-run state would sit underneath it
         * telling the operator their account is empty and inviting them to
         * create a listing they may well already have. Two true-looking
         * statements that contradict each other is worse than one.
         */
        empty={
          error ? undefined : filtered ? (
            <EmptyState
              bare
              icon={Building2}
              title="Nothing matched"
              hint={nothingMatchedHint({ query, status: tab, deal: listingTypeFilter, kind })}
              action={
                <Button
                  variant="ghost"
                  onClick={() =>
                    /* One replace, not three: three would each read a stale
                       `params` from this render and the last would win. The
                       homes or estates choice and the sort stay, since they
                       are views rather than filters. */
                    refilter(() => {
                      setSearchInput("");
                      const kept = new URLSearchParams({
                        ...(kind ? { kind } : {}),
                        ...(sort !== "updated" ? { sort } : {}),
                      }).toString();
                      router.replace(kept ? `?${kept}` : "/admin/properties", { scroll: false });
                    })
                  }
                >
                  Clear the filter
                </Button>
              }
            />
          ) : kind === "estate" ? (
            <EmptyState
              bare
              icon={LandPlot}
              title="No estates yet"
              hint="An estate is one listing with its options inside it: a 2 bed, a 3 bed and a 500 sqm plot share one page, one price list and one publish."
              action={
                <Button onClick={() => startNew("estate")} disabled={creating} size="lg">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create the first estate
                </Button>
              }
            />
          ) : kind === "home" ? (
            <EmptyState
              bare
              icon={Building2}
              title="No homes yet"
              hint="A home is a single property for sale or rent. It starts as a draft, so you can create one now and fill it in as the photos and the price arrive."
              action={
                <Button onClick={() => startNew("home")} disabled={creating} size="lg">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create the first home
                </Button>
              }
            />
          ) : (
            <EmptyState
              bare
              title="No listings yet"
              hint="A listing starts as a draft, so you can create one now and fill it in as the photos and the price arrive."
              /* Sends the reader to the same naming step as the header button,
                 rather than being a second door that writes a row on click. */
              action={
                <Button onClick={() => startNew("home")} disabled={creating} size="lg">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create the first listing
                </Button>
              }
              art={<ListingsArt />}
            />
          )
        }
        footer={
          <TablePager
            note={pagerNote(rows.length, data?.total, paging.page)}
            {...paging.pager(data?.nextCursor)}
          />
        }
      />
    </>
  );
}

/**
 * States the real scope of what is on screen.
 *
 * `total` is only present because this screen asked for it with `withTotal=1`,
 * and paging deliberately avoids the count otherwise. When it is absent the
 * note says how many are shown and nothing it cannot back up.
 */
function pagerNote(shown: number, total: number | undefined, page: number): string {
  const noun = shown === 1 ? "listing" : "listings";
  if (total === undefined) return `${shown} ${noun} on this page`;
  const from = (page - 1) * 25 + 1;
  return `${from} to ${from + shown - 1} of ${total}`;
}

// A row featured before the server cleared the flag on leaving live must not still wear the star.
function isFeatured(p: Property): boolean {
  return p.featured && canFeature(p);
}

/** "2 bedroom, 3 bedroom, 500 sqm plot and 1 more": the first few options, for a scan. */
function optionNames(p: Property): string {
  const names = p.prototypes.map(prototypeLabel);
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/**
 * "3 options · 2 to 4 bed", "Plots from 300 sqm", or both run together for a
 * mixed estate. With some options sold out the count becomes "2 of 3 available"
 * and the ranges describe only what can still be bought, as `estateSummary` does.
 */
function estateSpec(s: EstateSummary, prototypes: readonly EstatePrototype[]): string {
  if (s.count === 0) return "No options yet";
  const partial = s.availableCount > 0 && s.availableCount < s.count;
  const options = partial
    ? `${s.availableCount} of ${s.count} available`
    : `${s.count} ${s.count === 1 ? "option" : "options"}`;
  const beds =
    s.bedroomsMax === 0
      ? ""
      : s.bedroomsMin === s.bedroomsMax
        ? `${s.bedroomsMax} bed`
        : `${s.bedroomsMin} to ${s.bedroomsMax} bed`;
  // Not `hasPlots`, which counts sold-out plots too: a plot is named only while one can be bought.
  const openPlots = (partial ? prototypes.filter((o) => o.available) : prototypes).some(
    (o) => o.kind === "plot",
  );
  const plots = s.plotSqmMin > 0 ? `plots from ${formatSqm(s.plotSqmMin)}` : "";
  if (!s.hasHouses) {
    if (partial) return [options, plots].filter(Boolean).join(" · ");
    return plots ? `Plots from ${formatSqm(s.plotSqmMin)}` : options;
  }
  return [options, beds, openPlots ? plots || "plots" : ""].filter(Boolean).join(" · ");
}

const STATUS_PHRASE: Record<PropertyStatus, { is: string; among: (plural: string) => string }> = {
  draft: { is: "is a draft", among: () => "drafts" },
  live: { is: "is live", among: (plural) => `live ${plural}` },
  "under-offer": { is: "is under offer", among: (plural) => `${plural} under offer` },
  closed: { is: "is closed", among: (plural) => `closed ${plural}` },
  archived: { is: "is archived", among: (plural) => `archived ${plural}` },
};

/**
 * Names only the filters that are on: "No rent home is under offer.",
 * `No estate matched "zzz".`, `No listing matched "lekki" among drafts.`
 */
function nothingMatchedHint({
  query,
  status,
  deal,
  kind,
}: {
  query: string;
  status: "all" | PropertyStatus;
  deal: "all" | ListingType;
  kind: Kind | "";
}): string {
  const noun = kind === "estate" ? "estate" : kind === "home" ? "home" : "listing";
  const subject = deal === "all" ? noun : `${deal} ${noun}`;
  const phrase = status === "all" ? null : STATUS_PHRASE[status];
  if (query) {
    // The plain noun here: the subject already carries Sale or Rent.
    const among = phrase ? ` among ${phrase.among(`${noun}s`)}` : "";
    return `No ${subject} matched "${query}"${among}.`;
  }
  return phrase ? `No ${subject} ${phrase.is}.` : `No ${subject}s yet.`;
}

/**
 * A one-of-few choice, drawn as the editor's Sale/Rent pills so the console has
 * one look for it. `className` carries the per-site height and width.
 *
 * Not `listing/Segmented`: that one fixes its height at 36px then 28px from
 * `sm`, and needs a visible `Field` label for its name. Here the pills match the
 * 44px, 36px, 28px steps of the status tabs and the Create button beside them,
 * and are named by `aria-label`.
 */
function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  className: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`c-tap rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${className} ${
              active
                ? "bg-plum-950 text-white"
                : "bg-mist-100 text-slate-600 hover:bg-mist-200/70 hover:text-plum-950"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The view switch above the status pills, drawn as underlined tabs so it reads
 * as a level above them. Filled pills here out-shouted the filters below it.
 */
function ViewTabs<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-6 border-b border-mist-200">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`c-tap -mb-px h-11 border-b-2 text-[13px] font-semibold transition-colors sm:h-9 ${
              active
                ? "border-plum-950 text-plum-950"
                : "border-transparent text-slate-600 hover:border-mist-300 hover:text-plum-950"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The first-run shelf. Three stacked cards standing in for listings, drawn
 * rather than illustrated so it carries no photograph the site does not own.
 */
function ListingsArt() {
  return (
    <svg width="168" height="112" viewBox="0 0 168 112" fill="none" aria-hidden="true">
      <rect x="12" y="26" width="96" height="70" rx="10" fill="var(--mist-100)" />
      <rect x="28" y="16" width="112" height="82" rx="11" fill="var(--wine-50)" />
      <rect
        x="28.5"
        y="16.5"
        width="111"
        height="81"
        rx="10.5"
        stroke="var(--wine-100)"
      />
      <rect x="40" y="28" width="88" height="34" rx="7" fill="var(--wine-100)" />
      <path
        d="M56 54l12-13 10 11 7-7 11 12"
        stroke="var(--wine-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="102" cy="40" r="4.5" fill="var(--wine-500)" />
      <rect x="40" y="70" width="52" height="7" rx="3.5" fill="var(--mist-200)" />
      <rect x="40" y="82" width="32" height="6" rx="3" fill="var(--mist-200)" />
      <rect x="104" y="80" width="24" height="9" rx="4.5" fill="var(--wine-500)" />
    </svg>
  );
}
