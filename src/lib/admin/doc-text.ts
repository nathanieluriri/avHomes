import type { DocNode } from "@avhomes/contracts";

/**
 * A plain-text bridge to and from the stored ProseMirror document.
 *
 * This is a deliberate interim: the reader renders the full node set (headings,
 * lists, quotes, code, tables), and this editor only round-trips paragraphs and
 * headings. It is lossless for what it can express and it REFUSES to flatten
 * what it cannot, so opening a rich post in this editor cannot silently destroy
 * its structure.
 *
 * TODO(editor): replace with TipTap once @tiptap/react is added, at which point
 * `canEditAsText` stops gating the textarea.
 */

const TEXT_EDITABLE = new Set(["doc", "paragraph", "heading", "text", "hardBreak"]);

/**
 * Whether this document survives a text round trip.
 *
 * A post carrying a list or a table renders read-only in the editor rather than
 * being silently reduced to paragraphs on the next save.
 */
export function canEditAsText(doc: DocNode): boolean {
  let ok = true;
  const walk = (node: DocNode): void => {
    if (!TEXT_EDITABLE.has(node.type)) ok = false;
    // A mark carries formatting a textarea cannot show, so a bolded run would
    // come back plain. That is loss, so it is refused too.
    if (node.marks && node.marks.length > 0) ok = false;
    node.content?.forEach(walk);
  };
  walk(doc);
  return ok;
}

/** Headings become "## Text"; paragraphs become their own line. */
export function docToEditable(doc: DocNode): string {
  const blocks: string[] = [];
  for (const node of doc.content ?? []) {
    const text = (node.content ?? []).map((child) => child.text ?? "").join("");
    if (node.type === "heading") {
      const level = Number(node.attrs?.level ?? 2);
      blocks.push(`${"#".repeat(Math.min(6, Math.max(1, level)))} ${text}`);
    } else {
      blocks.push(text);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Text back to a document.
 *
 * Never returns an empty content array: a doc with no blocks is invalid under
 * ProseMirror's schema and locks an editor that hydrates it, which is exactly
 * the value an empty textarea would otherwise produce.
 */
export function editableToDoc(text: string): DocNode {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "");

  if (blocks.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };

  return {
    type: "doc",
    content: blocks.map((block) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(block);
      if (heading) {
        return {
          type: "heading",
          attrs: { level: heading[1].length },
          content: [{ type: "text", text: heading[2] }],
        };
      }
      return { type: "paragraph", content: [{ type: "text", text: block }] };
    }),
  };
}
