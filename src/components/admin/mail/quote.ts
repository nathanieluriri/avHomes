"use client";

/**
 * Received mail made safe to draw and with its quoted history folded away,
 * Gmail's "•••" in place of it.
 *
 * Runs in the browser on a parsed copy (DOMParser never runs scripts). What
 * could act is removed, then the quote is moved into a <details>, which
 * toggles with no script at all, so the frame keeps its no-scripts sandbox.
 */

const BLOCKED = "script, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, link, base, meta, noscript, template, svg, math";
const URL_ATTRS = ["href", "src", "action", "formaction", "background", "poster", "xlink:href"];

function scrub(doc: Document): void {
  for (const el of doc.querySelectorAll(BLOCKED)) el.remove();
  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript|data:text\/html)/iu.test(attr.value)) {
        el.setAttribute(attr.name, "#");
      } else if (name === "style" && /expression\s*\(|javascript:/iu.test(attr.value)) el.removeAttribute(attr.name);
    }
  }
}

const WROTE = /\bwrote:\s*$|\bschrieb:\s*$|\ba écrit\s*:\s*$/iu;

/** The attribution line just before a quote, when it is its own element or text. */
function attributionBefore(el: Element): Node | null {
  let prev = el.previousSibling;
  while (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? "").trim() === "") prev = prev.previousSibling;
  while (prev && prev.nodeName === "BR") prev = prev.previousSibling;
  if (!prev) return null;
  const text = (prev.textContent ?? "").trim();
  if (text.length > 400 || !WROTE.test(text)) return null;
  return prev;
}

/** Everything from `start` to the end of the document, in order. */
function restFrom(start: Element, body: HTMLElement): Node[] {
  const out: Node[] = [start];
  for (let node: Node | null = start; node && node !== body; node = node.parentNode) {
    for (let next = node.nextSibling; next; next = next.nextSibling) out.push(next);
  }
  return out;
}

function fold(doc: Document, nodes: Node[]): void {
  const first = nodes[0];
  if (!first?.parentNode) return;
  const details = doc.createElement("details");
  details.className = "avh-quote";
  const summary = doc.createElement("summary");
  summary.setAttribute("title", "Show trimmed content");
  summary.setAttribute("aria-label", "Show trimmed content");
  summary.textContent = "•••";
  details.append(summary);
  first.parentNode.insertBefore(details, first);
  for (const node of nodes) details.append(node);
}

/** The first quote marker Gmail, Apple Mail, Thunderbird, Yahoo or Outlook leaves, folded. */
function foldQuote(doc: Document): boolean {
  const body = doc.body;
  const outlook = doc.querySelector("#divRplyFwdMsg, #divRplyFwdMsg_1, div[id^='divRplyFwdMsg']");
  if (outlook) {
    // Outlook's header block and everything after it is the history; its <hr> goes with it.
    let start: Element = outlook;
    const prev = outlook.previousElementSibling;
    if (prev?.tagName === "HR") start = prev;
    fold(doc, restFrom(start, body));
    return true;
  }
  const marked = doc.querySelector(
    "div.gmail_quote, div.gmail_quote_container, blockquote.gmail_quote, div.yahoo_quoted, div.moz-cite-prefix, blockquote[type='cite']",
  );
  if (marked) {
    const nodes: Node[] = [];
    if (marked.matches("div.moz-cite-prefix")) {
      nodes.push(marked);
      const next = marked.nextElementSibling;
      if (next?.tagName === "BLOCKQUOTE") nodes.push(next);
    } else {
      const attr = attributionBefore(marked);
      if (attr) nodes.push(attr);
      nodes.push(marked);
    }
    fold(doc, nodes);
    return true;
  }
  // "On <date>, <name> wrote:" followed by a blockquote, from any other client.
  for (const quote of doc.querySelectorAll("blockquote")) {
    const attr = attributionBefore(quote);
    if (attr) {
      fold(doc, [attr, quote]);
      return true;
    }
  }
  return false;
}

const FRAME_STYLE = `
html,body{margin:0;padding:0;background:#fff}
body{padding:2px 2px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e1b2e;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
details.avh-quote{margin:8px 0}
details.avh-quote>summary{list-style:none;display:inline-block;cursor:pointer;padding:0 8px;height:14px;line-height:8px;font-size:12px;letter-spacing:1px;color:#55637a;background:#e8eaed;border-radius:8px;user-select:none}
details.avh-quote>summary::-webkit-details-marker{display:none}
details.avh-quote>summary:hover{background:#d7dade}
details.avh-quote[open]>summary{margin-bottom:8px}
`;

/** A frame document for one message's HTML: scrubbed, links opening outside, the quote folded. */
export function prepareEmailHtml(html: string): { doc: string; folded: boolean } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  scrub(doc);
  const folded = foldQuote(doc);
  for (const a of doc.querySelectorAll("a[href]")) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }
  const style = doc.createElement("style");
  style.textContent = FRAME_STYLE;
  doc.head.prepend(style);
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.prepend(charset);
  return { doc: `<!doctype html>${doc.documentElement.outerHTML}`, folded };
}

/** A plain text body split into what was written and the quoted history under it. */
export function splitTextQuote(text: string): { body: string; quote: string } {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  // The quote starts at an "On ... wrote:" line followed by ">" lines, or at a ">" run that goes to the end.
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const joined = WROTE.test(lines[i]) ? i : /^On\b/iu.test(lines[i]) && WROTE.test(lines[i + 1] ?? "") ? i : -1;
    if (joined >= 0) {
      let q = WROTE.test(lines[i]) ? i + 1 : i + 2;
      while (q < lines.length && lines[q].trim() === "") q += 1;
      if (q < lines.length && lines[q].startsWith(">")) {
        start = i;
        break;
      }
    }
    if (lines[i].startsWith(">") && lines.slice(i).every((l) => l.trim() === "" || l.startsWith(">"))) {
      start = i;
      break;
    }
  }
  if (start < 0) return { body: text, quote: "" };
  return { body: lines.slice(0, start).join("\n").replace(/\s+$/u, ""), quote: lines.slice(start).join("\n") };
}

/** The first line of what someone wrote, for a folded message's one-line row. */
export function snippetOf(m: { text: string; html: string }): string {
  let text = m.text;
  if (text.trim() === "" && m.html) {
    const doc = new DOMParser().parseFromString(m.html, "text/html");
    for (const el of doc.querySelectorAll("style, script, head, title")) el.remove();
    foldQuote(doc);
    for (const el of doc.querySelectorAll("details.avh-quote")) el.remove();
    text = doc.body.textContent ?? "";
  }
  // What they wrote, without the quote or the signature under it.
  return (splitTextQuote(text).body.split(/\n-- ?\n/u)[0] ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 200);
}
