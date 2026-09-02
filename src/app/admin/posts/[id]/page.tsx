"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  READING_TEMPLATES,
  type DocNode,
  type Post,
  type PostStatus,
  type ReadingTemplate,
} from "@avhomes/contracts";
import { Newspaper } from "lucide-react";
import { ApiError, api } from "@/lib/admin/client";
import { SaveBar } from "@/components/admin/SaveBar";
import { fullDate, humanise } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import "../../rte.css";
import RichText from "@/components/admin/RichText";
import {
  Badge,
  ButtonLink,
  Button,
  Card,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
  type Tone,
} from "@/components/admin/ui";

const LIFECYCLE: readonly { op: string; label: string; when: (p: Post) => boolean }[] = [
  { op: "publish", label: "Publish", when: (p) => p.status !== "published" },
  { op: "unpublish", label: "Back to draft", when: (p) => p.status === "published" },
  { op: "archive", label: "Archive", when: (p) => p.status !== "archived" && p.deletedAt === null },
  { op: "restore", label: "Restore", when: (p) => p.deletedAt !== null || p.status === "archived" },
];

/** Status to tone, in one place, so the header chip and the sidebar chip
 *  cannot disagree about what "draft" looks like. */
const POST_TONE: Record<PostStatus, Tone> = {
  published: "green",
  draft: "amber",
  archived: "neutral",
};

