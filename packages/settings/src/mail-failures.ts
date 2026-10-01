import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { currentDb, newId, readJsonOrEmpty, type AppEnv, type Mailer, type MailMessage } from "@avhomes/core";
import type { MailFailure, MailFailuresResponse } from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";

/**
 * Every email the site tried to send and could not, written down.
 *
 * Until this existed a refused send was one console.error line in a Vercel log
 * nobody reads, and the first anybody heard of it was a marketer saying their
 * sign-in code never came. Now each one is a row the console lists under
 * Email delivery, raises as an alert, and announces to the owner.
 *
 * Recipient, subject and the provider's reason only. Never the body.
 */

interface FailureDoc {
  _id: string;
  to: string;
  subject: string;
  reason: string;
  at: number;
  expiresAtDate: Date;
}

interface ClearedDoc {
  _id: string;
  clearedAt: number;
}

const KEPT_MS = 90 * 24 * 60 * 60 * 1000;
const CLEARED_ID = "mail-failures";

function rows(db: Db) {
  return collection<FailureDoc>(db, COLLECTIONS.mailFailures);
}

function toFailure(doc: FailureDoc): MailFailure {
  return { id: doc._id, to: doc.to, subject: doc.subject, reason: doc.reason, at: doc.at };
}

/** Told about each batch of failures once it is written, e.g. to notify the owner. */
export type MailFailureHook = (db: Db, failures: MailFailure[]) => Promise<void>;

async function record(
  resolveDb: () => Promise<Db>,
  messages: MailMessage[],
  err: unknown,
  onFailure: MailFailureHook | undefined,
): Promise<void> {
  try {
    const db = await resolveDb();
    const now = Date.now();
    const reason = (err instanceof Error ? err.message : String(err)).replace(/\s+/gu, " ").slice(0, 300);
    const docs: FailureDoc[] = messages.map((message, i) => ({
      _id: newId("mlf", now + i),
      to: message.to.slice(0, 320),
      subject: message.subject.slice(0, 300),
      reason,
      at: now,
      expiresAtDate: new Date(now + KEPT_MS),
    }));
    if (docs.length === 0) return;
    await rows(db).insertMany(docs);
    await onFailure?.(db, docs.map(toFailure));
  } catch (recordErr) {
    // The send's own error is what the caller sees. This one is only logged.
    console.error(
      "[mail]",
      JSON.stringify({ recording: true, message: recordErr instanceof Error ? recordErr.message : String(recordErr) }),
    );
  }
}

/**
 * The transport, with every refused send written down before the error goes on
 * up exactly as it came. Callers keep their own "never fatal" handling.
 */
export function recordingMailer(inner: Mailer, resolveDb: () => Promise<Db>, onFailure?: MailFailureHook): Mailer {
  return {
    assertConfigured: () => inner.assertConfigured(),
    async send(message) {
      try {
        await inner.send(message);
      } catch (err) {
        await record(resolveDb, [message], err, onFailure);
        throw err;
      }
    },
    ...(inner.sendBatch
      ? {
          async sendBatch(messages: MailMessage[]) {
            try {
              await inner.sendBatch?.(messages);
            } catch (err) {
              await record(resolveDb, messages, err, onFailure);
              throw err;
            }
          },
        }
      : {}),
  };
}

async function clearedAt(db: Db): Promise<number> {
  const doc = await collection<ClearedDoc>(db, COLLECTIONS.settings).findOne({ _id: CLEARED_ID });
  return doc?.clearedAt ?? 0;
}

/** Failures since the owner last cleared the list. The health alert reads this. */
export async function openMailFailures(db: Db): Promise<{ count: number; lastAt: number }> {
  const since = await clearedAt(db);
  const [count, last] = await Promise.all([
    rows(db).countDocuments({ at: { $gt: since } }),
    rows(db).findOne({ at: { $gt: since } }, { sort: { at: -1 }, projection: { at: 1 } }),
  ]);
  return { count, lastAt: last?.at ?? 0 };
}

export function mailFailureRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /* Owner and developer: `/api/admin/mail` falls to the gate's `danger` catch-all. */
  routes.get("/admin/mail/failures", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const [docs, open, cleared] = await Promise.all([
      rows(db).find({}, { sort: { at: -1 }, limit: 50 }).toArray(),
      openMailFailures(db),
      clearedAt(db),
    ]);
    const out: MailFailuresResponse = { items: docs.map(toFailure), open: open.count, clearedAt: cleared };
    return c.json(out);
  });

  /* Marks everything so far as seen. The rows stay, so the list still says what happened. */
  routes.post("/admin/mail/failures/clear", requireAdmin(), async (c) => {
    await readJsonOrEmpty(c, z.object({}).strict());
    const db = await currentDb(c);
    await collection<ClearedDoc>(db, COLLECTIONS.settings).updateOne(
      { _id: CLEARED_ID },
      { $set: { clearedAt: Date.now() } },
      { upsert: true },
    );
    return c.json({ ok: true });
  });

  return routes;
}
