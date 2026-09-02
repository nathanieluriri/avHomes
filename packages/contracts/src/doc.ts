/** TipTap/ProseMirror JSON. Block oriented by construction. */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

/**
 * An empty paragraph, not a doc with an empty content array.
 *
 * A doc with no blocks is invalid under ProseMirror's schema, and hydrating one
 * with content checking on locks the editor. This is the value the application
 * writes by default, so it is also the value fixtures must carry.
 */
export function emptyDoc(): DocNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function isEmptyDoc(doc: DocNode): boolean {
  return docToText(doc).trim().length === 0;
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
]);

/** Flattens a document to plain text. Used for search, excerpts and word counts. */
export function docToText(node: DocNode): string {
  const out: string[] = [];
  walk(node, out);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function walk(node: DocNode, out: string[]): void {
  if (typeof node.text === "string") out.push(node.text);
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out);
    // Separated so two paragraphs do not run their last and first words together.
    if (BLOCK_TYPES.has(node.type)) out.push("\n");
  }
}

/** Truncates on a word boundary, and never adds an ellipsis to a string that fits. */
export function summarise(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return kept.trimEnd() + "...";
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** 200 words per minute, floored at 1 so nothing reads as "0 min read". */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}