export default function PostEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<{ post: Post }>(
    (signal) => api.get<{ post: Post }>(`/admin/posts/${id}`, signal),
    [id],
  );

  /* Both branches keep the header, so a failure does not also take away the
     breadcrumb, and the rise never animates an empty sheet. */
  if (loading) {
    return (
      <>
        <PageHeader icon={Newspaper} backTo="/admin/posts" backLabel="Journal" title="Post" />
        <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">
          <span className="sr-only">Loading this post</span>
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader icon={Newspaper} backTo="/admin/posts" backLabel="Journal" title="Post" />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }
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
  // The document itself. The editor hydrates it once and reports every edit
  // back as ProseMirror JSON, so there is no text representation to convert.
  const [body, setBody] = useState<DocNode>(initial.content);
  /*
   * Set when the editor finds a node it cannot represent. While true the patch
   * omits `content` entirely, so the server keeps the stored document: sending
   * it back would be refused by validateDoc with a 422 about a body the writer
   * never touched, and blocking a title fix on it would be worse still.
   */
  const [bodyLocked, setBodyLocked] = useState(false);
  /* Bumped to remount RichText, which hydrates once and documents `key` as the
     way to reset it. */
  const [bodyVersion, setBodyVersion] = useState(0);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  /*
   * Dirty is derived from the fields against the post they were seeded from,
   * never tracked by a flag. A flag drifts the first time somebody types a
   * character and deletes it, and then the bar and the unload prompt disagree
   * about whether anything is at stake. `body` is compared as JSON because the
   * editor hands back a fresh object on every keystroke, so identity says
   * nothing.
   */
  /* A trashed record cannot be patched at all, so nothing here is savable and
     the save bar must not claim otherwise. */
  const trashed = post.deletedAt !== null;

  const dirty =
    title !== post.title ||
    subtitle !== post.subtitle ||
    excerpt !== post.excerpt ||
    category !== post.category ||
    tags !== post.tags.join(", ") ||
    template !== (post.template ?? "") ||
    coverUrl !== (post.coverImage?.url ?? "") ||
    coverAlt !== (post.coverImage?.alt ?? "") ||
    (!bodyLocked && JSON.stringify(body) !== JSON.stringify(post.content));

  /*
   * EVERY WRITE RE-SEEDS THE FORM FROM WHAT THE SERVER ACTUALLY STORED.
   *
   * Adopting the response into `post` alone is not enough, because the server
   * normalises two of these fields and the form would then differ from the post
   * forever: `tags` comes back joined with a comma and a space whatever spacing
   * was typed, and `excerpt` is re-derived from the body whenever its source is
   * "derived", so an empty box comes back full. Either one pins `dirty` true
   * with nothing on screen the writer can change to clear it, which leaves the
   * save bar up and `beforeunload` armed for the rest of the session.
   *
   * The body is only replaced when the server's document actually differs from
   * the one on screen. RichText hydrates once and is reset by remounting, so
   * bumping its key on every save would throw the caret to the top of the
   * article each time somebody pressed Save.
   */
  function seed(next: Post, { forceBody = false } = {}) {
    setTitle(next.title);
    setSubtitle(next.subtitle);
    setExcerpt(next.excerpt);
    setCategory(next.category);
    setTags(next.tags.join(", "));
    setTemplate(next.template ?? "");
    setCoverUrl(next.coverImage?.url ?? "");
    setCoverAlt(next.coverImage?.alt ?? "");
    if (forceBody || JSON.stringify(next.content) !== JSON.stringify(body)) {
      setBody(next.content);
      setBodyVersion((version) => version + 1);
    }
    setSaveError(null);
  }

  function discard() {
    // Always remounts. `setBody` alone changes state the editor never reads
    // again, so the reverted document would stay on screen and the next save
    // would send the stored one over the top of it.
    seed(post, { forceBody: true });
  }

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
          ...(bodyLocked ? {} : { content: body }),
        },
        baseRevision: post.revision,
        kind,
        note: null,
      });
      setPost(res.post);
      seed(res.post);
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
      seed(res.post);
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
      <SaveBar
        when={dirty && !trashed}
        saving={busy}
        onDiscard={discard}
        onSave={() => void save()}
      />

      {/* The crumb replaces the old "Back" link in the action row: it says where
          you are AND takes you up, from where a reader looks for that. */}
      <PageHeader
        icon={Newspaper}
        backTo="/admin/posts"
        backLabel="Journal"
        title={post.title || "Untitled post"}
        badge={
          <Badge tone={post.deletedAt ? "red" : POST_TONE[post.status]}>
            {post.deletedAt ? "In trash" : humanise(post.status)}
          </Badge>
        }
        subtitle={post.slug ? `/posts/${post.slug}` : "No slug yet. It is derived when you publish."}
        actions={
          <>
            {/* The studio is the full-page writing surface. This screen stays
                for quick metadata edits, which is what it is good at. */}
            <ButtonLink href={`/admin/posts/${post.id}/advanced`} variant="ghost" size="lg">
              Advanced editor
            </ButtonLink>
            {/* One live Save at a time: while the bar is up it owns the act. */}
            {!dirty && !trashed && (
              <Button onClick={() => save()} disabled size="lg">
                {saved ? "Saved" : "Save"}
              </Button>
            )}
          </>
        }
      />

      {trashed && (
        /* The server refuses a patch to a trashed record (`deletedAt: null` is
           in the update filter), so the form cannot be saved and the console
           says so instead of offering a Save that comes back 409. Restore is
           the one move that still works, and it is in the rail. */
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          <p className="font-semibold">This is in the trash</p>
          <p className="mt-1">
            Nothing here can be saved while it is. Restore it first, from the panel on the
            right, and the form comes back.
          </p>
        </div>
      )}

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
            <Field label="Body">
              {/* Keyed on `bodyVersion` and fed the live `body`, not the
                  document this component mounted with. RichText hydrates once
                  and names `key` as the way to reset it, so without the key a
                  discard leaves the reverted text on screen and the next save
                  writes the stored document over the top of it. `initial` is
                  also the wrong source after any save: it is the post as it was
                  when the screen opened. */}
              <RichText
                key={bodyVersion}
                value={body}
                onChange={(doc) => {
                  setBody(doc as DocNode);
                  setSaved(false);
                }}
                onLockedChange={setBodyLocked}
              />
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <Badge tone={post.deletedAt ? "red" : POST_TONE[post.status]}>
                {post.deletedAt ? "In trash" : humanise(post.status)}
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
            <Field label="Cover image">
              <ImagePicker
                value={coverUrl ? [coverUrl] : []}
                onChange={(urls) => {
                  setCoverUrl(urls[0] ?? "");
                  setSaved(false);
                }}
                max={1}
              />
            </Field>
            <Field
              label="Cover alt text"
              hint="What the image shows, for a reader who cannot see it."
            >
              <input
                className={inputClass}
                value={coverAlt}
                onChange={(e) => setCoverAlt(e.target.value)}
                disabled={coverUrl === ""}
              />
            </Field>
          </Card>

          <Card className="space-y-2 text-sm">
            <Row label="Revision" value={String(post.revision)} />
            <Row label="Words" value={String(post.wordCount)} />
            <Row label="Reading time" value={`${post.readingTime} min`} />
            <Row label="Author" value={post.author.name} />
            <Row label="Updated" value={fullDate(post.updatedAt)} />
            <Row
              label="Published"
              value={post.publishedAt ? fullDate(post.publishedAt) : "Not yet"}
            />
          </Card>

          {post.deletedAt === null && (
            <Card>
              <Button variant="danger" className="w-full" disabled={busy} onClick={trash}>
                Move to trash
              </Button>
              {/* The listing editor explains the same action; this one did not.
                  A destructive button with no sentence next to it makes a reader
                  guess how final it is. */}
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                Reversible. There is no permanent delete, and a trashed post keeps its
                revisions, so it can be restored from this screen.
              </p>
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
