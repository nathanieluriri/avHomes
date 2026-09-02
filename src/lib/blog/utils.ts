import type { DocNode } from "./types";

/**
 * Image URLs are now absolute Vercel Blob URLs written by our own upload route,
 * so there is nothing to rewrite.
 *
 * This used to proxy through a same-origin route because the previous blog host
 * answered with a short-lived presigned redirect whose credential could never
 * reach HTML. That host is gone and so is the proxy. The function stays as the
 * one place a URL passes through, so a future CDN or resizing hop has somewhere
 * to live.
 */
export function imageUrl(url: string): string {
  return url;
}

/**
 * Re-exported, not redefined.
 *
 * The editor gates typed links with this, the reader strips anything that fails
 * it, and the publish checklist counts what would be stripped. A second copy
 * here would be a second answer to "is this link real", and the two would drift.
 */
export { isAllowedHref } from "@avhomes/contracts";

export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href);
}

/** Concatenates the text nodes of a subtree. Used for code blocks and labels. */
export function plainText(node: DocNode | null | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!node.content) return "";
  return node.content.map(plainText).join("");
}

/** Walks the document collecting text, joined by spaces and collapsed. */
export function docToText(doc: DocNode | null | undefined): string {
  if (!doc) return "";
  const out: string[] = [];
  const walk = (n: DocNode) => {
    if (typeof n.text === "string") out.push(n.text);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Cuts on a word boundary so a description never ends mid word. */
export function truncate(text: string, limit = 180): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const DATE_LOCALE = "en-NG";

export function formatLongDate(ms: number): string {
  return new Date(ms).toLocaleDateString(DATE_LOCALE, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(DATE_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatFactDate(ms: number): string {
  return new Date(ms).toLocaleDateString(DATE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * JSON.stringify escapes for JSON, not for HTML. Inside a script element the
 * parser hunts for the literal bytes "</script" and ends the element there
 * however well quoted the JSON is, and "<!--" does the same through the
 * comment state. The \uXXXX forms are still valid JSON.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
