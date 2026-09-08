"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Plus, Star, Trash2 } from "lucide-react";
import {
  PROPERTY_STATUSES,
  formatPriceShort,
  statusLabel,
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
  "for-sale": "green",
  "for-rent": "wine",
  sold: "neutral",
  draft: "amber",
  archived: "neutral",
};

export default function PropertiesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PropertyStatus>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("updated");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  /*
   * Trimmed once, here, and every consumer reads this. Passing the raw box
   * through meant "lag " matched nothing while "lag" matched, and the empty
   * state then quoted the trimmed string back: the console showed the operator
   * a query that works next to the news that it did not.
   */
  const query = useDebounced(search).trim();

  /* Keyset paging, and the reset that comes with a changed filter, both live in
     one hook so three list screens cannot drift apart. */
  const paging = useCursorStack(query);

  function refilter(apply: () => void) {
    apply();
    paging.reset();
  }

  const { data, error, loading, reload } = useAsync<Page<Property>>(
    (signal) =>
      api.get<Page<Property>>(
        `/admin/properties?${new URLSearchParams({
          limit: "25",
          sort,
          withTotal: "1",
          ...(tab === "all" ? {} : { status: tab }),
          ...(query ? { q: query } : {}),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [tab, sort, query, paging.cursor],
  );

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ property: Property }>("/admin/properties");
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
  const filtered = tab !== "all" || query !== "";

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
            <>
              {p.featured && (
                <Star
                  className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                  aria-label="Featured on the homepage"
                />
              )}
              {p.deletedAt !== null && (
                <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="In the trash" />
              )}
            </>
          }
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      render: (p) => <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>,
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
          {formatPriceShort(p.priceMinor, p.status, p.currency)}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      numeric: true,
      mobile: "keep",
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
          <Button onClick={create} disabled={creating} size="lg">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? "Creating" : "New listing"}
          </Button>
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
              onChange: (value) => refilter(() => setTab(value as "all" | PropertyStatus)),
            }}
            search={{
              value: search,
              // The admin endpoint matches substrings across title, city,
              // location and tagline, so the box narrows as you type and the
              // placeholder can say so without overclaiming.
              placeholder: "Filter by title, city or area",
              onChange: setSearch,
            }}
            trailing={
              <label className="shrink-0">
                <span className="sr-only">Sort listings</span>
                <select
                  value={sort}
                  onChange={(event) => refilter(() => setSort(event.target.value as typeof sort))}
                  className="h-8 rounded-lg border border-mist-200 bg-white px-2 text-[13px] font-medium text-plum-950 outline-none transition-colors focus:border-wine-500"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
                    refilter(() => {
                      setTab("all");
                      setSearch("");
                    })
                  }
                >
                  Clear the filter
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No listings yet"
              hint="A listing starts as a draft, so you can create one now and fill it in as the photos and the price arrive."
              action={
                <Button onClick={create} disabled={creating} size="lg">
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
