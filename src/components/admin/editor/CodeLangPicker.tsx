"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { CODE_LANGUAGES } from "@/lib/blog/highlight";

/**
 * The language a code block is highlighted as.
 *
 * A FLOATING CONTROL rather than a node view. Replacing CodeBlockLowlight's node
 * view would mean re-implementing its highlighting decorations inside React, and
 * the only thing here that needs to be interactive is one field. It follows the
 * caret, so it is present exactly when it applies and costs nothing at all on a
 * post with no code in it.
 */
export function CodeLangPicker({ editor }: { editor: Editor }) {
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const [language, setLanguage] = useState("plaintext");

  useEffect(() => {
    const sync = () => {
      if (!editor.isActive("codeBlock")) {
        setBox(null);
        return;
      }
      setLanguage(String(editor.getAttributes("codeBlock").language || "plaintext"));

      const { $from } = editor.state.selection;
      // Walk out to the code block itself; the caret is inside its text.
      let depth = $from.depth;
      while (depth > 0 && $from.node(depth).type.name !== "codeBlock") depth -= 1;

      const dom = editor.view.nodeDOM($from.before(Math.max(depth, 1)));
      const el = dom instanceof HTMLElement ? dom : null;
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top + 6, right: window.innerWidth - r.right + 6 });
    };

    sync();
    editor.on("transaction", sync);
    editor.on("focus", sync);
    // A fixed-position box holds viewport coordinates and scrolling produces no
    // transaction, so without these the picker stays where the block used to be.
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      editor.off("transaction", sync);
      editor.off("focus", sync);
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [editor]);

  if (!box) return null;

  return (
    <div className="codelang" style={{ top: box.top, right: box.right }}>
      <select
        className="codelang__select"
        aria-label="Code language"
        value={language}
        onChange={(e) => {
          // `focus()` first, so the command lands on the block the picker is
          // describing rather than wherever focus went when the list opened.
          editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value }).run();
        }}
      >
        {CODE_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
