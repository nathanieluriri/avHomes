import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  NotFoundError,
  StaleWriteError,
  auditEntityId,
  clampLimit,
  currentDb,
  currentUser,
  keysetFilter,
  keysetSort,
  newId,
  pathParam,
  readJson,
  readQuery,
  str,
  takePage,
  type AppEnv,
  type SortSpec,
} from "@avhomes/core";
import {
  MARK_KINDS,
  NOTE_KINDS,
  NOTE_STATUSES,
  type DesignNote,
  type NoteAttachment,
  type NoteEvent,
  type NoteKind,
  type NoteMark,
  type NoteStatus,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";

/**
 * @avhomes/feedback
 *
 * The customize studio's store: notes somebody drew on a picture of the site,
 * and the trail of what happened to each one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A SCREENSHOT AND NOT A SELECTOR.
 *
 * The obvious design pins a note to a CSS selector plus a scroll offset and
 * re-renders the live page underneath it. It is tempting because the note then
 * follows the element through a copy change. It is also the design that fails
 * silently: the day a section is rebuilt, the selector matches nothing and the
 * note is a comment floating over an unrelated part of a page, with no way to
 * tell that it moved. A stale picture is legible. A misplaced marker is worse
 * than no marker.
 *
 * So a note owns a PNG, and the marks are stored NORMALISED against it. The
 * picture is the record of what was being talked about, and it cannot rot.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The shot itself is an ordinary uploaded image. The studio posts the capture to
 * the existing media route, which sniffs its magic bytes like any other upload,
 * and stores the returned URL here. That is deliberate reuse: a second, private
 * image path for screenshots would be a second place to get storage, limits and
 * serving wrong.
 */

interface NoteDoc {
  _id: string;
  path: string;
  kind: NoteKind;
  comment: string;
  copyBefore: string | null;
  copyAfter: string | null;
  shotUrl: string;
  shotWidth: number;
  shotHeight: number;
  marks: NoteMark[];
  attachments: NoteAttachment[];
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  createdByName: string;
  events: NoteEvent[];
  revision: number;
}

const SORT: SortSpec = { field: "createdAt", direction: -1 };
const SORT_NAME = "newest";

function notes(db: Db) {
  return collection<NoteDoc>(db, COLLECTIONS.designNotes);
}

function toNote(doc: NoteDoc): DesignNote {
  return {
    id: doc._id,
    path: doc.path,
    kind: doc.kind,
    comment: doc.comment,
    copyBefore: doc.copyBefore ?? null,
    copyAfter: doc.copyAfter ?? null,
    shotUrl: doc.shotUrl,
    shotWidth: doc.shotWidth,
    shotHeight: doc.shotHeight,
    marks: doc.marks ?? [],
    attachments: doc.attachments ?? [],
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
    createdByName: doc.createdByName,
    events: doc.events ?? [],
    revision: doc.revision,
  };
}

/*
 * A point is a finite number in 0..1 and nothing else.
 *
 * `z.number()` alone admits NaN and Infinity, both of which survive JSON.parse
 * from a hand-rolled body and both of which turn an SVG path into the string
 * "MNaN,NaN", which renders as nothing at all. A note whose marks silently do
 * not draw is indistinguishable from a note somebody forgot to draw on.
 */
const unit = () => z.number().finite().min(0).max(1);

const MarkSchema = z
  .object({
    kind: z.enum(MARK_KINDS),
    color: str().max(24),
    /*
     * Capped at 2000 numbers, which is 1000 points. A pen stroke is sampled per
     * pointer event, so a long slow drag across a large screen is genuinely a
     * few hundred; the ceiling is here because this array arrives from a browser
     * and an uncapped one is an unbounded document.
     */
    points: z.array(unit()).min(2).max(2000),
  })
  .strict();

const AttachmentSchema = z
  .object({
    kind: z.enum(["image", "link"]),
    url: str().min(1).max(2000),
    label: str().max(200),
  })
  .strict();

const CreateBody = z
  .object({
    path: str().min(1).max(600),
    kind: z.enum(NOTE_KINDS),
    comment: str().min(1).max(4000).trim(),
    copyBefore: str().max(4000).nullable().optional(),
    copyAfter: str().max(4000).nullable().optional(),
    shotUrl: str().min(1).max(2000),
    shotWidth: z.number().int().min(1).max(20000),
    shotHeight: z.number().int().min(1).max(20000),
    marks: z.array(MarkSchema).max(200).default([]),
    attachments: z.array(AttachmentSchema).max(20).default([]),
  })
  .strict();

const ListQuery = z
  .object({
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(NOTE_STATUSES).optional(),
    path: str().max(600).optional(),
  })
  .strict();

const UpdateBody = z
  .object({
    status: z.enum(NOTE_STATUSES).optional(),
    /** A reply on the thread. Appended, never replacing the original comment. */
    reply: str().min(1).max(4000).trim().optional(),
    baseRevision: z.number().int().min(0),
  })
  .strict();

/**
 * Every surface here is behind `requireAuth`, and none of it is public.
 *
 * These notes are somebody saying what is wrong with the site, over pictures of
 * pages that may include unpublished drafts. That is internal by construction,
 * so there is deliberately no public read and no share link: adding one later is
 * a decision to make on purpose, not a default to inherit.
 */
export function feedbackRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/notes", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const q = readQuery(c, ListQuery);
    const size = clampLimit(q.limit);

    const and: Record<string, unknown>[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.path) and.push({ path: q.path });
    const keyset = keysetFilter<NoteDoc>(SORT, q.cursor, SORT_NAME);
    if (Object.keys(keyset).length > 0) and.push(keyset);

    const docs = await notes(db)
      .find(and.length === 0 ? {} : { $and: and }, { sort: keysetSort(SORT), limit: size + 1 })
      .toArray();

    const { items, nextCursor } = takePage(docs, size, SORT, SORT_NAME);
    return c.json({ items: items.map(toNote), nextCursor });
  });

  routes.get("/admin/notes/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const doc = await notes(db).findOne({ _id: pathParam(c, "id") });
    if (!doc) throw new NotFoundError(`note ${pathParam(c, "id")}`);
    return c.json({ note: toNote(doc) });
  });

  routes.post("/admin/notes", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, CreateBody);
    const user = currentUser(c);
    const now = Date.now();

    const doc: NoteDoc = {
      _id: newId("note", now),
      path: body.path,
      kind: body.kind,
      comment: body.comment,
      copyBefore: body.copyBefore ?? null,
      copyAfter: body.copyAfter ?? null,
      shotUrl: body.shotUrl,
      shotWidth: body.shotWidth,
      shotHeight: body.shotHeight,
      marks: body.marks,
      attachments: body.attachments,
      status: "open",
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      createdByName: user.displayName,
      events: [],
      revision: 1,
    };
    await notes(db).insertOne(doc);
    auditEntityId(c, doc._id);
    return c.json({ note: toNote(doc) }, 201);
  });

  /**
   * Status moves and replies come through ONE route, and both land in `events`.
   *
   * That is what makes the trail readable: "moved to In progress" and "waiting
   * on the copy from marketing" are the same kind of fact about what happened to
   * this note, and splitting them across two endpoints produces two half-stories
   * that a reader has to interleave by timestamp themselves.
   */
  routes.patch("/admin/notes/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, UpdateBody);
    const user = currentUser(c);
    const now = Date.now();

    const events: NoteEvent[] = [];
    const set: Partial<NoteDoc> = { updatedAt: now };

    if (body.status !== undefined) {
      set.status = body.status;
      events.push({
        id: newId("note", now),
        at: now,
        byName: user.displayName,
        kind: "status",
        text: body.status,
      });
    }
    if (body.reply !== undefined) {
      events.push({
        id: newId("note", now + 1),
        at: now,
        byName: user.displayName,
        kind: "comment",
        text: body.reply,
      });
    }
    if (events.length === 0) {
      // An empty patch is the state the caller asked for. Answer with it.
      const current = await notes(db).findOne({ _id: id });
      if (!current) throw new NotFoundError(`note ${id}`);
      return c.json({ note: toNote(current) });
    }

    const after = await notes(db).findOneAndUpdate(
      { _id: id, revision: body.baseRevision },
      { $set: set, $push: { events: { $each: events } }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    if (!after) {
      const current = await notes(db).findOne({ _id: id });
      if (!current) throw new NotFoundError(`note ${id}`);
      throw new StaleWriteError("note", body.baseRevision, current.revision, toNote(current));
    }
    return c.json({ note: toNote(after) });
  });

  /**
   * A HARD delete, unlike every other record in this system.
   *
   * Listings and posts are soft deleted because something else references them
   * and because "we published that once" is a fact worth keeping. A note is
   * scaffolding: it exists to get one change made, and a studio that accumulates
   * a permanent archive of every mistaken circle somebody drew is a studio
   * nobody opens twice. The screenshot behind it stays in the image library,
   * where it can be cleaned up on its own terms.
   */
  routes.delete("/admin/notes/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const res = await notes(db).deleteOne({ _id: pathParam(c, "id") });
    if (res.deletedCount === 0) throw new NotFoundError(`note ${pathParam(c, "id")}`);
    return c.body(null, 204);
  });

  return routes;
}

/** Open counts by page, so the studio can badge a page before opening it. */
export async function noteCounts(db: Db): Promise<Record<NoteStatus, number>> {
  const rows = await notes(db)
    .aggregate<{ _id: NoteStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  const out: Record<NoteStatus, number> = { open: 0, "in-progress": 0, done: 0, declined: 0 };
  for (const row of rows) if (row._id in out) out[row._id] = row.count;
  return out;
}
