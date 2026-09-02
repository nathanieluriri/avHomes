import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import DocImage from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extensions";
import { isAllowedHref } from "@/lib/blog/utils";

/* ─────────────────────────── move a block ──────────────────────────────── */

/**
 * Alt+Up and Alt+Down move the block containing the caret.
 *
 * This is the ONLY way to reorder without a pointer, which is what makes the
 * drag handle safe to hide on touch and on narrow screens.
 */
const BlockMove = Extension.create({
  name: "blockMove",
  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const { state, view } = this.editor;
      const { $from } = state.selection;
      // Top-level blocks only. Moving a list item out of its list here would
      // produce a document the schema refuses.
      if ($from.depth < 1) return false;

      const index = $from.index(0);
      const parent = state.doc;
      const target = index + direction;
      if (target < 0 || target >= parent.childCount) return false;

      const node = parent.child(index);
      const neighbour = parent.child(target);
      const start = $from.start(1) - 1;
      const offsetInBlock = state.selection.from - start;

      const tr = state.tr;
      if (direction === -1) {
        const neighbourStart = start - neighbour.nodeSize;
        tr.delete(start, start + node.nodeSize);
        tr.insert(neighbourStart, node);
        tr.setSelection(Selection.near(tr.doc.resolve(neighbourStart + offsetInBlock)));
      } else {
        tr.delete(start, start + node.nodeSize);
        tr.insert(start + neighbour.nodeSize, node);
        tr.setSelection(Selection.near(tr.doc.resolve(start + neighbour.nodeSize + offsetInBlock)));
      }
      view.dispatch(tr.scrollIntoView());
      return true;
    };
    return { "Alt-ArrowUp": move(-1), "Alt-ArrowDown": move(1) };
  },
});

/* ────────────────────────── the slash command ──────────────────────────── */

export interface SlashState {
  active: boolean;
  /** Document position of the slash itself, so it can be replaced on pick. */
  from: number;
  query: string;
}

export const slashKey = new PluginKey<SlashState>("slashCommand");

const IDLE: SlashState = { active: false, from: 0, query: "" };

/**
 * `/` opens the same palette the plus button does.
 *
 * Tracked as PLUGIN state rather than component state, because only the
 * document knows whether the slash is still there: an undo, a click elsewhere,
 * or deleting back past it must all close the menu, and none of those are
 * events a React handler sees.
 */
const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      new Plugin<SlashState>({
        key: slashKey,
        state: {
          init: () => IDLE,
          apply(tr) {
            if (tr.getMeta(slashKey) === "close") return IDLE;

            const { $from, empty } = tr.selection;
            if (!empty || $from.depth !== 1) return IDLE;
            const parent = $from.parent;
            if (parent.type.name !== "paragraph" && parent.type.name !== "heading") return IDLE;

            const text = parent.textBetween(0, $from.parentOffset, undefined, "￼");
            /*
             * Only from the very start of the block, and a space ends it: after
             * "/ " the writer meant a slash, not a command. Derived from the
             * DOCUMENT rather than from keystrokes, so undo, a click elsewhere
             * and deleting back past the slash all close it for free.
             */
            if (!text.startsWith("/") || /\s/.test(text)) return IDLE;
            return { active: true, from: $from.start(), query: text.slice(1) };
          },
        },
      }),
    ];
  },
});

/* ───────────────────────────── assembly ────────────────────────────────── */

/**
 * The node set, and it is a data-safety decision rather than a feature list.
 *
 * `validateDoc` decides what the API stores, `DocRenderer` decides what the
 * page can draw, and this decides what a writer can produce. A node any one of
 * them does not know is dropped on save or renders as nothing.
 */
export function createEditorExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      // The reader draws h2 and h3. An h1 would be a second title on the page.
      heading: { levels: [2, 3] },
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
       * allows tel, ftp and xmpp, so it restricts nothing. This is the real
       * gate, and it is the same predicate the reader applies, so a link that
       * survives here is one the page will actually render.
       */
      isAllowedUri: (url, { defaultValidate }) => {
        if (!defaultValidate(url)) return false;
        return !/^[a-z][a-z0-9+.-]*:/i.test(url.trim()) || isAllowedHref(url);
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // allowBase64 stays off: a pasted data URI would embed megabytes of image
    // in the document body, which then travels in every read of that post.
    DocImage.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder, showOnlyWhenEditable: true }),
    SlashCommand,
    BlockMove,
  ];
}
