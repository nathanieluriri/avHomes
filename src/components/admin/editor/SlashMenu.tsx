"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  BlockPalette,
  filterBlocks,
  paletteOwnsKeys,
  usePaletteKeys,
  type BlockContext,
  type BlockType,
} from "./blocks";
import { slashKey, type SlashState } from "./extensions";

const IDLE: SlashState = { active: false, from: 0, query: "" };

/**
 * `/` opens the same palette the plus button does, filtered as you type.
 *
 * It cannot live inside the plus button's floating menu: that menu only shows
 * on an EMPTY block, and the moment you type `/f` the block is no longer empty
 * and the menu unmounts. So this anchors to the caret instead, and the two
 * routes share the block list and the palette rather than the container.
 */
export function SlashMenu({
  editor,
  onInsertImage,
}: {
  editor: Editor;
  onInsertImage: () => void;
}) {
  // Seeded from the plugin rather than set in an effect on mount.
  const [slash, setSlash] = useState<SlashState>(() => slashKey.getState(editor.state) ?? IDLE);

  /**
   * One piece of state, because two of its three fields are DERIVED from the
   * plugin's and have to be reset together.
   *
   * `dismissedFrom` remembers which slash Escape closed: Escape dismisses the
   * palette but leaves the slash in the text, so the plugin state stays active
   * and the menu would otherwise reopen on the very next keystroke.
   */
  const [menu, setMenu] = useState({
    active: 0,
    forQuery: slash.query,
    forActive: slash.active,
    dismissedFrom: null as number | null,
  });

  /*
   * Adjusted DURING RENDER, which is React's own answer to "reset when an input
   * changes". In an effect this is a second render with a stale highlight
   * painted in between, and the linter is right to refuse it.
   */
  if (menu.forQuery !== slash.query || menu.forActive !== slash.active) {
    setMenu({
      // A narrowing query can leave the highlight past the end of the list.
      active: menu.forQuery === slash.query ? menu.active : 0,
      forQuery: slash.query,
      forActive: slash.active,
      // Closing the slash entirely forgets which one was dismissed.
      dismissedFrom: slash.active ? menu.dismissedFrom : null,
    });
  }

  const active = menu.active;
  const setActive = useCallback((i: number) => setMenu((m) => ({ ...m, active: i })), []);
  const dismissedFrom = menu.dismissedFrom;
  const ctx = useMemo<BlockContext>(() => ({ insertImage: onInsertImage }), [onInsertImage]);

  /** Bumped by scroll and resize so the caret coordinates below are re-read. */
  const [, setTick] = useState(0);

  useEffect(() => {
    const sync = () => setSlash(slashKey.getState(editor.state) ?? IDLE);
    const reposition = () => setTick((n) => n + 1);
    editor.on("transaction", sync);
    // A fixed-position box holds viewport coordinates, and scrolling produces
    // no transaction. Without these the palette stays where the caret used to
    // be and can end up entirely below the fold.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      editor.off("transaction", sync);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [editor]);

  const items = useMemo(() => filterBlocks(slash.query), [slash.query]);

  const open = slash.active && slash.from !== dismissedFrom;
  const close = useCallback(
    () => setMenu((m) => ({ ...m, dismissedFrom: slash.from })),
    [slash.from],
  );

  const pick = useCallback(
    (i: number) => {
      const b: BlockType | undefined = items[i];
      if (!b) return;
      // Take the "/query" out first: the writer typed a command, not text.
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: slash.from + slash.query.length + 1 })
        .run();
      b.run(editor, ctx);
    },
    [editor, ctx, items, slash.from, slash.query.length],
  );

  const onKeys = usePaletteKeys({
    count: items.length,
    active,
    setActive,
    onPick: pick,
    onClose: close,
  });

  // Capture phase: the caret is still in the document, so ProseMirror would
  // otherwise move it on the arrows and split the block on Enter.
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

  if (!open) return null;

  let coords: { left: number; bottom: number; top: number } | null = null;
  try {
    coords = editor.view.coordsAtPos(slash.from);
  } catch {
    // The position can be stale for one frame after an undo. Skip the frame
    // rather than throwing inside a render.
    coords = null;
  }
  if (!coords) return null;

  /*
   * Flip above the caret when there is no room below, so the list is never half
   * off screen on a short viewport. The threshold is the palette's own
   * max-height: a smaller number leaves a band where it "fits" and is still
   * clipped, and the popup's internal scrolling cannot help when it is the
   * element that is off screen.
   */
  const maxPop = Math.min(22 * 16, window.innerHeight * 0.6);
  const below = window.innerHeight - coords.bottom;
  const flip = below < maxPop && coords.top > below;

  return (
    <div
      className="slashmenu"
      style={{
        left: Math.min(coords.left, window.innerWidth - 300),
        ...(flip ? { bottom: window.innerHeight - coords.top + 6 } : { top: coords.bottom + 6 }),
      }}
    >
      <BlockPalette
        items={items}
        active={active}
        onActivate={setActive}
        onPick={(b) => pick(items.indexOf(b))}
        emptyLabel={`Nothing matches "${slash.query}"`}
      />
    </div>
  );
}
