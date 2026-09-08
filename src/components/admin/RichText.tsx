"use client";

import { useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import DocImage from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Underline as UnderlineIcon,
} from "lucide-react";
import type { DocNode, ImageRecord } from "@avhomes/contracts";
import DocRenderer from "@/components/blog/DocRenderer";
import { isAllowedHref } from "@/lib/blog/utils";
import { ApiError, api } from "@/lib/admin/client";
import { useIsPhone } from "@/lib/admin/hooks";
import { BottomSheet } from "./BottomSheet";
import { Button, inputClass } from "./ui";
import { PasteRepair } from "./editor/paste";

/**
 * The post body editor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NODE SET IS A DATA-SAFETY DECISION, NOT A FEATURE LIST.
 *
 * Three things must agree on which nodes exist: `validateDoc` in
 * @avhomes/contracts, which decides what the API will store; `DocRenderer`,
 * which decides what the site can draw; and this editor, which decides what a
 * writer can produce. A node any one of them does not know is either dropped on
 * save or renders as nothing on the page.
 *
 * IF A DOCUMENT CARRIES SOMETHING THIS SCHEMA CANNOT HOLD, EDITING LOCKS.
 * `enableContentCheck` reports the invalid node BEFORE TipTap would silently
 * strip it, and a save after a silent strip overwrites the stored post with the
 * stripped copy, losing a published block with no error anywhere. Read-only
 * plus a sentence is the honest version.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      // The reader renders h2 and h3. Offering h1 would produce a heading the
      // page cannot draw and a second document title on every post.
      heading: { levels: [2, 3] },
      // Both ship inside StarterKit now, and both are configured below.
      link: false,
      underline: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      /*
       * TipTap's own `protocols` option only APPENDS to a baseline that already
       * allows tel, ftp and xmpp. This predicate is the real gate, and it is the
       * same one the reader applies, so a link that survives here is a link the
       * page will render rather than strip.
       */
      isAllowedUri: (url, { defaultValidate }) => {
        if (!defaultValidate(url)) return false;
        return !/^[a-z][a-z0-9+.-]*:/i.test(url.trim()) || isAllowedHref(url);
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Images are plain same-origin URLs written by our own upload route, so
    // they need no node view to resolve. allowBase64 stays off: a pasted data
    // URI would embed megabytes in the document body.
    DocImage.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder, showOnlyWhenEditable: true }),
    // A Word paste is a Word paste whichever screen it lands on.
    PasteRepair,
  ];
}

/**
 * The captions drawn under the icons in the phone toolbar.
 *
 * Only six, because the strip scrolls and the first thing off the right edge
 * should still be a rarity. A phone has no hover, so the `title` that carries
 * every other tool's meaning renders nowhere, and H2 against H3 or the three
 * list icons against each other is a few pixels of difference at 18px.
 *
 * KEYED ON THE ARIA-LABEL, and the caption is always a substring of it. A
 * visible label that is not contained in the accessible name is a control voice
 * control cannot be asked for by the words printed on it.
 */
const CAPTIONS: Record<string, string> = {
  Bold: "Bold",
  Italic: "Italic",
  Heading: "Heading",
  "Bulleted list": "List",
  Link: "Link",
  "Insert image": "Image",
};

