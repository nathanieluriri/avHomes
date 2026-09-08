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
            p.deletedAt !== null ? (
              <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="In the trash" />
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
      render: (p) => <Badge tone={TONE[p.status]}>{humanise(p.status)}</Badge>,
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
      render: (p) => <span className="text-slate-600">{p.author.name}</span>,
    },
    {
      key: "length",
      header: "Length",
      numeric: true,
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
              <label className="shrink-0">
                <span className="sr-only">Sort posts</span>
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
        /* Nothing when the load failed: the banner above already says why, and
           a first-run invitation under it would claim the account is empty. */
        empty={
          error ? undefined : filtered ? (
            <EmptyState
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
