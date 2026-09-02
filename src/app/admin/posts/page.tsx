"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Page, Post, PostStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/admin/ui";

const TABS: readonly { value: "all" | PostStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

const TONE: Record<PostStatus, "green" | "amber" | "neutral"> = {
  published: "green",
  draft: "amber",
  archived: "neutral",
};

export default function PostsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | PostStatus>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const query = useDebounced(search);

  const { data, error, loading, reload } = useAsync<Page<Post>>(
    (signal) =>
      api.get<Page<Post>>(
        `/admin/posts?${new URLSearchParams({
          limit: "25",
          ...(tab === "all" ? {} : { status: tab }),
          ...(query ? { q: query } : {}),
        })}`,
        signal,
      ),
    [tab, query],
  );

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ post: Post }>("/admin/posts");
      router.push(`/admin/posts/${res.post.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Posts served at /posts, drafts included."
        actions={
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating" : "New post"}
          </Button>
        }
      />

      {createError && (
        <div className="mb-4">
          <ErrorNote error={createError} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.value ? "bg-navy-950 text-white" : "bg-white text-navy-950 hover:bg-mist-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search titles and body text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <EmptyState title="No posts here" hint={query ? "Nothing matched." : "Write the first one."} />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-mist-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Author</th>
                <th className="px-5 py-3 text-right font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-mist-100 last:border-0 hover:bg-mist-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/posts/${p.id}`}
                      className="font-semibold text-navy-950 underline-offset-2 hover:underline"
                    >
                      {p.title || "Untitled post"}
                    </Link>
                    {p.deletedAt !== null && (
                      <span className="ml-2 text-xs font-semibold text-red-600">in trash</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={TONE[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.author.name}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
