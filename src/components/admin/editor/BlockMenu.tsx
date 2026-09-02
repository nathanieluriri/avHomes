"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FloatingMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { Plus } from "lucide-react";
import {
  BLOCK_TYPES,
  BlockPalette,
  paletteOwnsKeys,
  usePaletteKeys,
  type BlockContext,
} from "./blocks";

/**
 * The plus button in the left gutter, on an empty block.
 *
 * It marks where new content will land, which is also where `/` puts its
 * palette, so the two affordances teach the same gesture. The drag handle takes
 * the RIGHT gutter: both used to hang off the left, and hovering an empty
 * top-level paragraph drew them in the same spot where whichever lost the
 * stacking order could not be clicked.
 */
export function BlockMenu({
  editor,
  onInsertImage,
}: {
  editor: Editor;
  onInsertImage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ctx = useMemo<BlockContext>(() => ({ insertImage: onInsertImage }), [onInsertImage]);

  const close = useCallback(() => {
    setOpen(false);
    editor.chain().focus().run();
  }, [editor]);

  const pick = useCallback(
    (i: number) => {
      const block = BLOCK_TYPES[i];
      if (!block) return;
      setOpen(false);
      block.run(editor, ctx);
    },
    [editor, ctx],
  );

  const onKeys = usePaletteKeys({
    count: BLOCK_TYPES.length,
    active,
    setActive,
    onPick: pick,
    onClose: close,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!paletteOwnsKeys()) return;
      if (onKeys(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onKeys]);

  // The caret moving to another block makes an open palette meaningless.
  useEffect(() => {
    const onTransaction = () => setOpen(false);
    editor.on("selectionUpdate", onTransaction);
    return () => {
      editor.off("selectionUpdate", onTransaction);
    };
  }, [editor]);

  return (
    <FloatingMenu
      editor={editor}
      options={{ placement: "left-start", offset: 8 }}
      shouldShow={({ state }) => {
        const { $from, empty } = state.selection;
        if (!empty || $from.depth !== 1) return false;
        // Only on a genuinely empty paragraph. On a heading or a filled block
        // the plus would promise an insertion point that is already occupied.
        return $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
      }}
    >
      <div className="blockmenu">
        <button
          type="button"
          className="blockmenu__plus"
          aria-label="Insert a block"
          aria-expanded={open}
          title="Insert a block"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setActive(0);
            setOpen((v) => !v);
          }}
        >
          <Plus aria-hidden="true" />
        </button>

        {open && (
          <div className="blockmenu__anchor">
            <BlockPalette
              items={BLOCK_TYPES}
              active={active}
              onActivate={setActive}
              onPick={(b) => pick(BLOCK_TYPES.indexOf(b))}
              focusItems
            />
          </div>
        )}
      </div>
    </FloatingMenu>
  );
}
