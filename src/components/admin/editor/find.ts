import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface Match {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  index: number;
  matches: Match[];
}

const EMPTY: FindState = { query: "", caseSensitive: false, index: 0, matches: [] };

export const findKey = new PluginKey<FindState>("findReplace");

/**
 * Flattens the document's text with a map back to document positions.
 *
 * Searching each text node separately would miss any match that crosses a MARK
 * boundary: "**find** me" is two text nodes, so "find me" would never match. A
 * newline is pushed when a new block starts, so a match cannot span two
 * paragraphs, which a reader would consider two separate places.
 */
function flatten(doc: PMNode): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i += 1) map.push(pos + i);
      text += node.text;
    } else if (node.isBlock && text.length > 0 && !text.endsWith("\n")) {
      text += "\n";
      map.push(pos);
    }
    return true;
  });
  return { text, map };
}

export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const { text, map } = flatten(doc);
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  let at = hay.indexOf(needle);
  // Bounded, so a pathological document cannot hang the typing path.
  while (at !== -1 && out.length < 5000) {
    const from = map[at];
    const last = map[at + needle.length - 1];
    if (from !== undefined && last !== undefined) out.push({ from, to: last + 1 });
    at = hay.indexOf(needle, at + Math.max(needle.length, 1));
  }
  return out;
}

/**
 * Find and replace, scoped to the document.
 *
 * Kept off the browser's own find deliberately: that one searches the app chrome
 * as well as the writing, cannot replace, and happily finds text inside a panel
 * that is not open.
 *
 * Replace-all is ONE transaction. The editor recounts words on every
 * transaction, so replacing two hundred matches one at a time would make the
 * cost of a replace scale with the document length. One transaction is also one
 * undo step and one autosave.
 */
export const FindReplace = Extension.create({
  name: "findReplace",
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
            // Nothing to recompute when neither the query nor the document moved.
            if (!meta && !tr.docChanged) return prev;
            const merged = { ...prev, ...meta };
            const matches = findMatches(next.doc, merged.query, merged.caseSensitive);
            return {
              ...merged,
              matches,
              index: matches.length > 0 ? Math.min(merged.index, matches.length - 1) : 0,
            };
          },
        },
        props: {
          decorations(state) {
            const f = findKey.getState(state);
            if (!f || f.matches.length === 0) return null;
            return DecorationSet.create(
              state.doc,
              f.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === f.index ? "find-hit is-current" : "find-hit",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

/** Exported so the bar can drive the plugin without reaching inside it. */
export function setFind(tr: Transaction, patch: Partial<FindState>): Transaction {
  return tr.setMeta(findKey, patch);
}

export function getFind(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY;
}
