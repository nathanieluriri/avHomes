"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Building2, Plus, Star, Trash2 } from "lucide-react";
import {
  LISTING_TYPES,
  PROPERTY_STATUSES,
  formatPriceShort,
  statusLabel,
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
  const tab = (params.get("status") ?? "all") as "all" | PropertyStatus;
  const listingTypeFilter = (params.get("type") ?? "all") as "all" | ListingType;
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

  /*
   * `replace`, not `push`: typing in the filter box would otherwise put one
   * history entry per keystroke between the operator and wherever they came
   * from. `scroll: false` because a filter change is not a navigation.
   */
  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      /*
       * EMPTY deletes. "all" does not, and treating it as a sentinel for every
       * key was a bug with teeth: `q` is free text, so typing "allen" into the
       * filter box deleted the param on the third keystroke and the input
       * snapped back to empty. Allen Avenue is one of the best-known addresses
       * in Lagos. The tabs that do use "all" now map it to "" themselves.
       */
      if (value === "") next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "/admin/properties", { scroll: false });
    },
    [params, router],
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

  useEffect(() => {
    if (query === urlQuery.trim()) return;
    setParam("q", query);
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
          ...(listingTypeFilter === "all" ? {} : { listingType: listingTypeFilter }),
          ...(query ? { q: query } : {}),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [tab, listingTypeFilter, sort, query, paging.cursor],
    /* Hold the rows while the next filter loads. Blanking a list this long to
       four skeleton rows clamps the console's scroller back to the top, so a
       tap on a status pill silently relocates the reader. */
    { keepPrevious: true },
  );

  async function create(title: string) {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ property: Property }>("/admin/properties", { title });
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
  const filtered = tab !== "all" || listingTypeFilter !== "all" || query !== "";

  const columns: Column<Property>[] = [
    {
      key: "listing",
      header: "Listing",
      primary: true,
      render: (p) => (
        <IdCell
          thumb={
            p.images[0] ? (
              <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-4 w-4" aria-hidden="true" />
            )
          }
          title={p.title || "Untitled listing"}
          meta={[p.type, p.city].filter(Boolean).join(" · ") || "No location yet"}
          trailing={
            /* Icons in the TABLE only. Below `md` these two are drawn as badges
               on the card's chip line instead, because a 14px glyph pinned to
               the ellipsis of a two-line title is the least readable place in
               the row for the fact that decides whether the row is worth
               opening. The wrapper is conditional rather than always present:
               an empty flex item still spends the parent's 6px gap. */
            p.featured || p.deletedAt !== null ? (
              <span className="hidden items-center gap-1 md:flex">
                {p.featured && (
                  <Star
                    className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                    aria-label="Featured on the homepage"
                  />
                )}
                {p.deletedAt !== null && (
                  <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="In the trash" />
                )}
              </span>
            ) : null
          }
        />
      ),
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
      render: (p) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
          {/* Quieter than the lifecycle badge on purpose: the deal type does not
              change on its own the way a status does, so it reads as a label
              rather than as a second thing that just happened. */}
          <Badge tone="neutral">{p.listingType === "sale" ? "Sale" : "Rent"}</Badge>
          {p.featured && (
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
      ),
    },
    {
      key: "spec",
      header: "Spec",
      // Kept on the phone card. The collapse drops what it cannot fit, and a
      // bed count is one of the two facts that actually govern a scan here.
      mobile: "keep",
      render: (p) => (
        <span className="text-slate-600">
          {p.bedrooms || p.bathrooms
            ? `${p.bedrooms} bed · ${p.bathrooms} bath`
            : "Not set"}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      mobile: "keep",
      render: (p) => (
        <span className="font-semibold text-plum-950">
          {formatPriceShort(p.priceMinor, {
            listingType: p.listingType,
            rentPeriod: p.rentPeriod,
            currency: p.currency,
          })}
        </span>
      ),
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
            <form
              className="flex w-full items-center gap-2 sm:w-auto"
              onSubmit={(event) => {
                event.preventDefault();
                const title = newTitle.trim();
                if (title !== "") void create(title);
              }}
            >
              <input
                className={`${inputClass} sm:w-64`}
                autoFocus
                required
                maxLength={300}
                value={newTitle}
                placeholder="What is it called?"
                aria-label="New listing title"
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setNamingNew(false);
                    setNewTitle("");
                  }
                }}
              />
              <Button type="submit" disabled={creating || newTitle.trim() === ""} size="lg">
                {creating ? "Creating" : "Create"}
              </Button>
            </form>
          ) : (
            <Button onClick={() => setNamingNew(true)} disabled={creating} size="lg">
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
                    actually filters rather than reusing that word. */}
                <label className="w-full sm:w-auto sm:shrink-0">
                  <span className="sr-only">Filter by sale or rent</span>
                  <select
                    value={listingTypeFilter}
                    onChange={(event) =>
                      refilter(() =>
                        setParam("type", event.target.value === "all" ? "" : event.target.value),
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
              hint={
                query
                  ? `No listing matched "${query}" in this status.`
                  : "No listing has this status yet."
              }
              action={
                <Button
                  variant="ghost"
                  onClick={() =>
                    /* One replace, not three: three would each read a stale
                       `params` from this render and the last would win. */
                    refilter(() => {
                      setSearchInput("");
                      router.replace("/admin/properties", { scroll: false });
                    })
                  }
                >
                  Clear the filter
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
                <Button onClick={() => setNamingNew(true)} disabled={creating} size="lg">
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
