"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import {
  Code2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Table as TableIcon,
  Type,
} from "lucide-react";

/** Everything a block needs that lives outside the editor. */
export interface BlockContext {
  insertImage: () => void;
}

export interface BlockType {
  id: string;
  label: string;
  hint: string;
  icon: typeof Type;
  /** Typed shorthand, shown so the menu teaches the shortcut. */
  markdown?: string;
  /** Extra words the slash filter should match: what people call the thing. */
  keywords?: string;
  run: (editor: Editor, ctx: BlockContext) => void;
}

/**
 * The blocks a writer can insert.
 *
 * Every one of them is a node `validateDoc` accepts and `DocRenderer` draws.
 * Offering a block the page cannot render would be a menu item that silently
 * produces nothing on the published post.
 */
export const BLOCK_TYPES: BlockType[] = [
  {
    id: "paragraph",
    label: "Text",
    hint: "Plain paragraph",
    icon: Type,
    keywords: "body prose plain",
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: "h2",
    label: "Heading",
    hint: "Section title",
    icon: Heading2,
    markdown: "##",
    keywords: "title h2 section",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Subheading",
    hint: "Smaller title",
    icon: Heading3,
    markdown: "###",
    keywords: "title h3 subsection",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Pull a passage out",
    icon: Quote,
    markdown: ">",
    keywords: "blockquote citation pull",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    hint: "Unordered points",
    icon: List,
    markdown: "-",
    keywords: "ul unordered points",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "Numbered list",
    hint: "Ordered steps",
    icon: ListOrdered,
    markdown: "1.",
    keywords: "ol numbered steps",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Checklist",
    hint: "Things to tick off",
    icon: ListTodo,
    markdown: "[]",
    keywords: "todo task checkbox tick",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "Monospaced, preformatted",
    icon: Code2,
    markdown: "```",
    keywords: "snippet syntax pre monospace",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    hint: "Three by three, with a header row",
    icon: TableIcon,
    keywords: "grid rows columns cells",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Break between sections",
    icon: Minus,
    markdown: "---",
    keywords: "rule hr separator break",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "Upload from this device",
    icon: ImageIcon,
    keywords: "photo picture figure upload",
    run: (_e, ctx) => ctx.insertImage(),
  },
];

/**
 * Ranked, not a plain substring match.
 *
 * A substring over label plus hint puts **Text** first for `/h`, because "Plain
 * paragraph" contains an h, so the most obvious shortcut in the app would
 * insert the wrong block on Enter. A name the writer is typing the start of
 * beats a coincidence buried in a description.
 */
export function filterBlocks(query: string): BlockType[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCK_TYPES;

  const rank = (b: BlockType): number => {
    const label = b.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if ((b.keywords ?? "").toLowerCase().split(/\s+/).some((k) => k.startsWith(q))) return 2;
    return 3;
  };

  return BLOCK_TYPES.map((b, i) => ({ b, r: rank(b), i }))
    .filter(
      ({ b, r }) =>
        r < 3 || `${b.hint} ${b.keywords ?? ""} ${b.markdown ?? ""}`.toLowerCase().includes(q),
    )
    // Stable within a rank, so the list keeps its authored order.
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(({ b }) => b);
}

/**
 * Whether a palette may answer for the keystroke that just happened.
 *
 * The palettes listen on `document` in the CAPTURE phase, which is how they
 * beat ProseMirror to the arrow keys. Without this gate they also answer for
 * keys typed into anything else on screen: with a palette open and the caret in
 * the title field, ArrowDown then Enter would silently insert a block.
 */
export function paletteOwnsKeys(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return true;
  if (el.closest?.(".blockpop")) return true;
  return !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * Arrow, Home, End, Enter and Escape over a palette. Returns whether it
 * consumed the key, so the caller can decide about preventDefault: both callers
 * want to, because otherwise the arrows move the caret instead.
 */
export function usePaletteKeys({
  count,
  active,
  setActive,
  onPick,
  onClose,
}: {
  count: number;
  active: number;
  setActive: (i: number) => void;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  return useCallback(
    (e: KeyboardEvent): boolean => {
      switch (e.key) {
        case "ArrowDown":
          setActive(count ? (active + 1) % count : 0);
          return true;
        case "ArrowUp":
          setActive(count ? (active - 1 + count) % count : 0);
          return true;
        case "Home":
          setActive(0);
          return true;
        case "End":
          setActive(Math.max(0, count - 1));
          return true;
        case "Enter":
        case "Tab":
          if (!count) return false;
          onPick(active);
          return true;
        case "Escape":
          onClose();
          return true;
        default:
          return false;
      }
    },
    [count, active, setActive, onPick, onClose],
  );
}

/**
 * The palette itself, shared by the plus button and by the slash command.
 *
 * It owns the keyboard model because the two callers give it focus differently:
 * the plus moves focus into the list, while slash leaves the caret in the
 * document and drives the list at a distance. Either way the same `active`
 * index decides what Enter picks, so the two routes cannot diverge.
 */
export function BlockPalette({
  items,
  active,
  onActivate,
  onPick,
  emptyLabel = "No blocks match",
  focusItems = false,
}: {
  items: BlockType[];
  active: number;
  onActivate: (i: number) => void;
  onPick: (b: BlockType) => void;
  emptyLabel?: string;
  focusItems?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keeps the highlighted row visible when a query narrows a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
    if (focusItems) el?.focus();
  }, [active, focusItems, items]);

  if (items.length === 0) {
    return (
      <div className="blockpop" role="menu" aria-label="Insert a block">
        <p className="blockpop__empty">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="blockpop" role="menu" aria-label="Insert a block" ref={listRef}>
      <p className="blockpop__heading">Insert</p>
      {items.map((b, i) => (
        <button
          key={b.id}
          role="menuitem"
          type="button"
          className={`blockpop__item${i === active ? " is-active" : ""}`}
          data-active={i === active}
          // Roving tabindex: one stop for the whole menu, arrows move within it.
          tabIndex={focusItems ? (i === active ? 0 : -1) : -1}
          onMouseEnter={() => onActivate(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(b)}
        >
          <span className="blockpop__icon">
            <b.icon aria-hidden="true" />
          </span>
          <span className="blockpop__text">
            <span className="blockpop__label">{b.label}</span>
            <span className="blockpop__hint">{b.hint}</span>
          </span>
          {b.markdown && <kbd className="blockpop__kbd">{b.markdown}</kbd>}
        </button>
      ))}
    </div>
  );
}
