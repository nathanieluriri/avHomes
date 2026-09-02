"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
  ChevronLeft,
  GripVertical,
  ImagePlus,
  Trash2,
} from "lucide-react";
import {
  READING_TEMPLATES,
  docToText,
  publishWarnings,
  type PublishWarning,
  readingMinutes,
  wordCount,
  type DocNode,
  type ImageRecord,
  type Post,
  type ReadingTemplate,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { dateTime } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import { createEditorExtensions } from "@/components/admin/editor/extensions";
import { AutoTextarea } from "@/components/admin/editor/AutoTextarea";
import { BlockMenu } from "@/components/admin/editor/BlockMenu";
import { SlashMenu } from "@/components/admin/editor/SlashMenu";
import { SelectionMenu } from "@/components/admin/editor/SelectionMenu";
import { FindBar } from "@/components/admin/editor/FindBar";
import { CodeLangPicker } from "@/components/admin/editor/CodeLangPicker";
import DocRenderer from "@/components/blog/DocRenderer";
import "./editor.css";

const TITLE_MAX = 160;
const SUBTITLE_MAX = 220;
const AUTOSAVE_MS = 1500;

/**
 * THE GRIP TAKES THE RIGHT GUTTER; THE PLUS KEEPS THE LEFT.
 *
 * Both defaulted to `left-start`, so hovering an EMPTY top-level paragraph, the
 * one case where both are shown at once, drew them in the same spot and
 * whichever lost the stacking order could not be clicked. They do different
 * jobs: the plus marks where new text will go, the grip moves a block that
 * already exists.
 *
 * Hoisted out of the render deliberately. DragHandle lists this in the
 * dependency array of the effect that registers its plugin, and this component
 * re-renders on every keystroke, so an object literal in the JSX would
 * unregister and re-register the plugin on each one.
 */
const DRAG_HANDLE_POSITION = { placement: "right-start" } as const;

export default function AdvancedEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<{ post: Post }>(
    (signal) => api.get<{ post: Post }>(`/admin/posts/${id}`, signal),
    [id],
  );

  if (loading) {
    return (
      <div className="adv">
        <p className="adv__page">Loading</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="adv">
        <div className="adv__page">
          <p className="adv__banner adv__banner--error">{error.message}</p>
          <button type="button" className="adv__outline" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  // Remounted by key, so opening another post builds fresh state rather than
  // syncing ten fields through an effect.
  return <Studio key={data.post.id} initial={data.post} />;
}

function Studio({ initial }: { initial: Post }) {
  const router = useRouter();
  const coverInputId = useId();
  const bodyImageInputId = useId();
  const bodyImageInput = useRef<HTMLInputElement>(null);

  const [post, setPost] = useState<Post>(initial);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [category, setCategory] = useState(initial.category);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [template, setTemplate] = useState<ReadingTemplate | "">(initial.template ?? "");
  const [cover, setCover] = useState(initial.coverImage);
  const [body, setBody] = useState<DocNode>(initial.content);

  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [panel, setPanel] = useState<"none" | "details" | "history">("none");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const text = docToText(body);
  const words = wordCount(text);

  /*
   * Every save reads the latest values through a ref rather than closing over
   * them. The autosave timer is scheduled once per idle period, and a closure
   * captured when it was scheduled would write whatever the fields held a
   * second and a half ago.
   */
  const latest = useRef({ title, subtitle, excerpt, category, tags, template, cover, body, post, locked });
  // Written after render rather than during it. The autosave timer is 1.5s out,
  // so it always reads a ref the last commit has already updated.
  useEffect(() => {
    latest.current = { title, subtitle, excerpt, category, tags, template, cover, body, post, locked };
  });

  const save = useCallback(async (kind: "autosave" | "manual") => {
    const s = latest.current;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.patch<{ post: Post }>(`/admin/posts/${s.post.id}`, {
        patch: {
          title: s.title,
          subtitle: s.subtitle,
          excerpt: s.excerpt,
          category: s.category,
          tags: s.tags.split(",").map((t) => t.trim()).filter((t) => t !== ""),
          template: s.template === "" ? null : s.template,
          coverImage: s.cover,
          /*
           * OMITTED WHILE LOCKED. The stored document contains a node the API's
           * own validator refuses, so sending it back answers 422 about a body
           * the writer never touched, and a title fix would be blocked by a
           * block nobody typed.
           */
          ...(s.locked ? {} : { content: s.body }),
        },
        baseRevision: s.post.revision,
        kind,
        note: null,
      });
      setPost(res.post);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setSaving(false);
    }
  }, []);

  /* Autosave: one timer per idle period, cleared on every further edit. */
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save("autosave"), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  /* Ctrl/Cmd+S saves now rather than letting the browser offer the page. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save("manual");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  /* Closing the tab with unsaved words in it deserves a prompt. */
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function touch() {
    setDirty(true);
  }

  const editor = useEditor({
    extensions: createEditorExtensions("Start writing, or press / for blocks"),
    content: undefined,
    autofocus: false,
    immediatelyRender: false,
    enableContentCheck: true,
    onContentError: ({ editor: instance }) => {
      setLocked(true);
      instance.setEditable(false);
    },
    editorProps: { attributes: { "aria-label": "Post body", spellcheck: "true" } },
    onUpdate: ({ editor: instance }) => {
      setBody(instance.getJSON() as DocNode);
      setDirty(true);
    },
    onCreate: ({ editor: instance }) => {
      /*
       * An empty document is never hydrated. A doc with an empty content array
       * is invalid under ProseMirror, where doc is block+, so handing it to
       * setContent fires the content error and locks a brand new post behind a
       * banner blaming blocks it does not have. A fresh editor is already an
       * empty document with the placeholder showing.
       */
      const doc = initial.content as { content?: unknown[] } | null;
      if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return;
      try {
        // Outside the undo history: setContent is an ordinary undoable step, so
        // hydrating as an edit puts "empty to whole post" on the stack and one
        // Ctrl+Z blanks the document.
        instance
          .chain()
          .setContent(initial.content as never, { emitUpdate: false })
          .setMeta("addToHistory", false)
          .run();
      } catch {
        setLocked(true);
        instance.setEditable(false);
      }
    },
  });

  async function uploadImage(file: File | undefined): Promise<ImageRecord | null> {
    if (!file) return null;
    const form = new FormData();
    form.append("file", file);
    form.append("alt", file.name.replace(/\.[^.]+$/, ""));
    try {
      const res = await api.upload<{ image: ImageRecord }>("/admin/images", form);
      return res.image;
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      return null;
    }
  }

  async function transition(op: string) {
    setBusy(true);
    setSaveError(null);
    try {
      // Saved first, so publishing never ships a stale body.
      if (dirty) await save("manual");
      const res = await api.post<{ post: Post }>(`/admin/posts/${latest.current.post.id}/${op}`);
      setPost(res.post);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
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
      setSaveError(
        err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      setBusy(false);
    }
  }

  const published = post.status === "published";

  /*
   * Recomputed from what is on screen, not from what was last saved, so the
   * checklist describes the post the writer is about to publish.
   */
  const warnings: PublishWarning[] = publishWarnings({
    title,
    excerpt,
    category,
    content: body,
    coverImage: cover,
  });

  return (
    <div className="adv">
      <header className="adv__bar">
        <Link href="/admin/posts" className="adv__back">
          <ChevronLeft aria-hidden="true" />
          Posts
        </Link>

        <span className="adv__spacer" />

        <span className="adv__stats">
          {words} {words === 1 ? "word" : "words"} · {readingMinutes(words)} min read
        </span>
        <span className="adv__saved">
          {saving ? "Saving" : dirty ? "Unsaved" : savedAt ? "Saved" : ""}
        </span>

        <button
          type="button"
          className="adv__ghost"
          aria-pressed={panel === "history"}
          onClick={() => setPanel(panel === "history" ? "none" : "history")}
        >
          History
        </button>
        <button
          type="button"
          className="adv__ghost"
          aria-pressed={panel === "details"}
          onClick={() => setPanel(panel === "details" ? "none" : "details")}
        >
          Details
        </button>
        <Link href={`/admin/posts/${post.id}`} className="adv__outline">
          Quick editor
        </Link>
        <button
          type="button"
          className="adv__primary"
          disabled={busy}
          onClick={() => {
            if (published) {
              void transition("unpublish");
              return;
            }
            // Warnings are shown BEFORE publishing, never after, because after
            // is the moment they stop being cheap to act on.
            if (warnings.length > 0) setChecklistOpen(true);
            else void transition("publish");
          }}
        >
          {published ? "Unpublish" : "Publish"}
          {!published && warnings.length > 0 && (
            <span className="adv__warncount" aria-label={`${warnings.length} things to check`}>
              {warnings.length}
            </span>
          )}
        </button>
        <button type="button" className="adv__icon" aria-label="Move to trash" onClick={() => void trash()}>
          <Trash2 aria-hidden="true" />
        </button>
      </header>

      {saveError && (
        <p className="adv__banner adv__banner--error">
          {saveError.message}
          {saveError.body.requestId ? ` (${saveError.body.requestId.slice(0, 8)})` : ""}
        </p>
      )}
      {locked && (
        <p className="adv__banner adv__banner--warn">
          This post uses formatting the editor cannot represent yet, so the body is shown read only.
          It is left untouched when you save, and everything else is still editable.
        </p>
      )}

      <div className="adv__page">
        {cover ? (
          <div className="adv__coverimg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.url} alt={cover.alt} />
            <div className="adv__coverdrop">
              <label className="adv__covertool" htmlFor={coverInputId}>
                Replace
              </label>
              <button
                type="button"
                className="adv__covertool"
                onClick={() => {
                  setCover(null);
                  touch();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="adv__cover" htmlFor={coverInputId}>
            <ImagePlus aria-hidden="true" />
            Add a cover image
          </label>
        )}
        <input
          id={coverInputId}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void uploadImage(file).then((image) => {
              if (!image) return;
              setCover({
                url: image.url,
                alt: image.alt,
                focalPoint: "50% 50%",
                width: image.width,
                height: image.height,
              });
              touch();
            });
          }}
        />

        <AutoTextarea
          className="adv__title"
          value={title}
          onChange={(v) => {
            setTitle(v);
            touch();
          }}
          placeholder="Title"
          maxLength={TITLE_MAX}
          ariaLabel="Post title"
          onEnter={() => editor?.commands.focus("start")}
        />
        <AutoTextarea
          className="adv__subtitle"
          value={subtitle}
          onChange={(v) => {
            setSubtitle(v);
            touch();
          }}
          placeholder="A sentence that makes someone read on"
          maxLength={SUBTITLE_MAX}
          ariaLabel="Post subtitle"
          onEnter={() => editor?.commands.focus("start")}
        />

        <div className="adv__surface">
          {locked ? (
            // TipTap refuses to set content it cannot represent, so the editor
            // is blank here. Rendering with the SITE's own renderer shows the
            // writer what the page shows, instead of an empty box.
            <DocRenderer doc={initial.content} />
          ) : (
            <>
              <EditorContent editor={editor} />
              {editor && (
                <>
                  <BlockMenu editor={editor} onInsertImage={() => bodyImageInput.current?.click()} />
                  <SlashMenu editor={editor} onInsertImage={() => bodyImageInput.current?.click()} />
                  <SelectionMenu editor={editor} />
                  <FindBar editor={editor} />
                  <CodeLangPicker editor={editor} />
                  <DragHandle editor={editor} computePositionConfig={DRAG_HANDLE_POSITION}>
                    <div className="draghandle" aria-hidden="true">
                      <GripVertical />
                    </div>
                  </DragHandle>
                </>
              )}
            </>
          )}
        </div>

        <input
          id={bodyImageInputId}
          ref={bodyImageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void uploadImage(file).then((image) => {
              if (image && editor) {
                editor.chain().focus().setImage({ src: image.url, alt: image.alt }).run();
              }
            });
          }}
        />
      </div>

      {checklistOpen && (
        <div
          className="linkdialog"
          role="dialog"
          aria-modal="true"
          aria-label="Before you publish"
          onClick={() => setChecklistOpen(false)}
        >
          <div className="linkdialog__panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="adv__checktitle">Before you publish</h2>
            <p className="adv__checknote">
              None of these stops you. They are the things that get expensive to fix once a link to
              this post is out in the world.
            </p>
            <ul className="adv__checklist">
              {warnings.map((w) => (
                <li key={w.id}>{w.message}</li>
              ))}
            </ul>
            <div className="linkdialog__row">
              <button
                type="button"
                className="linkdialog__btn"
                disabled={busy}
                onClick={() => {
                  setChecklistOpen(false);
                  void transition("publish");
                }}
              >
                Publish anyway
              </button>
              <button
                type="button"
                className="linkdialog__btn linkdialog__btn--plain"
                onClick={() => setChecklistOpen(false)}
              >
                Go back and fix
              </button>
            </div>
          </div>
        </div>
      )}

      {panel !== "none" && (
        <>
          <div className="adv__scrim" onClick={() => setPanel("none")} />
          <aside className="adv__panel">
            <div className="adv__panel-head">
              <h2 className="adv__panel-title">{panel === "details" ? "Details" : "History"}</h2>
              <button type="button" className="adv__ghost" onClick={() => setPanel("none")}>
                Close
              </button>
            </div>

            {panel === "details" ? (
              <DetailsPanel
                excerpt={excerpt}
                setExcerpt={(v) => {
                  setExcerpt(v);
                  touch();
                }}
                category={category}
                setCategory={(v) => {
                  setCategory(v);
                  touch();
                }}
                tags={tags}
                setTags={(v) => {
                  setTags(v);
                  touch();
                }}
                template={template}
                setTemplate={(v) => {
                  setTemplate(v);
                  touch();
                }}
                coverAlt={cover?.alt ?? ""}
                setCoverAlt={(v) => {
                  setCover(cover ? { ...cover, alt: v } : null);
                  touch();
                }}
                hasCover={Boolean(cover)}
                post={post}
              />
            ) : (
              <HistoryPanel
                postId={post.id}
                onRestored={(restored) => {
                  // The studio remounts on the new id-and-revision, so every
                  // field and the editor itself re-seed from what was restored.
                  setPost(restored);
                  setPanel("none");
                  router.refresh();
                  window.location.reload();
                }}
              />
            )}
          </aside>
        </>
      )}
    </div>
  );
}

function DetailsPanel({
  excerpt,
  setExcerpt,
  category,
  setCategory,
  tags,
  setTags,
  template,
  setTemplate,
  coverAlt,
  setCoverAlt,
  hasCover,
  post,
}: {
  excerpt: string;
  setExcerpt: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
  template: ReadingTemplate | "";
  setTemplate: (v: ReadingTemplate | "") => void;
  coverAlt: string;
  setCoverAlt: (v: string) => void;
  hasCover: boolean;
  post: Post;
}) {
  return (
    <div className="space-y-4 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Excerpt
        </span>
        <textarea
          className="w-full rounded-lg border border-mist-200 px-3 py-2 text-sm"
          rows={4}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Leave empty and the server derives it from the body on every save.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Category
        </span>
        <input
          className="w-full rounded-lg border border-mist-200 px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tags
        </span>
        <input
          className="w-full rounded-lg border border-mist-200 px-3 py-2 text-sm"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Comma separated"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reading template
        </span>
        <select
          className="w-full rounded-lg border border-mist-200 px-3 py-2 text-sm"
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
      </label>

      {hasCover && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cover alt text
          </span>
          <input
            className="w-full rounded-lg border border-mist-200 px-3 py-2 text-sm"
            value={coverAlt}
            onChange={(e) => setCoverAlt(e.target.value)}
            placeholder="What the image shows"
          />
        </label>
      )}

      <dl className="space-y-1 border-t border-mist-200 pt-4 text-xs text-muted-foreground">
        <Row label="Status" value={post.status} />
        <Row label="Revision" value={String(post.revision)} />
        <Row label="Slug" value={post.slug ?? "derived at publish"} />
        <Row label="Author" value={post.author.name} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium text-navy-950">{value}</dd>
    </div>
  );
}

