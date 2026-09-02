"use client";

import { useCallback, useEffect, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { isAllowedHref } from "@/lib/blog/utils";

/**
 * Defined at module scope, not inside the component.
 *
 * A component created during a render is a NEW type on every render, so React
 * unmounts and remounts it each time, losing focus and any state it holds.
 */
function Btn({
  label,
  active,
  onClick,
  children,
  kbd,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  kbd?: string;
}) {
  return (
    <button
      type="button"
      className={`bubble__btn${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={kbd ? `${label} (${kbd})` : label}
      // Keeps the selection: a mousedown here would blur the document and the
      // command would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Formatting appears where the text is, only when text is selected.
 *
 * A fixed toolbar sits over the prose at every scroll position and is on screen
 * even when nothing is selectable. This is the writing-surface behaviour:
 * select, format, carry on.
 */
export function SelectionMenu({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const openLink = useCallback(() => {
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }, [editor]);

  // Ctrl/Cmd+K is what everyone reaches for, and it must not fire when there is
  // nothing selected and no link under the caret to edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (editor.state.selection.empty && !editor.isActive("link")) return;
        e.preventDefault();
        openLink();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor, openLink]);

  const applyLink = useCallback(() => {
    const raw = linkValue.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!raw) {
      chain.unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (!isAllowedHref(href)) {
      setLinkError("That kind of link is not allowed here.");
      return;
    }
    chain.setLink({ href }).run();
    setLinkOpen(false);
  }, [editor, linkValue]);

  return (
    <>
      <BubbleMenu
        editor={editor}
        options={{ placement: "top", offset: 10 }}
        shouldShow={({ editor: e, state }) => {
          // No bubble over an image or inside code: neither takes inline marks.
          if (e.isActive("image") || e.isActive("codeBlock")) return false;
          return !state.selection.empty;
        }}
      >
        <div className="bubble" role="toolbar" aria-label="Format selection">
          <Btn label="Bold" kbd="Ctrl+B" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold aria-hidden="true" />
          </Btn>
          <Btn label="Italic" kbd="Ctrl+I" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic aria-hidden="true" />
          </Btn>
          <Btn label="Underline" kbd="Ctrl+U" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline aria-hidden="true" />
          </Btn>
          <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough aria-hidden="true" />
          </Btn>
          <Btn label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code aria-hidden="true" />
          </Btn>

          <span className="bubble__sep" aria-hidden="true" />

          <Btn label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 aria-hidden="true" />
          </Btn>
          <Btn label="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 aria-hidden="true" />
          </Btn>
          <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote aria-hidden="true" />
          </Btn>

          <span className="bubble__sep" aria-hidden="true" />

          <Btn label="Link" kbd="Ctrl+K" active={editor.isActive("link")} onClick={openLink}>
            <Link2 aria-hidden="true" />
          </Btn>
        </div>
      </BubbleMenu>

      {linkOpen && (
        <div className="linkdialog" role="dialog" aria-modal="true" aria-label="Link address">
          <div className="linkdialog__panel">
            <label className="linkdialog__label" htmlFor="rte-link">
              Link address
            </label>
            <input
              id="rte-link"
              className="linkdialog__input"
              value={linkValue}
              placeholder="example.com/page"
              autoFocus
              onChange={(e) => {
                setLinkValue(e.target.value);
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
            {linkError && <p className="linkdialog__error">{linkError}</p>}
            <div className="linkdialog__row">
              <button type="button" className="linkdialog__btn" onClick={applyLink}>
                {linkValue.trim() ? "Apply" : "Remove link"}
              </button>
              <button
                type="button"
                className="linkdialog__btn linkdialog__btn--plain"
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
