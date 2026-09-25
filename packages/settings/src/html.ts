/* Kept apart from email-templates so settings can clean HTML without importing the templates. */

/**
 * Makes a pasted email design safe to store and send while keeping its look.
 *
 * Tables, inline styles, images and links survive. Anything that runs code or
 * collects input does not: scripts, frames, forms, event handler attributes and
 * `javascript:` URLs. Mail clients strip most of these anyway; removing them here
 * means the preview shows exactly what is sent.
 */
export function sanitizeEmailHtml(input: string): string {
  let html = input;
  html = html.replace(/<!--[\s\S]*?-->/gu, (c) => (/\[if |<!\[endif/iu.test(c) ? c : ""));
  // Not `style`: email designs keep their CSS in a <style> block.
  const blocked = "script|iframe|object|embed|form|noscript|template|svg|math";
  const pair = new RegExp(String.raw`<(${blocked})\b[\s\S]*?<\/\1\s*>`, "giu");
  const lone = new RegExp(String.raw`<\/?(${blocked})\b[^>]*>`, "giu");
  // Repeated until nothing changes, so `<scr<script></script>ipt>` cannot reassemble a tag.
  for (let previous = ""; previous !== html; ) {
    previous = html;
    html = html.replace(pair, "").replace(lone, "");
  }
  html = html.replace(/<(input|button|select|textarea|link|base|frame|frameset|applet)\b[^>]*>/giu, "");
  html = html.replace(/<\/(button|select|textarea|frameset|applet)\s*>/giu, "");
  html = html.replace(/<meta\b[^>]*http-equiv[^>]*>/giu, "");
  // `/` counts as a separator too: `<img/onerror=...>` is valid HTML.
  html = html.replace(/[\s/]+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, " ");
  html = html.replace(
    /\s(href|src|action|formaction|background|poster)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/giu,
    ' $1="#"',
  );
  html = html.replace(/expression\s*\(/giu, "(");
  return html.trim();
}

/** A readable plain text copy of an HTML email, for the text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|title)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<a\b[^>]*href=("|')(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu, (_, __, href: string, label: string) => `${label.replace(/<[^>]+>/gu, "").trim()} (${href})`)
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n\s*\n\s*\n+/gu, "\n\n")
    .trim();
}