interface RevisionRow {
  id: string;
  revision: number;
  kind: string;
  note: string | null;
  createdAt: number;
  title: string;
}

function HistoryPanel({
  postId,
  onRestored,
}: {
  postId: string;
  onRestored: (post: Post) => void;
}) {
  const { data, error, loading, reload } = useAsync<{ items: RevisionRow[] }>(
    (signal) => api.get<{ items: RevisionRow[] }>(`/admin/revisions/${postId}`, signal),
    [postId],
  );
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<ApiError | null>(null);

  async function restore(revisionId: string) {
    setRestoring(revisionId);
    setRestoreError(null);
    try {
      const res = await api.post<{ post: Post }>(
        `/admin/revisions/${postId}/${revisionId}/restore`,
      );
      onRestored(res.post);
    } catch (err) {
      setRestoreError(
        err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      setRestoring(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading</p>;
  if (error) {
    return (
      <p className="text-sm text-red-700">
        {error.message}{" "}
        <button type="button" className="underline" onClick={reload}>
          Try again
        </button>
      </p>
    );
  }
  if (!data || data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved revisions yet.</p>;
  }

  return (
    <>
      {restoreError && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{restoreError.message}</p>
      )}
      <p className="mb-3 text-xs text-muted-foreground">
        Restoring writes an entry forward rather than rewinding, so what it replaces stays in this
        list and a restore can itself be undone.
      </p>
      <ol className="space-y-3 text-sm">
        {data.items.map((r) => (
          <li key={r.id} className="border-b border-mist-100 pb-3 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-semibold text-navy-950">r{r.revision}</span>{" "}
                <span className="text-muted-foreground">{r.kind}</span>
                {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {dateTime(r.createdAt)}
              </span>
            </div>
            {/* The title as it stood, so a choice between two entries is not a
                choice between two numbers. */}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.title || "Untitled"}</p>
            <button
              type="button"
              className="mt-1.5 text-xs font-semibold text-blue-600 underline underline-offset-2 disabled:text-mist-300"
              disabled={restoring !== null}
              onClick={() => void restore(r.id)}
            >
              {restoring === r.id ? "Restoring" : "Restore this version"}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Kept out of the component so its identity is stable across keystrokes. */
export type { Editor };