export default function RichText({
  value,
  onChange,
  onLockedChange,
  placeholder = "Write the post...",
  ariaLabel = "Post body",
}: {
  /** The stored document. Hydrated ONCE; remount via `key` to reset. */
  value: unknown;
  onChange: (doc: unknown) => void;
  /**
   * Told when this document turns out to be uneditable here.
   *
   * The parent MUST stop sending `content` on save when this is true. The
   * stored document contains a node the API's own validator would refuse, so a
   * save carrying it answers 422 about a body the writer never touched.
   */
  onLockedChange?: (locked: boolean) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const imageInputId = useId();
  const isPhone = useIsPhone();
  const hydrated = useRef(false);
  const broken = useRef(false);
  const [locked, setLocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: buildExtensions(placeholder),
    content: undefined,
    autofocus: false,
    // Next renders this component on the server first, and TipTap warns that
    // the DOM it produces there will not match the client's.
    immediatelyRender: false,
    enableContentCheck: true,
    onContentError: ({ editor: instance }) => {
      broken.current = true;
      setLocked(true);
      onLockedChange?.(true);
      instance.setEditable(false);
    },
    editorProps: { attributes: { "aria-label": ariaLabel, spellcheck: "true" } },
    onUpdate: ({ editor: instance }) => {
      if (broken.current) return;
      onChange(instance.getJSON());
    },
    /*
     * HYDRATED IN onCreate, NOT IN AN EFFECT.
     *
     * The editor is an external system and this is the moment it comes into
     * existence, which is exactly where its initial content belongs. Doing it in
     * an effect means one render with an empty document before the real one
     * appears, and a `setLocked` in that effect is a cascading render on every
     * failure path.
     */
    onCreate: ({ editor: instance }) => hydrate(instance),
  });

  function hydrate(instance: Editor) {
    if (hydrated.current || value == null) return;

    /*
     * AN EMPTY DOCUMENT IS NEVER HYDRATED, AND SKIPPING IT IS THE WHOLE POINT.
     *
     * A doc with an empty content array is INVALID under ProseMirror's schema,
     * where `doc` is `block+` and needs at least one block. Handed to
     * `setContent` with content checking on, it fires `onContentError`, locks
     * the editor, and shows a banner blaming unsupported blocks for a document
     * that has no blocks at all.
     *
     * There is nothing to hydrate: a fresh editor is already an empty document
     * with the placeholder showing, which is what an empty post should look
     * like. The latch is still set, so a later value cannot overwrite what has
     * since been typed.
     */
    const doc = value as { content?: unknown[] } | null;
    if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) {
      hydrated.current = true;
      return;
    }

    hydrated.current = true;
    try {
      /*
       * OUTSIDE THE UNDO HISTORY. `setContent` is an ordinary undoable step, so
       * hydrating as an edit puts "empty to whole post" on the stack and one
       * Ctrl+Z blanks the field.
       */
      instance
        .chain()
        .setContent(value as never, { emitUpdate: false })
        .setMeta("addToHistory", false)
        .run();
    } catch {
      broken.current = true;
      setLocked(true);
      onLockedChange?.(true);
      instance.setEditable(false);
    }
  }

  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e: Editor | null = ctx.editor;
      if (!e) return null;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        quote: e.isActive("blockquote"),
        link: e.isActive("link"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  function openLink() {
    if (!editor) return;
    setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const raw = linkDraft.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    // A bare domain is what people type. Assume https rather than refusing it.
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (!isAllowedHref(href)) {
      setLinkError("That kind of link is not allowed here.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  async function insertImage(file: File | undefined) {
    if (!file || !editor) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const res = await api.upload<{ image: ImageRecord }>("/admin/images", form);
      editor.chain().focus().setImage({ src: res.image.url, alt: res.image.alt }).run();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "That image could not be added.",
      );
    } finally {
      setUploading(false);
    }
  }

  const disabled = !editor || locked;

  /* `c-tap` on every toolbar control at EVERY width, not only in the phone
     strip below `sm`. The drawn button is 30px from `sm` up, and a tablet or a
     landscape phone is still a thumb: the width decides the layout, the
     pointer decides the target. rte.css widens the bar's gap on a coarse
     pointer so that the 44px halos do not steal each other's edges. */
  const tool = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    run: () => void,
    canRun = true,
  ) => (
    <button
      type="button"
      className="rte__btn c-tap"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled || !canRun}
      // Keeps the selection: a mousedown on a toolbar button would otherwise
      // blur the document and the command would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
      {CAPTIONS[label] && <span className="rte__cap">{CAPTIONS[label]}</span>}
    </button>
  );

  return (
    <div className="rte">
      {/* `no-scrollbar` and `c-scroll-fade` are for the phone strip, where the
          bar is one scrolling row: the fade is what says it scrolls once the
          scrollbar is gone. rte.css takes the mask off again from `sm` up,
          where the bar wraps instead. */}
      <div
        className="rte__bar no-scrollbar c-scroll-fade"
        role="toolbar"
        aria-label="Text formatting"
      >
        {tool("Bold", <Bold aria-hidden="true" />, Boolean(state?.bold), () =>
          editor?.chain().focus().toggleBold().run(),
        )}
        {tool("Italic", <Italic aria-hidden="true" />, Boolean(state?.italic), () =>
          editor?.chain().focus().toggleItalic().run(),
        )}
        {tool("Underline", <UnderlineIcon aria-hidden="true" />, Boolean(state?.underline), () =>
          editor?.chain().focus().toggleUnderline().run(),
        )}
        {tool("Strikethrough", <Strikethrough aria-hidden="true" />, Boolean(state?.strike), () =>
          editor?.chain().focus().toggleStrike().run(),
        )}
        {tool("Inline code", <Code aria-hidden="true" />, Boolean(state?.code), () =>
          editor?.chain().focus().toggleCode().run(),
        )}

        <span className="rte__sep" aria-hidden="true" />

        {tool("Heading", <Heading2 aria-hidden="true" />, Boolean(state?.h2), () =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {tool("Subheading", <Heading3 aria-hidden="true" />, Boolean(state?.h3), () =>
          editor?.chain().focus().toggleHeading({ level: 3 }).run(),
        )}

        <span className="rte__sep" aria-hidden="true" />

        {tool("Bulleted list", <List aria-hidden="true" />, Boolean(state?.bullet), () =>
          editor?.chain().focus().toggleBulletList().run(),
        )}
        {tool("Numbered list", <ListOrdered aria-hidden="true" />, Boolean(state?.ordered), () =>
          editor?.chain().focus().toggleOrderedList().run(),
        )}
        {tool("Task list", <ListTodo aria-hidden="true" />, Boolean(state?.task), () =>
          editor?.chain().focus().toggleTaskList().run(),
        )}
        {tool("Quote", <Quote aria-hidden="true" />, Boolean(state?.quote), () =>
          editor?.chain().focus().toggleBlockquote().run(),
        )}
        {tool("Divider", <Minus aria-hidden="true" />, false, () =>
          editor?.chain().focus().setHorizontalRule().run(),
        )}

        <span className="rte__sep" aria-hidden="true" />

        {tool("Link", <Link2 aria-hidden="true" />, Boolean(state?.link), () =>
          linkOpen ? setLinkOpen(false) : openLink(),
        )}
        {/*
          A LABEL, not a button with a ref.
          The label opens the file dialog natively, so there is no ref to read
          and no click to synthesise. It also keeps working if the JavaScript
          that would have called .click() has not loaded yet.
        */}
        <label
          className="rte__btn c-tap"
          aria-label="Insert image"
          title="Insert image"
          data-disabled={disabled || uploading ? "true" : undefined}
          htmlFor={imageInputId}
        >
          {uploading ? (
            <span className="rte__spinner" aria-hidden="true" />
          ) : (
            <ImagePlus aria-hidden="true" />
          )}
          <span className="rte__cap">{CAPTIONS["Insert image"]}</span>
        </label>
        <input
          id={imageInputId}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void insertImage(file);
          }}
        />

        <span className="rte__spacer" />

        {tool(
          "Undo",
          <Undo2 aria-hidden="true" />,
          false,
          () => editor?.chain().focus().undo().run(),
          Boolean(state?.canUndo),
        )}
        {tool(
          "Redo",
          <Redo2 aria-hidden="true" />,
          false,
          () => editor?.chain().focus().redo().run(),
          Boolean(state?.canRedo),
        )}
      </div>

      {/*
        A SHEET ON A PHONE, THE BAR EVERYWHERE ELSE.

        The bar is wedged at the top of the editor, which is the half of the
        screen the keyboard is guaranteed to have taken, and it carried
        `autoFocus`: tapping Link opened the keyboard over a row the writer had
        not read yet, with no way to decline. The sheet comes up under the
        thumb, pads itself clear of the keyboard and the home indicator, and
        lets Radix land first focus on Close, so the writer decides when the
        keyboard arrives.

        BRANCHING IN JAVASCRIPT IS SAFE HERE in a way it is not for a layout.
        Nothing renders until the writer taps Link, which is long after
        hydration, so there is no first-frame flash to avoid and no reason to
        mount both shapes.
      */}
      {isPhone ? (
        <BottomSheet
          open={linkOpen}
          onOpenChange={setLinkOpen}
          title="Link"
          description="Leave the address empty to remove the link."
          footer={
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button size="lg" className="flex-1" onClick={applyLink}>
                {linkDraft.trim() ? "Apply" : "Remove"}
              </Button>
            </div>
          }
        >
          {/* `inputMode` rather than `type="url"`: it buys the keyboard with the
              slash and the .com key and none of the validation semantics.
              `applyLink` accepts a bare domain on purpose, and a url input would
              call that malformed. */}
          <input
            className={inputClass}
            placeholder="example.com/page"
            value={linkDraft}
            aria-label="Link address"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setLinkDraft(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          {linkError && <p className="mt-2 text-xs text-red-700">{linkError}</p>}
        </BottomSheet>
      ) : (
        linkOpen && (
          /* `useIsPhone` cuts at 40rem, so this inline bar is what a landscape
             phone and every tablet get. Its two buttons keep their drawn size
             and take a 44px hit area from `c-tap`; the row's own 8px gap is
             already wide enough for the halos. */
          <div className="rte__linkbar">
            <input
              className="rte__linkinput"
              placeholder="example.com/page"
              value={linkDraft}
              aria-label="Link address"
              autoFocus
              onChange={(e) => {
                setLinkDraft(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkOpen(false);
              }}
            />
            <button type="button" className="rte__linkbtn c-tap" onClick={applyLink}>
              {linkDraft.trim() ? "Apply" : "Remove"}
            </button>
            <button
              type="button"
              className="rte__linkbtn rte__linkbtn--plain c-tap"
              onClick={() => setLinkOpen(false)}
            >
              Cancel
            </button>
            {linkError && <span className="rte__error">{linkError}</span>}
          </div>
        )
      )}

      {uploadError && <p className="rte__error rte__error--row">{uploadError}</p>}

      <div className="rte__body">
        {/*
          A READ-ONLY RENDER, not an empty editor.

          TipTap refuses to set content it cannot represent, so the editor is
          blank on this path. A writer meeting a blank box with a warning
          reasonably concludes the post is gone. Rendering it with the SITE's own
          renderer shows exactly what the page shows, which is both true and the
          most useful thing available.
        */}
        {locked ? <DocRenderer doc={value as DocNode} /> : <EditorContent editor={editor} />}
      </div>

      {locked && (
        <p className="rte__locked" role="status">
          This post uses formatting the editor cannot represent yet, so it is shown read only. The
          body is left untouched when you save, and everything else on this page is still editable.
        </p>
      )}
    </div>
  );
}
