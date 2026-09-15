import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  NotFoundError,
  PreconditionFailedError,
  StaleWriteError,
  auditEntityId,
  currentDb,
  currentUser,
  newId,
  pathParam,
  readJson,
  readQuery,
  requestOrigin,
  str,
  trySend,
  type AppEnv,
  type MailMessage,
  type Mailer,
} from "@avhomes/core";
import {
  emptyDoc,
  validateDoc,
  NEWSLETTER_FORMATS,
  type DocNode,
  type Newsletter,
  type NewsletterFormat,
  type NewsletterStatus,
  type Subscriber,
} from "@avhomes/contracts";
import { requireAuth, tokenId } from "@avhomes/identity";
import {
  docToEmailHtml,
  docToEmailText,
  htmlToText,
  pastedNewsletterHtml,
  readTemplate,
  renderWith,
  sanitizeEmailHtml,
} from "@avhomes/settings";

/**
 * The subscriber list, one-click unsubscribe, and newsletters sent to it.
 *
 * An unsubscribe link carries the subscriber id and an HMAC of it, so it needs
 * no stored token and cannot be forged for somebody else's address.
 */

interface SubscriberRow {
  _id: string;
  email: string;
  source: string | null;
  createdAt: number;
  unsubscribedAt?: number | null;
}

interface NewsletterDoc {
  _id: string;
  subject: string;
  preheader: string;
  content: DocNode;
  format?: NewsletterFormat;
  html?: string;
  status: NewsletterStatus;
  sentAt: number | null;
  sentCount: number;
  failedCount: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  createdByName: string;
  revision: number;
}

function subscribers(db: Db) {
  return collection<SubscriberRow>(db, COLLECTIONS.subscribers);
}

function newsletters(db: Db) {
  return collection<NewsletterDoc>(db, COLLECTIONS.newsletters);
}

function toSubscriber(doc: SubscriberRow): Subscriber {
  return {
    id: doc._id,
    email: doc.email,
    source: doc.source ?? null,
    createdAt: doc.createdAt,
    unsubscribedAt: doc.unsubscribedAt ?? null,
  };
}

function toNewsletter(doc: NewsletterDoc): Newsletter {
  return {
    id: doc._id,
    subject: doc.subject,
    preheader: doc.preheader,
    content: doc.content,
    format: doc.format ?? "doc",
    html: doc.html ?? "",
    status: doc.status,
    sentAt: doc.sentAt,
    sentCount: doc.sentCount,
    failedCount: doc.failedCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdByName: doc.createdByName,
    revision: doc.revision,
  };
}

export function unsubscribeToken(subscriberId: string): string {
  return tokenId(`unsubscribe:${subscriberId}`);
}

export function unsubscribeLink(origin: string, subscriberId: string): string {
  return `${origin}/unsubscribe?s=${encodeURIComponent(subscriberId)}&t=${unsubscribeToken(subscriberId)}`;
}

