import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { isAllowedHref } from "@avhomes/contracts";

/**
 * Paste repair.
 *
 * Everything a writer pastes arrives as somebody else's HTML. Google Docs wraps
 * the whole payload in a bold element that then disclaims itself, Word ships
 * `<o:p>` and a kilobyte of `mso-` styles per paragraph, Notion writes
 * checkboxes as plain list items, and any web page can carry markup we must
 * never execute.
 *
 * The rules below are ORDERED: strip what is dangerous, then strip what is
 * noise, then TRANSLATE what is meaningful into shapes this schema has.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE INVARIANT ACROSS ALL OF IT IS THAT NO WORDS ARE LOST.
 *
 * A repair that drops a sentence is worse than one that drops a font. So a
 * caption becomes a caption rather than being deleted, a heading level this
 * schema lacks is remapped rather than flattened, a checklist keeps the state
 * of its items, and a table we cannot nest is reduced to text inside its host
 * cell rather than thrown away.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Never survives a paste, regardless of source. */
const NEVER_PASTE = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "noscript",
  "link",
  "meta",
  "base",
  "form",
  "button",
  "select",
  "textarea",
  "svg",
  "math",
  "template",
].join(",");

/**
 * The only inline styles worth keeping: the ones TipTap's own mark parsers
 * read. Everything else, `mso-*`, `font-family`, colours, spacing, is the
 * source application describing its own canvas rather than the writing.
 * Dropping the rest is what turns a Word paste back into text.
 */
const KEEP_STYLE = /^(font-weight|font-style|text-decoration|text-decoration-line)$/i;

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function rename(doc: Document, el: Element, tag: string): void {
  const next = doc.createElement(tag);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
}

