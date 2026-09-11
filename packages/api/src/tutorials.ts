import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  NotFoundError,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  readJsonOrEmpty,
  type AppEnv,
} from "@avhomes/core";
import { requireAuth } from "@avhomes/identity";
import { isTutorialId, type TutorialId, type TutorialProgress, type TutorialProgressList } from "@avhomes/contracts";

/**
 * A member's own tutorial progress, and whether they dismissed the dashboard's
 * suggestion to start.
 *
 * Here rather than in a feature package because it belongs to no domain: every
 * role has tutorials. Each route reads and writes only the caller's rows, which
 * is why the gate lets any signed-in member through (see `RULES` in identity).
 * For the same reason none of it reaches the audit trail (see `UNAUDITED` in audit).
 */

type Subject = TutorialId | "nudge";
type Stamp = "watchedAt" | "completedAt" | "dismissedAt";

interface ProgressDoc {
  _id: string;
  userId: string;
  subject: Subject;
  watchedAt?: number | null;
  completedAt?: number | null;
  dismissedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

const STAMPS: Record<"tutorial" | "nudge", readonly Stamp[]> = {
  tutorial: ["watchedAt", "completedAt"],
  nudge: ["dismissedAt"],
};

const NudgeBody = z.object({}).strict();

const ProgressBody = z
  .object({
    watched: z.literal(true).optional(),
    completed: z.literal(true).optional(),
  })
  .strict();

function rows(db: Db) {
  return collection<ProgressDoc>(db, COLLECTIONS.tutorialProgress);
}

function toProgress(tutorialId: string, doc: ProgressDoc | null): TutorialProgress {
  return { tutorialId, watchedAt: doc?.watchedAt ?? null, completedAt: doc?.completedAt ?? null };
}

/**
 * Upserts the row, setting each requested timestamp only if it is still empty.
 *
 * A pipeline update, so "set once" is decided by the server in the same write
 * rather than by a read that a second tab can race. `updatedAt` moves only when
 * a timestamp was actually filled, so a repeated PUT changes nothing.
 */
async function stamp(db: Db, userId: string, subject: Subject, wanted: readonly Stamp[]): Promise<ProgressDoc> {
  const now = Date.now();
  // Every expression in one `$set` stage reads the document as it was before the stage.
  const fills = wanted.map((field) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] }));
  const set: Record<string, unknown> = {
    userId: { $literal: userId },
    subject: { $literal: subject },
    createdAt: { $ifNull: ["$createdAt", now] },
    updatedAt: { $cond: [{ $or: fills }, now, { $ifNull: ["$updatedAt", now] }] },
  };
  for (const field of STAMPS[subject === "nudge" ? "nudge" : "tutorial"]) {
    set[field] = { $ifNull: [`$${field}`, wanted.includes(field) ? now : null] };
  }

  const write = () =>
    rows(db).findOneAndUpdate({ _id: `${userId}:${subject}` }, [{ $set: set }], {
      upsert: true,
      returnDocument: "after",
    });

  let doc: ProgressDoc | null;
  try {
    doc = await write();
  } catch (err) {
    // Two first writes racing on one key: the loser retries as an update.
    if ((err as { code?: number }).code !== 11000) throw err;
    doc = await write();
  }
  if (!doc) throw new Error(`tutorial progress upsert returned nothing for ${subject}`);
  return doc;
}

export function tutorialsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/tutorials/progress", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const docs = await rows(db).find({ userId: user.id }).toArray();

    const body: TutorialProgressList = {
      // A row for a tutorial since withdrawn from the allowlist is kept but not offered.
      items: docs.filter((doc) => isTutorialId(doc.subject)).map((doc) => toProgress(doc.subject, doc)),
      nudgeDismissedAt: docs.find((doc) => doc.subject === "nudge")?.dismissedAt ?? null,
    };
    return c.json(body);
  });

  routes.put("/admin/tutorials/progress/:tutorialId", requireAuth(), async (c) => {
    const tutorialId = pathParam(c, "tutorialId");
    if (!isTutorialId(tutorialId)) throw new NotFoundError(`tutorial ${tutorialId}`);
    const body = await readJson(c, ProgressBody);
    const db = await currentDb(c);
    const user = currentUser(c);

    const wanted: Stamp[] = [];
    if (body.watched) wanted.push("watchedAt");
    if (body.completed) wanted.push("completedAt");

    // An empty body asks for the current state, and must not create a row to answer it.
    const doc =
      wanted.length === 0
        ? await rows(db).findOne({ _id: `${user.id}:${tutorialId}` })
        : await stamp(db, user.id, tutorialId, wanted);
    return c.json({ item: toProgress(tutorialId, doc) });
  });

  routes.put("/admin/tutorials/nudge", requireAuth(), async (c) => {
    await readJsonOrEmpty(c, NudgeBody);
    const db = await currentDb(c);
    const user = currentUser(c);
    const doc = await stamp(db, user.id, "nudge", ["dismissedAt"]);
    return c.json({ nudgeDismissedAt: doc.dismissedAt ?? Date.now() });
  });

  return routes;
}
