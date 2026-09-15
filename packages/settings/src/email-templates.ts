import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  NotFoundError,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import {
  EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_KEYS,
  docToText,
  type DocNode,
  type EmailTemplate,
  type EmailTemplateKey,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";

/**
 * Editable email templates, and the one HTML layout every email is sent in.
 *
 * A template is plain text with `{{placeholders}}`. Plain text on purpose: it is
 * what a person can edit without breaking, and the HTML version is derived from
 * it (paragraphs, links made clickable, the conversation drawn as a thread), so
 * the two copies in one email cannot say different things.
 */

interface TemplateDoc {
  _id: EmailTemplateKey;
  subject: string;
  body: string;
  updatedAt: number;
  updatedByName: string;
}

function templates(db: Db) {
  return collection<TemplateDoc>(db, COLLECTIONS.emailTemplates);
}

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export async function readTemplate(db: Db, key: EmailTemplateKey): Promise<EmailTemplate> {
  const doc = await templates(db).findOne({ _id: key });
  const info = EMAIL_TEMPLATES[key];
  return {
    key,
    subject: doc?.subject ?? info.defaultSubject,
    body: doc?.body ?? info.defaultBody,
    customised: Boolean(doc),
    updatedAt: doc?.updatedAt ?? null,
    updatedByName: doc?.updatedByName ?? null,
  };
}

/* ──────────────────────────────── render ──────────────────────────────── */

export interface ConversationLine {
  who: string;
  at: number;
  body: string;
  fromTeam: boolean;
}

/** Values for placeholders. `html` holds pre-rendered blocks (conversation, content) that must not be escaped. */
export interface EmailVars {
  text: Record<string, string>;
  html?: Record<string, string>;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/gu;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function linkify(escaped: string): string {
  return escaped.replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/gu,
    (url) => `<a href="${url}" style="color:#8f2d4a;text-decoration:underline">${url}</a>`,
  );
}

export function conversationText(lines: readonly ConversationLine[]): string {
  return lines.map((l) => `${l.who} · ${new Date(l.at).toUTCString()}\n${l.body}`).join("\n\n");
}

export function conversationHtml(lines: readonly ConversationLine[]): string {
  return lines
    .map(
      (l) => `<div style="margin:0 0 12px;${l.fromTeam ? "padding-left:24px" : "padding-right:24px"}">
  <div style="font-size:12px;color:#64748b;margin-bottom:4px">${escapeHtml(l.who)} · ${escapeHtml(
    new Date(l.at).toUTCString(),
  )}</div>
  <div style="border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.5;white-space:pre-wrap;${
    l.fromTeam ? "background:#8f2d4a;color:#ffffff" : "background:#eef1f6;color:#1e1b2e"
  }">${linkify(escapeHtml(l.body))}</div>
</div>`,
    )
    .join("\n");
}

/** Fills a plain text template. Unknown placeholders are left blank rather than printed raw. */
function fillText(template: string, vars: EmailVars): string {
  return template.replace(PLACEHOLDER, (_, name: string) => vars.text[name] ?? "");
}

/** Paragraphs from blank lines; a line that is only an HTML placeholder becomes that block. */
function fillHtml(template: string, vars: EmailVars): string {
  const blocks = template.split(/\n{2,}/u);
  return blocks
    .map((block) => {
      const only = block.trim().match(/^\{\{\s*([a-zA-Z]+)\s*\}\}$/u);
      if (only && vars.html?.[only[1] ?? ""] !== undefined) return vars.html[only[1] ?? ""];
      const html = linkify(escapeHtml(block)).replace(PLACEHOLDER, (_, name: string) => {
        const rich = vars.html?.[name];
        if (rich !== undefined) return rich;
        return linkify(escapeHtml(vars.text[name] ?? ""));
      });
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e1b2e">${html.replace(/\n/gu, "<br>")}</p>`;
    })
    .join("\n");
}

export function emailLayout(inner: string, preheader = ""): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f3f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#3b0d1f;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px">AVHomes</td></tr>
<tr><td style="padding:28px">${inner}</td></tr>
</table>
<p style="font-size:12px;color:#94a3b8;margin:16px 0 0">AVHomes · Lagos and Abuja</p>
</td></tr></table>
</body></html>`;
}

export function renderWith(template: { subject: string; body: string }, vars: EmailVars, preheader = ""): RenderedEmail {
  return {
    subject: fillText(template.subject, vars).replace(/\s+/gu, " ").trim() || "AVHomes",
    text: fillText(template.body, vars),
    html: emailLayout(fillHtml(template.body, vars), preheader),
  };
}

export async function renderEmail(db: Db, key: EmailTemplateKey, vars: EmailVars, preheader = ""): Promise<RenderedEmail> {
  return renderWith(await readTemplate(db, key), vars, preheader);
}

/* ─────────────────────────── rich text to email ────────────────────────── */

function marksWrap(text: string, marks: DocNode["marks"]): string {
  let out = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (mark.type === "bold") out = `<strong>${out}</strong>`;
    else if (mark.type === "italic") out = `<em>${out}</em>`;
    else if (mark.type === "underline") out = `<u>${out}</u>`;
    else if (mark.type === "strike") out = `<s>${out}</s>`;
    else if (mark.type === "code") out = `<code style="background:#eef1f6;padding:1px 4px;border-radius:4px">${out}</code>`;
    else if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "");
      if (/^(https?:|mailto:)/iu.test(href)) {
        out = `<a href="${escapeHtml(href)}" style="color:#8f2d4a;text-decoration:underline">${out}</a>`;
      }
    }
  }
  return out;
}

const P = "margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e1b2e";

/** The journal editor's document as email-safe HTML: inline styles only, no classes, no scripts. */
export function docToEmailHtml(node: DocNode): string {
  const kids = () => (node.content ?? []).map(docToEmailHtml).join("");
  switch (node.type) {
    case "doc":
      return kids();
    case "text":
      return marksWrap(node.text ?? "", node.marks);
    case "paragraph":
      return `<p style="${P}">${kids() || "&nbsp;"}</p>`;
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)));
      const size = level === 1 ? 26 : level === 2 ? 21 : 17;
      return `<h${level} style="margin:24px 0 12px;font-size:${size}px;line-height:1.3;color:#1e1b2e">${kids()}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote style="margin:0 0 16px;padding:4px 0 4px 16px;border-left:3px solid #8f2d4a;color:#475569">${kids()}</blockquote>`;
    case "bulletList":
    case "taskList":
      return `<ul style="margin:0 0 16px;padding-left:22px">${kids()}</ul>`;
    case "orderedList":
      return `<ol style="margin:0 0 16px;padding-left:22px">${kids()}</ol>`;
    case "listItem":
    case "taskItem":
      return `<li style="font-size:15px;line-height:1.6;color:#1e1b2e">${kids().replace(/margin:0 0 16px/gu, "margin:0")}</li>`;
    case "codeBlock":
      return `<pre style="margin:0 0 16px;background:#eef1f6;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${kids()}</pre>`;
    case "horizontalRule":
      return `<hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0">`;
    case "hardBreak":
      return "<br>";
    case "image": {
      const src = String(node.attrs?.src ?? "");
      if (!/^https:\/\//iu.test(src)) return "";
      const alt = escapeHtml(String(node.attrs?.alt ?? ""));
      return `<p style="margin:0 0 16px"><img src="${escapeHtml(src)}" alt="${alt}" width="544" style="max-width:100%;height:auto;border-radius:10px;display:block"></p>`;
    }
    case "table":
      return `<table role="presentation" cellpadding="6" style="border-collapse:collapse;margin:0 0 16px;width:100%">${kids()}</table>`;
    case "tableRow":
      return `<tr>${kids()}</tr>`;
    case "tableHeader":
      return `<th style="border:1px solid #e2e8f0;text-align:left;font-size:14px">${kids().replace(/margin:0 0 16px/gu, "margin:0")}</th>`;
    case "tableCell":
      return `<td style="border:1px solid #e2e8f0;font-size:14px">${kids().replace(/margin:0 0 16px/gu, "margin:0")}</td>`;
    default:
      return kids();
  }
}

