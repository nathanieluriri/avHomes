import type { DocNode } from "./doc";
import { docToText } from "./doc";

/**
 * The ONE authority on what a document may contain.
 *
 * Route schemas type the document field as unknown and defer to this, rather
 * than declaring a second, weaker Zod copy that would answer 400 where the
 * contract says 422 and would drift the first time a node type is added.
 */
export class InvalidDocumentError extends Error {
  override readonly name = "InvalidDocumentError";
  /** Where in the tree the refusal happened, e.g. content[2].content[0]. */
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`invalid document at ${path || "<root>"}: ${reason}`);
    this.path = path;
    this.reason = reason;
  }
}

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "horizontalRule",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

const ALLOWED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
]);

/** Anything outside this set is a script vector wearing an href. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const MAX_DEPTH = 24;
const MAX_NODES = 8_000;
const MAX_SERIALISED_BYTES = 1_000_000;
const MAX_TEXT_BYTES = 400_000;

export function validateDoc(value: unknown): DocNode {
  if (!isRecord(value)) throw new InvalidDocumentError("", "not an object");
  if (value.type !== "doc") {
    throw new InvalidDocumentError("", `root type is ${String(value.type)}, expected doc`);
  }

  const serialised = safeStringify(value);
  if (serialised === null) throw new InvalidDocumentError("", "not serialisable as JSON");
  if (byteLength(serialised) > MAX_SERIALISED_BYTES) {
    throw new InvalidDocumentError("", `document exceeds ${MAX_SERIALISED_BYTES} bytes`);
  }

  const doc = value as unknown as DocNode;
  visit(doc, "", 0, { nodes: 0 });

  // doc is block+ in ProseMirror's schema: a doc with no blocks is invalid and
  // locks an editor that hydrates it with content checking on.
  if (!Array.isArray(doc.content) || doc.content.length === 0) {
    throw new InvalidDocumentError("content", "document has no blocks");
  }
  if (byteLength(docToText(doc)) > MAX_TEXT_BYTES) {
    throw new InvalidDocumentError("", `derived text exceeds ${MAX_TEXT_BYTES} bytes`);
  }
  return doc;
}

function visit(node: DocNode, path: string, depth: number, counter: { nodes: number }): void {
  if (depth > MAX_DEPTH) throw new InvalidDocumentError(path, `nesting deeper than ${MAX_DEPTH}`);
  if (++counter.nodes > MAX_NODES) {
    throw new InvalidDocumentError(path, `more than ${MAX_NODES} nodes`);
  }
  if (!isRecord(node)) throw new InvalidDocumentError(path, "not an object");
  if (typeof node.type !== "string") throw new InvalidDocumentError(path, "missing type");
  if (!ALLOWED_NODES.has(node.type)) {
    throw new InvalidDocumentError(path, `node type ${node.type} is not allowed`);
  }
  if (node.type === "text" && typeof node.text !== "string") {
    throw new InvalidDocumentError(path, "text node has no text");
  }

  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) {
      throw new InvalidDocumentError(`${path}.marks`, "marks is not an array");
    }
    node.marks.forEach((mark, i) => {
      const markPath = `${path}.marks[${i}]`;
      if (!isRecord(mark) || typeof mark.type !== "string") {
        throw new InvalidDocumentError(markPath, "mark has no type");
      }
      if (!ALLOWED_MARKS.has(mark.type)) {
        throw new InvalidDocumentError(markPath, `mark type ${mark.type} is not allowed`);
      }
      if (mark.type === "link") assertSafeHref(markPath, mark.attrs);
    });
  }

  if (node.type === "image") assertSafeSrc(path, node.attrs);

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) {
      throw new InvalidDocumentError(`${path}.content`, "content is not an array");
    }
    node.content.forEach((child, i) => visit(child, `${path}.content[${i}]`, depth + 1, counter));
  }
}

function assertSafeHref(path: string, attrs: unknown): void {
  if (!isRecord(attrs) || typeof attrs.href !== "string") {
    throw new InvalidDocumentError(path, "link has no href");
  }
  assertProtocol(path, attrs.href, "href");
}

function assertSafeSrc(path: string, attrs: unknown): void {
  if (!isRecord(attrs) || typeof attrs.src !== "string") {
    throw new InvalidDocumentError(path, "image has no src");
  }
  // A same-origin relative src is how our own image ids ride inside a document.
  if (attrs.src.startsWith("/")) return;
  assertProtocol(path, attrs.src, "src");
}

function assertProtocol(path: string, raw: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://avhomes.invalid");
  } catch {
    throw new InvalidDocumentError(path, `${field} is not a URL`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new InvalidDocumentError(path, `${field} protocol ${parsed.protocol} is not allowed`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
