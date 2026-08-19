import { BLOG_API_BASE } from "./config";
import type { DocNode } from "./types";

/** Matches only the public image endpoint, so pasted remote URLs fall through. */
export function publicImageId(url: string): string | null {
  const m = /^\/api\/public\/images\/([A-Za-z0-9_-]+)$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Public image ids route through the same origin proxy. The upstream endpoint
 * answers with a short lived presigned redirect, so its URL can never be
 * cached and must never reach HTML.
 */
export function imageUrl(url: string): string {
  const id = publicImageId(url);
  if (id) return `/images/blog/${id}`;
  if (url.startsWith("http")) return url;
  // Site assets under /images are already same origin. Only genuinely
  // relative API paths get the blog host prepended.
  if (url.startsWith("/images/")) return url;
  return `${BLOG_API_BASE}${url}`;
}

/**
 * A single slash followed by a non slash, non backslash character is root
 * relative. Everything a browser would read as "an authority follows" is
 * rejected: //host, ///host, /\host, \\host. Browsers normalise a leading
 * backslash to a forward slash, so /\evil.com resolves like //evil.com and a
 * bare startsWith("//") check is not enough.
 */
export function isAllowedHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href) || /^\/(?![\\/])/.test(href);
}

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