export function docToEmailText(doc: DocNode): string {
  return docToText(doc);
}

/* ──────────────────────────────── routes ──────────────────────────────── */

const TemplateBody = z
  .object({
    subject: str().min(1).max(200).trim(),
    body: str().min(1).max(10000),
  })
  .strict();

/** Stand-in values so a preview or test send reads like a real email. */
function sampleVars(origin: string): EmailVars {
  const lines: ConversationLine[] = [
    { who: "Ada Obi", at: Date.now() - 3_600_000, body: "Hello, is the 4 bedroom in Lekki still available?", fromTeam: false },
    { who: "AVHomes team", at: Date.now() - 1_800_000, body: "It is. Would Saturday morning suit you for a viewing?", fromTeam: true },
  ];
  return {
    text: {
      name: "Ada",
      property: "4 bedroom duplex, Lekki",
      propertyLink: `${origin}/listings`,
      agentName: "AVHomes team",
      conversation: conversationText(lines),
      replyLink: `${origin}/conversation/sample`,
      message: "Just checking whether Saturday still works for the viewing.",
      unsubscribeLink: `${origin}/unsubscribe`,
      subject: "What is new at AVHomes this month",
      content: "The newsletter you write appears here.",
    },
    html: {
      conversation: conversationHtml(lines),
      content: `<p style="${P}">The newsletter you write appears here.</p>`,
    },
  };
}