function oneClickHeaders(origin: string, subscriberId: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${origin}/api/public/unsubscribe?s=${encodeURIComponent(subscriberId)}&t=${unsubscribeToken(subscriberId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Removes an address from future sends. Shared by the public link and the console. */
export async function unsubscribe(db: Db, subscriberId: string): Promise<boolean> {
  const res = await subscribers(db).updateOne(
    { _id: subscriberId, unsubscribedAt: null },
    { $set: { unsubscribedAt: Date.now() } },
  );
  return res.matchedCount > 0;
}

export async function welcomeEmail(db: Db, origin: string, subscriber: { _id: string; email: string }): Promise<MailMessage> {
  const template = await readTemplate(db, "subscribe-welcome");
  const rendered = renderWith(template, { text: { unsubscribeLink: unsubscribeLink(origin, subscriber._id) }, origin });
  return { to: subscriber.email, ...rendered, headers: oneClickHeaders(origin, subscriber._id) };
}

async function newsletterEmail(
  db: Db,
  origin: string,
  letter: Pick<NewsletterDoc, "subject" | "preheader" | "content" | "format" | "html">,
  to: { id: string; email: string },
): Promise<MailMessage> {
  if (letter.format === "html") {
    const link = unsubscribeLink(origin, to.id);
    const html = pastedNewsletterHtml(letter.html ?? "", { unsubscribeLink: link, preheader: letter.preheader });
    return {
      to: to.email,
      subject: letter.subject.trim() || "AV Homes",
      html,
      text: `${htmlToText(html)}\n\nUnsubscribe: ${link}`,
      headers: oneClickHeaders(origin, to.id),
    };
  }
  const wrapper = await readTemplate(db, "newsletter");
  const link = unsubscribeLink(origin, to.id);
  const rendered = renderWith(
    wrapper,
    {
      text: { subject: letter.subject, content: docToEmailText(letter.content), unsubscribeLink: link },
      html: { content: docToEmailHtml(letter.content) },
      origin,
    },
    letter.preheader,
  );
  return { to: to.email, ...rendered, headers: oneClickHeaders(origin, to.id) };
}

/* ─────────────────────────────── schemas ──────────────────────────────── */

const SubscriberQuery = z
  .object({
    q: str().max(200).optional(),
    status: z.enum(["active", "unsubscribed", "all"]).optional(),
    limit: str().optional(),
  })
  .strict();

const AddSubscribersBody = z
  .object({ emails: z.array(str().max(320)).min(1).max(2000) })
  .strict();

const NewsletterBody = z
  .object({
    subject: str().max(200).trim(),
    preheader: str().max(200).trim().default(""),
    content: z.unknown(),
    format: z.enum(NEWSLETTER_FORMATS).default("doc"),
    html: z.string().max(500_000).default(""),
    baseRevision: z.number().int().min(0),
  })
  .strict();

/** A draft to render without saving it, so a preview can follow typing. */
const PreviewBody = z
  .object({
    subject: str().max(200).default(""),
    preheader: str().max(200).default(""),
    content: z.unknown().optional(),
    format: z.enum(NEWSLETTER_FORMATS).default("doc"),
    html: z.string().max(500_000).default(""),
  })
  .strict();

const SendBody = z
  .object({
    mode: z.enum(["test", "all"]),
    baseRevision: z.number().int().min(0),
  })
  .strict();

/** RFC 4180 quoting, and a leading quote on anything a spreadsheet would run as a formula. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/gu, '""')}"`;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const BATCH = 100;

export function audienceAdminRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /* ── subscribers ── */

  routes.get("/admin/subscribers", requireAuth(), async (c) => {
    const q = readQuery(c, SubscriberQuery);
    const db = await currentDb(c);
    const filter: Record<string, unknown> = {};
    if ((q.status ?? "active") === "active") filter.unsubscribedAt = null;
    if (q.status === "unsubscribed") filter.unsubscribedAt = { $ne: null };
    if (q.q) filter.email = { $regex: q.q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") };
    const docs = await subscribers(db)
      .find(filter, { sort: { createdAt: -1 }, limit: Math.min(Math.max(Number(q.limit) || 500, 1), 1000), projection: { _id: 1, email: 1, source: 1, createdAt: 1, unsubscribedAt: 1 } })
      .toArray();
    const [active, total] = await Promise.all([
      subscribers(db).countDocuments({ unsubscribedAt: null }),
      subscribers(db).countDocuments({}),
    ]);
    return c.json({ items: docs.map(toSubscriber), active, unsubscribed: total - active });
  });

  routes.post("/admin/subscribers", requireAuth(), async (c) => {
    const { emails } = await readJson(c, AddSubscribersBody);
    const db = await currentDb(c);
    const now = Date.now();
    const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_SHAPE.test(e)))];
    let added = 0;
    for (const address of clean) {
      // Never re-subscribes a leaver: an import is not their consent.
      const res = await subscribers(db).updateOne(
        { email: address },
        { $setOnInsert: { _id: newId("sub", now), email: address, source: "console", createdAt: now, updatedAt: now, confirmedAt: null } },
        { upsert: true },
      );
      if (res.upsertedCount > 0) added += 1;
    }
    return c.json({ added, skipped: emails.length - added });
  });

  routes.post("/admin/subscribers/:id/unsubscribe", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const db = await currentDb(c);
    if (!(await subscribers(db).findOne({ _id: id }))) throw new NotFoundError(`subscriber ${id}`);
    await unsubscribe(db, id);
    auditEntityId(c, id);
    return c.json({ ok: true });
  });

  routes.get("/admin/subscribers/export", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const docs = await subscribers(db).find({ unsubscribedAt: null }, { sort: { createdAt: 1 } }).toArray();
    const rows = [
      "email,source,subscribed_at",
      ...docs.map((d) => [d.email, d.source ?? "", new Date(d.createdAt).toISOString()].map(csvCell).join(",")),
    ];
    return new Response(rows.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="subscribers.csv"',
        "cache-control": "no-store",
      },
    });
  });

  /* ── newsletters ── */

  routes.get("/admin/newsletters", requireAuth(), async (c) => {
    const docs = await newsletters(await currentDb(c)).find({}, { sort: { createdAt: -1 }, limit: 100 }).toArray();
    return c.json({ items: docs.map(toNewsletter) });
  });

  routes.post("/admin/newsletters", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const now = Date.now();
    const doc: NewsletterDoc = {
      _id: newId("nwsl", now),
      subject: "",
      preheader: "",
      content: emptyDoc(),
      format: "doc",
      html: "",
      status: "draft",
      sentAt: null,
      sentCount: 0,
      failedCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      createdByName: user.displayName,
      revision: 1,
    };
    await newsletters(db).insertOne(doc);
    auditEntityId(c, doc._id);
    return c.json({ newsletter: toNewsletter(doc) }, 201);
  });

  routes.get("/admin/newsletters/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const doc = await newsletters(await currentDb(c)).findOne({ _id: id });
    if (!doc) throw new NotFoundError(`newsletter ${id}`);
    return c.json({ newsletter: toNewsletter(doc) });
  });

  routes.put("/admin/newsletters/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, NewsletterBody);
    const content = validateDoc(body.content);
    const db = await currentDb(c);
    const after = await newsletters(db).findOneAndUpdate(
      { _id: id, revision: body.baseRevision, status: "draft" },
      {
        $set: {
          subject: body.subject,
          preheader: body.preheader,
          content,
          format: body.format,
          html: sanitizeEmailHtml(body.html),
          updatedAt: Date.now(),
        },
        $inc: { revision: 1 },
      },
      { returnDocument: "after" },
    );
    if (!after) {
      const current = await newsletters(db).findOne({ _id: id });
      if (!current) throw new NotFoundError(`newsletter ${id}`);
      if (current.status !== "draft") {
        throw new PreconditionFailedError("newsletter_sent", { detail: "This newsletter has already been sent and can no longer be edited." });
      }
      throw new StaleWriteError("newsletter", body.baseRevision, current.revision, toNewsletter(current));
    }
    return c.json({ newsletter: toNewsletter(after) });
  });

  routes.delete("/admin/newsletters/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const res = await newsletters(await currentDb(c)).deleteOne({ _id: id, status: "draft" });
    if (res.deletedCount === 0) {
      throw new PreconditionFailedError("newsletter_not_draft", { detail: "Only a draft can be deleted." });
    }
    return c.json({ ok: true });
  });

  routes.post("/admin/newsletters/:id/preview", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const db = await currentDb(c);
    if (!(await newsletters(db).findOne({ _id: id }, { projection: { _id: 1 } }))) throw new NotFoundError(`newsletter ${id}`);
    const draft = await readJson(c, PreviewBody);
    const content = draft.content === undefined ? emptyDoc() : validateDoc(draft.content);
    const email = await newsletterEmail(db, requestOrigin(c.req), { ...draft, content }, { id: "preview", email: "" });
    return c.json({ email: { subject: email.subject, html: email.html, text: email.text } });
  });

  /**
   * `test` sends one copy to the caller. `all` claims the draft (draft to
   * sending, so a double click cannot send twice), sends in batches of 100, then
   * records the counts.
   */
  routes.post("/admin/newsletters/:id/send", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, SendBody);
    const db = await currentDb(c);
    const user = currentUser(c);
    const origin = requestOrigin(c.req);
    const ctx = { requestId: c.get("requestId"), route: "POST /admin/newsletters/:id/send" };

    const doc = await newsletters(db).findOne({ _id: id });
    if (!doc) throw new NotFoundError(`newsletter ${id}`);
    if (doc.subject.trim() === "") throw new BadRequestError("Give the newsletter a subject before sending it.");
    if ((doc.format ?? "doc") === "html" && (doc.html ?? "").trim() === "") {
      throw new BadRequestError("Paste the HTML design before sending it.");
    }

    if (body.mode === "test") {
      const message = await newsletterEmail(db, origin, doc, { id: "test", email: user.email });
      const sent = await trySend(deps.mailer, { ...message, subject: `[Test] ${message.subject}` }, ctx);
      if (!sent) throw new BadRequestError("The test could not be sent. Check that mail is configured (RESEND_API_KEY and MAIL_FROM).");
      return c.json({ sent: 1, to: user.email });
    }

    deps.mailer.assertConfigured();
    const claimed = await newsletters(db).findOneAndUpdate(
      { _id: id, status: "draft", revision: body.baseRevision },
      { $set: { status: "sending", updatedAt: Date.now() }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    if (!claimed) {
      throw new PreconditionFailedError("newsletter_not_sendable", {
        detail: "This newsletter changed or was already sent. Reload it before sending.",
      });
    }

    const audience = await subscribers(db)
      .find({ unsubscribedAt: null }, { projection: { _id: 1, email: 1 } })
      .toArray();
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < audience.length; i += BATCH) {
      const chunk = audience.slice(i, i + BATCH);
      const messages = await Promise.all(chunk.map((s) => newsletterEmail(db, origin, claimed, { id: s._id, email: s.email })));
      try {
        if (deps.mailer.sendBatch) {
          await deps.mailer.sendBatch(messages);
          sent += messages.length;
        } else {
          for (const message of messages) {
            if (await trySend(deps.mailer, message, ctx)) sent += 1;
            else failed += 1;
          }
        }
      } catch (err) {
        failed += messages.length;
        console.error("[newsletter]", JSON.stringify({ id, message: err instanceof Error ? err.message : String(err) }));
      }
    }

    const after = await newsletters(db).findOneAndUpdate(
      { _id: id },
      { $set: { status: "sent", sentAt: Date.now(), sentCount: sent, failedCount: failed, updatedAt: Date.now() }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    return c.json({ newsletter: after ? toNewsletter(after) : null, sent, failed });
  });

  return routes;
}

/** One-click unsubscribe, from the email link or a mail client's List-Unsubscribe button. */
export function unsubscribePublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.post("/public/unsubscribe", async (c) => {
    const s = c.req.query("s") ?? "";
    const t = c.req.query("t") ?? "";
    // Same answer for a bad token and an unknown id, so the route reveals nothing.
    if (s === "" || t.length !== 64 || unsubscribeToken(s) !== t) {
      throw new BadRequestError("This unsubscribe link is not valid.");
    }
    await unsubscribe(await currentDb(c), s);
    return c.json({ ok: true });
  });
  return routes;
}