function stripHostile(doc: Document): void {
  doc.querySelectorAll(NEVER_PASTE).forEach((el) => el.remove());

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();

      // Event handlers are the whole attack surface of a pasted fragment.
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === "style") {
        const kept = attr.value
          .split(";")
          .map((d) => d.trim())
          .filter((d) => KEEP_STYLE.test(d.split(":")[0]?.trim() ?? ""));
        if (kept.length > 0) el.setAttribute("style", kept.join("; "));
        else el.removeAttribute("style");
        continue;
      }

      if ((name === "href" || name === "xlink:href") && !isAllowedHref(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // An anchor whose href was just dropped is no longer a link. Unwrap it so the
  // words stay and the affordance does not lie.
  doc.querySelectorAll("a:not([href])").forEach((el) => unwrap(el));

  /*
   * Images are the one src we resolve ourselves, and THIS IS THE ONLY GATE THEY
   * HAVE. The ProseMirror parse keeps an `<img>` with any src at all, and only
   * `allowBase64: false` removes a `data:` one. So a src that reaches a document
   * is a src this line let through.
   */
  doc.querySelectorAll("img").forEach((el) => {
    if (!isAllowedHref(el.getAttribute("src") ?? "")) el.remove();
  });
}

function removeComments(root: Node): void {
  for (const child of [...root.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) child.parentNode?.removeChild(child);
    else if (child.nodeType === Node.ELEMENT_NODE) removeComments(child);
  }
}

function stripChrome(doc: Document): void {
  // Word and Outlook namespaced elements (`<o:p>`, `<w:sdt>`, `<v:shape>`): the
  // tags carry no meaning here, but their text sometimes does.
  doc.querySelectorAll("*").forEach((el) => {
    if (el.tagName.includes(":")) unwrap(el);
  });

  /*
   * Google Docs wraps its whole payload in a bold element that then disclaims
   * itself with `font-weight: normal`. TipTap's own `b` parser checks for that,
   * but the wrapper also nests every block one level deeper than it needs.
   */
  doc.querySelectorAll("b[style], span[style]").forEach((el) => {
    if (/font-weight:\s*normal/i.test(el.getAttribute("style") ?? "")) unwrap(el);
  });

  // A span carries no block or mark meaning in this schema. Once its styles are
  // gone it is pure nesting, and nesting is what makes a Word paste slow.
  doc.querySelectorAll("span:not([style])").forEach((el) => unwrap(el));

  /*
   * Classes are the source application's stylesheet hooks and mean nothing here,
   * with ONE exception: `language-*` on a code element is the only place a
   * pasted code block records what language it is, and the code block parser
   * reads it. Dropping it would turn every pasted snippet into plain text.
   */
  doc.querySelectorAll("[class]").forEach((el) => {
    const kept = (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((c) => /^(language|lang)-[a-z0-9+#-]+$/i.test(c));
    if (kept.length > 0 && /^(CODE|PRE)$/.test(el.tagName)) el.setAttribute("class", kept.join(" "));
    else el.removeAttribute("class");
  });

  // Word brackets its list items in conditional comments.
  removeComments(doc.body);
}

/**
 * This schema has two heading levels, because the article's own h1 is the title
 * FIELD. A pasted h1 would otherwise be flattened to a paragraph and the
 * structure of an imported draft would vanish. Remap rather than drop.
 */
function demoteHeadings(doc: Document): void {
  doc.querySelectorAll("h1").forEach((el) => rename(doc, el, "h2"));
  doc.querySelectorAll("h4, h5, h6").forEach((el) => rename(doc, el, "h3"));
}

/**
 * A web article's image caption lives in a figcaption, and this schema keeps a
 * caption on the image node's `title`, which the reader draws as a figcaption
 * again. Without this, pasting a figure keeps the picture and turns its caption
 * into a stray paragraph underneath.
 */
function liftFigureCaptions(doc: Document): void {
  doc.querySelectorAll("figure").forEach((fig) => {
    const img = fig.querySelector("img");
    const cap = fig.querySelector("figcaption");
    if (img && cap) {
      const text = (cap.textContent ?? "").trim();
      if (text !== "" && !img.getAttribute("title")) img.setAttribute("title", text);
      cap.remove();
    }
    unwrap(fig);
  });

  // A blockquote's cite is part of the quote, not a sibling of it.
  doc.querySelectorAll("blockquote cite").forEach((cite) => {
    const text = (cite.textContent ?? "").trim();
    if (text === "") return;
    const p = doc.createElement("p");
    p.textContent = `- ${text}`;
    cite.replaceWith(p);
  });
}

/**
 * Notion, and most editors, export a checklist as an ordinary list whose items
 * open with a checkbox input. Left alone that becomes a bullet list with the
 * boxes stripped, so the STATE of every item is lost. TaskList parses
 * `data-type`, so translate rather than discard.
 */
function normaliseCheckboxLists(doc: Document): void {
  doc.querySelectorAll("ul, ol").forEach((list) => {
    const items = [...list.children].filter((c) => c.tagName === "LI");
    if (items.length === 0) return;
    // Only when EVERY item has a box. A list with one stray checkbox in it is an
    // ordinary list that happens to mention one, not a checklist.
    const withBoxes = items.filter((li) => li.querySelector('input[type="checkbox"]'));
    if (withBoxes.length !== items.length) return;

    list.setAttribute("data-type", "taskList");
    items.forEach((li) => {
      const box = li.querySelector('input[type="checkbox"]');
      const checked =
        box?.hasAttribute("checked") || box?.getAttribute("data-checked") === "true";
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", String(Boolean(checked)));
      box?.remove();
    });
  });

  // Any checkbox that was not part of a list is chrome, not content.
  doc.querySelectorAll("input").forEach((el) => el.remove());
}

/**
 * Tables are real nodes, so rows are not flattened. What the schema cannot hold
 * is a table INSIDE a table cell, which Word and Google Docs both use for
 * layout, so the inner table is reduced to text inside its host cell rather
 * than dropped.
 */
function flattenNestedTables(doc: Document): void {
  let guard = 0;
  let inner = doc.querySelector("table table");
  while (inner && guard++ < 50) {
    const rows = [...inner.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll("th, td")]
        .map((c) => (c.textContent ?? "").trim())
        .filter(Boolean)
        .join(" · "),
    );
    const p = doc.createElement("p");
    p.textContent = rows.filter(Boolean).join(" - ");
    inner.replaceWith(p);
    inner = doc.querySelector("table table");
  }
}

export function repairPastedHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  stripHostile(doc);
  stripChrome(doc);
  demoteHeadings(doc);
  liftFigureCaptions(doc);
  normaliseCheckboxLists(doc);
  flattenNestedTables(doc);
  return doc.body.innerHTML;
}

export const PasteRepair = Extension.create({
  name: "pasteRepair",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pasteRepair"),
        props: {
          transformPastedHTML: (html) => {
            try {
              return repairPastedHTML(html);
            } catch {
              // A parse failure must never block the paste itself. Somebody's
              // words are on the clipboard and getting them in beats tidying.
              return html;
            }
          },
        },
      }),
    ];
  },
});
