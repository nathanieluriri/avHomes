"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Newspaper, Plus, Trash2 } from "lucide-react";
import type { Page, Post, PostStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced, useCursorStack } from "@/lib/admin/hooks";
import { humanise, shortDate } from "@/lib/admin/format";
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
 * The Journal list.
 *
 * The same shape as Listings, deliberately: header, toolbar, one table, pager.
 * Two screens that do the same job should not teach two different sets of
 * habits, so anything that differs here differs because the data does.
 */

const TABS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
] as const;

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Recently published" },
] as const;

const TONE: Record<PostStatus, Tone> = {
  published: "green",
  draft: "amber",
  archived: "neutral",
};

export default function PostsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PostStatus>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("updated");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const query = useDebounced(search).trim();

  /* Keyset paging, and the reset that goes with a changed filter, both
     live in one hook so three list screens cannot drift apart. */
  const paging = useCursorStack(query);

  function refilter(apply: () => void) {
    apply();
    paging.reset();
  }

  const { data, error, loading, reload } = useAsync<Page<Post>>(
    (signal) =>
      api.get<Page<Post>>(
        `/admin/posts?${new URLSearchParams({
          limit: "25",
          sort,
          ...(tab === "all" ? {} : { status: tab }),
          ...(query ? { q: query } : {}),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [tab, sort, query, paging.cursor],
    /* Hold the rows while the next filter loads. Blanking a list this long to
       four skeleton rows clamps the console's scroller back to the top, so a
       tap on a status pill silently relocates the reader. */
    { keepPrevious: true },
  );

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ post: Post }>("/admin/posts");
      router.push(`/admin/posts/${res.post.id}`);
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

  const columns: Column<Post>[] = [
    {
      key: "post",
      header: "Post",
      primary: true,
      render: (p) => (
        <IdCell
          thumb={
            p.coverImage?.url ? (
              <img src={p.coverImage.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Newspaper className="h-4 w-4" aria-hidden="true" />
            )
          }
          title={p.title || "Untitled post"}
          meta={p.slug ? `/posts/${p.slug}` : "No slug until it is published"}
          trailing={
            /* The table's copy of this fact. Below `md` it is a badge on the
               card's chip line instead, for the reason the listings screen
               gives: a 14px glyph at the ellipsis of a wrapped title is not
               where anybody reads whether a post is in the trash. */
            p.deletedAt !== null ? (
              <span className="hidden items-center md:flex">
                <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="In the trash" />
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
      // Its own slot on the card, ahead of the meta run, carrying the trash
      // flag with it. Same shape as Listings: two screens doing the same job
      // should not teach two different sets of habits.
      badge: true,
      render: (p) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Badge tone={TONE[p.status]}>{humanise(p.status)}</Badge>
          {p.deletedAt !== null && (
            <span className="md:hidden">
              <Badge tone="red">In trash</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      mobile: "keep",
      render: (p) => <span className="text-slate-600">{p.category}</span>,
    },
    {
      key: "author",
      header: "Author",
      // The 640 to 1023 card has the room for a fourth value; the 360px one
      // does not, and who wrote a draft is not what a scan of this list is for.
      mobile: "tablet",
      render: (p) => <span className="text-slate-600">{p.author.name}</span>,
    },
    {
      key: "length",
      header: "Length",
      numeric: true,
      /* Off the card at every width, alone among these columns. "4 min" needs
         the header to say what it measures, and the noun that would complete it
         on a card is a lie in the other branch: "Empty read" is not a reading
         time. The table keeps it, where the header does that job. */
      render: (p) => (
        <span className="text-slate-600">
          {p.wordCount > 0 ? `${p.readingTime} min` : "Empty"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      numeric: true,
      mobile: "keep",
      // A bare "12 Sep" on a card has no column header saying which date it is.
      mobileLabel: "updated",
      render: (p) => <span className="text-slate-600">{shortDate(p.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={Newspaper}
        title="Journal"
        subtitle="Everything served at /posts, drafts and trash included."
        actions={
          <Button onClick={create} disabled={creating} size="lg">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? "Creating" : "New post"}
          </Button>
        }
      />

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
        caption="Journal posts"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        hrefFor={(p) => `/admin/posts/${p.id}`}
        loading={loading}
        toolbar={
          <TableToolbar
            tabs={{
              value: tab,
              options: TABS,
              onChange: (value) => refilter(() => setTab(value as "all" | PostStatus)),
            }}
            search={{
              // The admin endpoint matches substrings across title, subtitle,
              // excerpt and category, so it narrows as you type.
              placeholder: "Filter by title or category",
              value: search,
              onChange: setSearch,
            }}
            trailing={
              <label className="w-full sm:w-auto sm:shrink-0">
                <span className="sr-only">Sort posts</span>
                {/* `inputClass` rather than a hand-rolled height, so the phone
                    inherits the console's one answer to field sizing and to the
                    iOS focus zoom. Below `sm` this control lives in the filter
                    sheet and wants the full width; the `sm:` overrides put the
                    dense 32px toolbar box back exactly as it was. */}
                <select
                  value={sort}
                  onChange={(event) => refilter(() => setSort(event.target.value as typeof sort))}
                  className={`${inputClass} font-medium sm:h-8 sm:w-auto sm:px-2 sm:py-0`}
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
        /* Nothing when the load failed: the banner above already says why, and
           a first-run invitation under it would claim the account is empty. */
        empty={
          error ? undefined : filtered ? (
            <EmptyState
              bare
              icon={Newspaper}
              title="Nothing matched"
              hint={
                query
                  ? `No post matched "${query}" in this status.`
                  : "No post has this status yet."
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
              bare
              title="Nothing written yet"
              hint="A post starts as a draft with a title and an empty page, so you can open one now and come back to it."
              action={
                <Button onClick={create} disabled={creating} size="lg">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Write the first post
                </Button>
              }
              art={<JournalArt />}
            />
          )
        }
        footer={
          <TablePager
            note={`${rows.length} ${rows.length === 1 ? "post" : "posts"} on this page`}
            {...paging.pager(data?.nextCursor)}
          />
        }
      />
    </>
  );
}

/** The first-run shelf: a page with a headline and a rule of body text. */
function JournalArt() {
  return (
    <svg width="168" height="112" viewBox="0 0 168 112" fill="none" aria-hidden="true">
      <rect x="16" y="20" width="98" height="80" rx="9" fill="var(--mist-100)" />
      <rect x="34" y="12" width="104" height="88" rx="10" fill="var(--wine-50)" />
      <rect x="34.5" y="12.5" width="103" height="87" rx="9.5" stroke="var(--wine-100)" />
      <rect x="48" y="26" width="52" height="9" rx="4.5" fill="var(--wine-500)" />
      <rect x="48" y="44" width="76" height="5" rx="2.5" fill="var(--mist-200)" />
      <rect x="48" y="56" width="76" height="5" rx="2.5" fill="var(--mist-200)" />
      <rect x="48" y="68" width="48" height="5" rx="2.5" fill="var(--mist-200)" />
      <circle cx="112" cy="30" r="5" fill="var(--wine-100)" />
      <path
        d="M110 30l1.6 1.6 3.4-3.4"
        stroke="var(--wine-600)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
