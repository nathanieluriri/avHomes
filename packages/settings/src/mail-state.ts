import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  NotFoundError,
  StaleWriteError,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  str,
  type AppEnv,
} from "@avhomes/core";
import type { MailDensity, MailDraft, MailPrefs, MailStateResponse, MailViewState } from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";

/**
 * Where each member left the Mailboxes page, and their unsent drafts.
 *
 * Every route reads and writes only the caller's own rows. Prefs are last
 * write wins; a draft carries a revision so two devices cannot overwrite each
 * other unseen. Not audited (see UNAUDITED in audit): autosave is not an
 * operational change.
 */

interface PrefsDoc {
  _id: string;
  view?: MailViewState | null;
  density?: MailDensity;
  recentTo?: string[];
  createdAt: number;
  updatedAt: number;
}

interface DraftDoc {
  _id: string;
  userId: string;
  mailbox: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  mode: "text" | "html";
  inReplyTo: { uid: number; folder: string } | null;
  forwardOf: { uid: number; folder: string } | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

const MAX_DRAFTS = 50;

function prefsRows(db: Db) {
  return collection<PrefsDoc>(db, COLLECTIONS.mailPrefs);
}

function draftRows(db: Db) {
  return collection<DraftDoc>(db, COLLECTIONS.mailDrafts);
}

/* Rows written before a field existed read as its default, here and nowhere else. */
function toPrefs(doc: PrefsDoc | null): MailPrefs {
  return {
    view: doc?.view ?? null,
    density: doc?.density ?? "comfortable",
    recentTo: doc?.recentTo ?? [],
    updatedAt: doc?.updatedAt ?? 0,
  };
}

function toDraft(doc: DraftDoc): MailDraft {
  return {
    id: doc._id,
    mailbox: doc.mailbox,
    to: doc.to ?? [],
    cc: doc.cc ?? [],
    bcc: doc.bcc ?? [],
    subject: doc.subject ?? "",
    text: doc.text ?? "",
    html: doc.html ?? "",
    mode: doc.mode ?? "text",
    inReplyTo: doc.inReplyTo ?? null,
    forwardOf: doc.forwardOf ?? null,
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Called by the send route once a draft has gone out. */
export async function dropDraft(db: Db, userId: string, id: string): Promise<void> {
  await draftRows(db).deleteOne({ _id: id, userId });
}

/* ─────────────────────────────── bodies ──────────────────────────────── */

const DraftId = str().regex(/^mdrf_[A-Za-z0-9]{8,40}$/u, "draft id");
const day = () => str().regex(/^\d{4}-\d{2}-\d{2}$/u, "date");
function draftId(c: Parameters<typeof pathParam>[0]): string {
  const parsed = DraftId.safeParse(pathParam(c, "id"));
  if (!parsed.success) throw new NotFoundError("draft");
  return parsed.data;
}

const Ref = z.object({ uid: z.number().int().min(1), folder: str().min(1).max(200) }).strict();

const ViewBody = z
  .object({
    mailbox: str().max(80),
    folder: str().max(200),
    search: str().max(200),
    filters: z
      .object({
        from: str().trim().max(320).optional(),
        to: str().trim().max(320).optional(),
        subject: str().trim().max(200).optional(),
        since: day().optional(),
        before: day().optional(),
        attachment: z.literal("1").optional(),
      })
      .strict(),
    preset: str().max(20).nullable(),
    page: z.number().int().min(1).max(10_000),
    open: Ref.nullable(),
    compose: z
      .array(z.object({ id: DraftId, minimized: z.boolean(), expanded: z.boolean() }).strict())
      .max(4),
  })
  .strict();

const PrefsBody = z
  .object({
    view: ViewBody.nullable().optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
    recentTo: z.array(str().trim().max(320)).max(12).optional(),
  })
  .strict();

/* Addresses are checked for shape at send time, not here: a draft may hold a half-typed one. */
const Recipient = str().trim().max(320);

const DraftBody = z
  .object({
    baseRevision: z.number().int().min(1).nullable(),
    mailbox: str().min(1).max(80),
    to: z.array(Recipient).max(50),
    cc: z.array(Recipient).max(50),
    bcc: z.array(Recipient).max(50),
    subject: str().max(500),
    /* Newlines belong in a body, and `str()` refuses control characters. */
    text: z.string().max(200_000).refine((v) => !v.includes("\u0000"), "control-character"),
    html: z.string().max(500_000).refine((v) => !v.includes("\u0000"), "control-character"),
    mode: z.enum(["text", "html"]),
    inReplyTo: Ref.nullable(),
    forwardOf: Ref.nullable(),
  })
  .strict();

/* ─────────────────────────────── routes ──────────────────────────────── */

export function mailStateRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/mail/state", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const [prefs, drafts] = await Promise.all([
      prefsRows(db).findOne({ _id: user.id }),
      draftRows(db).find({ userId: user.id }).sort({ updatedAt: -1 }).limit(MAX_DRAFTS).toArray(),
    ]);
    const body: MailStateResponse = { prefs: toPrefs(prefs), drafts: drafts.map(toDraft) };
    return c.json(body);
  });

  routes.patch("/admin/mail/state", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, PrefsBody);
    const now = Date.now();
    const set: Partial<PrefsDoc> = { updatedAt: now };
    if (body.view !== undefined) set.view = body.view;
    if (body.density !== undefined) set.density = body.density;
    if (body.recentTo !== undefined) {
      set.recentTo = [...new Set(body.recentTo.map((a) => a.toLowerCase()).filter((a) => a !== ""))].slice(0, 8);
    }
    const doc = await prefsRows(db).findOneAndUpdate(
      { _id: user.id },
      { $set: set, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    return c.json({ prefs: toPrefs(doc) });
  });

  routes.get("/admin/mail/drafts", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const drafts = await draftRows(db).find({ userId: user.id }).sort({ updatedAt: -1 }).limit(MAX_DRAFTS).toArray();
    return c.json({ drafts: drafts.map(toDraft) });
  });

  /*
   * Create with `baseRevision: null`, update with the revision it was read at.
   * A draft that is gone (sent or discarded elsewhere) is a 404 rather than
   * quietly recreated, so the other device learns it.
   */
  routes.put("/admin/mail/drafts/:id", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = draftId(c);
    const { baseRevision, ...fields } = await readJson(c, DraftBody);
    const now = Date.now();
    const rows = draftRows(db);
    const existing = await rows.findOne({ _id: id });

    if (existing && existing.userId !== user.id) throw new NotFoundError("draft");
    if (!existing) {
      if (baseRevision !== null) throw new NotFoundError("draft");
      if ((await rows.countDocuments({ userId: user.id })) >= MAX_DRAFTS) {
        throw new BadRequestError(`You have ${MAX_DRAFTS} drafts. Send or discard one first.`);
      }
      const doc: DraftDoc = { _id: id, userId: user.id, ...fields, revision: 1, createdAt: now, updatedAt: now };
      try {
        await rows.insertOne(doc);
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
        const raced = await rows.findOne({ _id: id, userId: user.id });
        if (!raced) throw new NotFoundError("draft");
        throw new StaleWriteError("draft", 0, raced.revision, toDraft(raced));
      }
      return c.json({ draft: toDraft(doc) });
    }

    if (baseRevision !== existing.revision) {
      throw new StaleWriteError("draft", baseRevision ?? 0, existing.revision, toDraft(existing));
    }
    const updated = await rows.findOneAndUpdate(
      { _id: id, userId: user.id, revision: existing.revision },
      { $set: { ...fields, updatedAt: now }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    if (!updated) {
      const current = await rows.findOne({ _id: id, userId: user.id });
      if (!current) throw new NotFoundError("draft");
      throw new StaleWriteError("draft", existing.revision, current.revision, toDraft(current));
    }
    return c.json({ draft: toDraft(updated) });
  });

  routes.delete("/admin/mail/drafts/:id", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    await dropDraft(db, user.id, draftId(c));
    return c.json({ ok: true });
  });

  return routes;
}