export function emailTemplateRoutes(deps: { mailer: Mailer; origin: (req: { url: string }) => string }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/email-templates", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const items = await Promise.all(EMAIL_TEMPLATE_KEYS.map((key) => readTemplate(db, key)));
    return c.json({ items });
  });

  routes.put("/admin/email-templates/:key", requireAuth(), async (c) => {
    const key = pathParam(c, "key");
    if (!isTemplateKey(key)) throw new NotFoundError(`template ${key}`);
    const body = await readJson(c, TemplateBody);
    const db = await currentDb(c);
    await templates(db).updateOne(
      { _id: key },
      { $set: { subject: body.subject, body: body.body, updatedAt: Date.now(), updatedByName: currentUser(c).displayName } },
      { upsert: true },
    );
    return c.json({ template: await readTemplate(db, key) });
  });

  // Back to the built-in wording.
  routes.delete("/admin/email-templates/:key", requireAuth(), async (c) => {
    const key = pathParam(c, "key");
    if (!isTemplateKey(key)) throw new NotFoundError(`template ${key}`);
    const db = await currentDb(c);
    await templates(db).deleteOne({ _id: key });
    return c.json({ template: await readTemplate(db, key) });
  });

  routes.post("/admin/email-templates/:key/preview", requireAuth(), async (c) => {
    const key = pathParam(c, "key");
    if (!isTemplateKey(key)) throw new NotFoundError(`template ${key}`);
    const body = await readJson(c, TemplateBody);
    return c.json({ email: renderWith(body, sampleVars(deps.origin(c.req))) });
  });

  routes.post("/admin/email-templates/:key/test", requireAuth(), async (c) => {
    const key = pathParam(c, "key");
    if (!isTemplateKey(key)) throw new NotFoundError(`template ${key}`);
    const body = await readJson(c, TemplateBody);
    const user = currentUser(c);
    const email = renderWith(body, sampleVars(deps.origin(c.req)));
    const sent = await trySend(
      deps.mailer,
      { to: user.email, subject: `[Test] ${email.subject}`, text: email.text, html: email.html },
      { requestId: c.get("requestId"), route: "POST /admin/email-templates/:key/test" },
    );
    return c.json({ sent, to: user.email });
  });

  return routes;
}
