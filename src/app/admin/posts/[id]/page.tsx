"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { READING_TEMPLATES, type Post, type ReadingTemplate } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { canEditAsText, docToEditable, editableToDoc } from "@/lib/admin/doc-text";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/admin/ui";

const LIFECYCLE: readonly { op: string; label: string; when: (p: Post) => boolean }[] = [
  { op: "publish", label: "Publish", when: (p) => p.status !== "published" },
  { op: "unpublish", label: "Back to draft", when: (p) => p.status === "published" },
  { op: "archive", label: "Archive", when: (p) => p.status !== "archived" && p.deletedAt === null },
  { op: "restore", label: "Restore", when: (p) => p.deletedAt !== null || p.status === "archived" },
];

export default function PostEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<{ post: Post }>(
    (signal) => api.get<{ post: Post }>(`/admin/posts/${id}`, signal),
    [id],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return null;

  /*
   * REMOUNTED BY KEY rather than synced by an effect. The editor seeds ten
   * pieces of form state from this post once, at mount; keying on the id makes
   * navigating to another post a fresh component with fresh state.
   */
  return <PostEditor key={data.post.id} initial={data.post} />;
}

function PostEditor({ initial }: { initial: Post }) {
  const router = useRouter();
  const [post, setPost] = useState<Post>(initial);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [category, setCategory] = useState(initial.category);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [template, setTemplate] = useState<ReadingTemplate | "">(initial.template ?? "");
  const [coverUrl, setCoverUrl] = useState(initial.coverImage?.url ?? "");
  const [coverAlt, setCoverAlt] = useState(initial.coverImage?.alt ?? "");
  /*
   * A document this editor cannot express is detected ONCE, from the value it
   * was handed. A post carrying lists or tables renders read-only rather than
   * being silently flattened to paragraphs on the next save.
   */
  const [richBody] = useState(() => !canEditAsText(initial.content));
  const [body, setBody] = useState(() =>
    canEditAsText(initial.content) ? docToEditable(initial.content) : "",
  );
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(kind: "manual" | "autosave" = "manual") {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await api.patch<{ post: Post }>(`/admin/posts/${post.id}`, {
        patch: {
          title,
          subtitle,
          excerpt,
          category,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t !== ""),
          template: template === "" ? null : template,
          coverImage: coverUrl
            ? { url: coverUrl, alt: coverAlt, focalPoint: "50% 50%", width: 0, height: 0 }
            : null,
          // A document this editor cannot express is left untouched rather than
          // flattened. Omitting the key means the server keeps what it has.
          ...(richBody ? {} : { content: editableToDoc(body) }),
        },
        baseRevision: post.revision,
        kind,
        note: null,
      });
      setPost(res.post);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function transition(op: string) {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await api.post<{ post: Post }>(`/admin/posts/${post.id}/${op}`);
      setPost(res.post);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    setBusy(true);
    try {
      await api.del(`/admin/posts/${post.id}?baseRevision=${post.revision}`);
      router.push("/admin/posts");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  const theirs = saveError?.body.error === "stale_write" ? (saveError.body.post as Post | undefined) : undefined;

  return (
    <>
      <PageHeader
        title={post.title || "Untitled post"}
        subtitle={post.slug ? `/posts/${post.slug}` : "No slug yet. It is derived when you publish."}
        actions={
          <>
            <Link href="/admin/posts" className="text-sm text-muted-foreground underline underline-offset-2">
              Back
            </Link>
            <Button onClick={() => save()} disabled={busy}>
              {busy ? "Saving" : saved ? "Saved" : "Save"}
            </Button>
          </>
        }
      />

      {saveError && (
        <div className="mb-4">
          <ErrorNote error={saveError} />
          {theirs && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Their version is revision {theirs.revision}. Reload the page to take it, or copy your
              changes out first.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4">
            <Field label="Title">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Subtitle">
              <input className={inputClass} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </Field>
            <Field
              label="Excerpt"
              hint="Leave empty and the server derives it from the body on every save."
            >
              <textarea
                className={`${inputClass} min-h-20`}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </Field>
          </Card>

          <Card>
            {richBody ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">This post has rich formatting.</p>
                <p className="mt-1">
                  It contains lists, quotes, tables or inline formatting that a plain textarea cannot
                  represent. The body is left untouched when you save, so nothing is lost. Editing it
                  needs the rich editor.
                </p>
              </div>
            ) : (
              <Field
                label="Body"
                hint="Blank line between paragraphs. A line starting with ## becomes a heading."
              >
                <textarea
                  className={`${inputClass} min-h-96 font-mono text-[13px] leading-relaxed`}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <Badge tone={post.deletedAt ? "red" : post.status === "published" ? "green" : "amber"}>
                {post.deletedAt ? "In trash" : post.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {LIFECYCLE.filter((l) => l.when(post)).map((l) => (
                <Button key={l.op} variant="ghost" disabled={busy} onClick={() => transition(l.op)}>
                  {l.label}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <Field label="Category">
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
            <Field label="Tags" hint="Comma separated.">
              <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Reading template" hint="Empty follows the site default.">
              <select
                className={inputClass}
                value={template}
                onChange={(e) => setTemplate(e.target.value as ReadingTemplate | "")}
              >
                <option value="">Site default</option>
                {READING_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card className="space-y-4">
            <Field label="Cover image URL" hint="Upload in Images, then paste the URL.">
              <input
                className={`${inputClass} font-mono text-xs`}
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
              />
            </Field>
            <Field label="Cover alt text">
              <input className={inputClass} value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} />
            </Field>
          </Card>

          <Card className="space-y-2 text-sm">
            <Row label="Revision" value={String(post.revision)} />
            <Row label="Words" value={String(post.wordCount)} />
            <Row label="Reading time" value={`${post.readingTime} min`} />
            <Row label="Author" value={post.author.name} />
          </Card>

          {post.deletedAt === null && (
            <Card>
              <Button variant="danger" className="w-full" disabled={busy} onClick={trash}>
                Move to trash
              </Button>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-navy-950">{value}</span>
    </div>
  );
}
