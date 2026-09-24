import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  currentDb,
  currentUser,
  deploymentOrigin,
  newId,
  pathParam,
  readJsonOrEmpty,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import type { AppNotification, NotificationInput, NotificationKind } from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";

/**
 * The developer's inbox: storage requests from the owner and activity on
 * customize studio notes.
 *
 * Rows are fanned out per recipient at write time, so read state is per person
 * and every route here touches only the caller's own rows (see `RULES` in identity).
 */

interface NotificationDoc {
  _id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  subjectId: string | null;
  actorName: string;
  createdAt: number;
  readAt: number | null;
}

interface RecipientDoc {
  _id: string;
  email: string;
  role: string;
  disabledAt: number | null;
}

function rows(db: Db) {
  return collection<NotificationDoc>(db, COLLECTIONS.notifications);
}

function toNotification(doc: NotificationDoc): AppNotification {
  return {
    id: doc._id,
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    href: doc.href,
    subjectId: doc.subjectId,
    actorName: doc.actorName,
    createdAt: doc.createdAt,
    readAt: doc.readAt,
  };
}

/**
 * Stores one row per active developer (never the actor) and emails each one.
 *
 * Never throws: a notification that fails must not undo the request that caused it.
 */
export function developerNotifier(mailer: Mailer) {
  return async (db: Db, input: NotificationInput): Promise<void> => {
    try {
      const recipients = await collection<RecipientDoc>(db, COLLECTIONS.users)
        .find(
          { role: "developer", disabledAt: null, _id: { $ne: input.actorId } },
          { projection: { _id: 1, email: 1, role: 1, disabledAt: 1 } },
        )
        .toArray();
      if (recipients.length === 0) return;

      const now = Date.now();
      await rows(db).insertMany(
        recipients.map((user, i) => ({
          _id: newId("ntf", now + i),
          userId: user._id,
          kind: input.kind,
          title: input.title.slice(0, 300),
          body: input.body.slice(0, 2000),
          href: input.href,
          subjectId: input.subjectId ?? null,
          actorName: input.actorName,
          createdAt: now,
          readAt: null,
        })),
      );

      try {
        await mailer.assertConfigured();
      } catch {
        return;
      }
      const link = `${deploymentOrigin({ url: "" })}${input.href}`;
      await Promise.allSettled(
        recipients.map((user) =>
          mailer.send({
            to: user.email,
            subject: input.title,
            text: `${input.body}\n\nOpen it: ${link}`,
          }),
        ),
      );
    } catch (err) {
      console.error(
        "[notify]",
        JSON.stringify({ kind: input.kind, message: err instanceof Error ? err.message : String(err) }),
      );
    }
  };
}

const EmptyBody = z.object({}).strict();

export function notificationsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/notifications", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const docs = await rows(db)
      .find({ userId: user.id }, { sort: { createdAt: -1 }, limit: 100 })
      .toArray();
    const unread = await rows(db).countDocuments({ userId: user.id, readAt: null });
    return c.json({ items: docs.map(toNotification), unread });
  });

  routes.post("/admin/notifications/read-all", requireAuth(), async (c) => {
    await readJsonOrEmpty(c, EmptyBody);
    const db = await currentDb(c);
    const user = currentUser(c);
    await rows(db).updateMany({ userId: user.id, readAt: null }, { $set: { readAt: Date.now() } });
    return c.json({ ok: true });
  });

  routes.post("/admin/notifications/:id/read", requireAuth(), async (c) => {
    await readJsonOrEmpty(c, EmptyBody);
    const db = await currentDb(c);
    const user = currentUser(c);
    await rows(db).updateOne(
      { _id: pathParam(c, "id"), userId: user.id, readAt: null },
      { $set: { readAt: Date.now() } },
    );
    return c.json({ ok: true });
  });

  return routes;
}
