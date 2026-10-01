import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  HostingerError,
  NotFoundError,
  UnauthenticatedError,
  currentDb,
  hostingerAccount,
  hostingerPage,
  hostingerRequest,
  openSecret,
  pathParam,
  readJsonOrEmpty,
  requestOrigin,
  sealSecret,
  type AppEnv,
} from "@avhomes/core";
import { SIGN_IN_CODE_MARKER, type MailWatchView } from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";
import { hostingerKey } from "./mail";

/**
 * New mail, announced the moment it lands.
 *
 * Hostinger calls a webhook on `message.received`. One webhook per mailbox,
 * pointed at `/api/hooks/mail/<mailbox>`, carrying a secret Hostinger hands
 * over once and sends back as a bearer token on every call. The secret is
 * sealed here like the API key.
 *
 * The hook does not trust or even read Hostinger's payload for content. It
 * takes the call as "something arrived in this mailbox", then reads the inbox
 * itself and announces whatever is newer than the last message it announced.
 * So a retried, reordered or reshaped delivery cannot announce a message twice
 * or announce one that is not there.
 *
 * Switched on by itself: the first time an owner or developer turns on
 * notifications in the console, from the live site. Nothing to set up.
 */

const DOC_ID = "mail-watch";
const enc = encodeURIComponent;
/** How long a check that the webhooks still exist is trusted before Hostinger is asked again. */
const RECHECK_MS = 6 * 60 * 60 * 1000;
/** With no message announced yet, only mail this recent counts as new. */
const FIRST_RUN_MS = 10 * 60 * 1000;

interface HookRow {
  mailboxId: string;
  address: string;
  webhookId: string;
  /** `sealSecret` output. */
  secret: string;
}

interface WatchDoc {
  _id: string;
  url: string;
  hooks: HookRow[];
  /** Per mailbox, the newest inbox uid already announced. */
  highWater: Record<string, number>;
  checkedAt: number;
  lastEventAt: number;
  updatedAt: number;
}

interface RawMessage {
  uid: number;
  date: string;
  unseen?: boolean;
  flags?: string[];
  subject?: string | null;
  from?: { name?: string | null; address?: string | null } | null;
}

interface RawWebhook {
  id: string;
  url: string;
}

export interface NewMail {
  mailboxId: string;
  address: string;
  messages: { uid: number; fromName: string; fromAddress: string; subject: string }[];
}

function rows(db: Db) {
  return collection<WatchDoc>(db, COLLECTIONS.settings);
}

function hookPath(mailboxId: string): string {
  return `/api/hooks/mail/${enc(mailboxId)}`;
}

/**
 * Only the live site registers. A preview sits behind Vercel's login and a
 * laptop is unreachable, and both share the production mailbox, so either one
 * registering would point the real mailbox's webhook somewhere that never answers.
 */
function canRegister(origin: string): boolean {
  return process.env.VERCEL_ENV === "production" && origin.startsWith("https://");
}

async function readDoc(db: Db): Promise<WatchDoc | null> {
  return rows(db).findOne({ _id: DOC_ID });
}

export async function readMailWatch(db: Db): Promise<MailWatchView> {
  const [doc, key] = await Promise.all([readDoc(db), hostingerKey(db)]);
  if (!key) return { state: "no-key", mailboxes: [], updatedAt: doc?.updatedAt ?? 0 };
  const hooks = doc?.hooks ?? [];
  return {
    state: hooks.length > 0 ? "on" : process.env.VERCEL_ENV === "production" ? "off" : "not-production",
    mailboxes: hooks.map((hook) => ({ address: hook.address, watching: true })),
    updatedAt: doc?.updatedAt ?? 0,
  };
}

/**
 * Makes sure every mailbox the key reaches has a live webhook pointing here.
 *
 * Cheap to call often: within six hours of the last check, from the same
 * origin, it reads one settings row and returns.
 */
export async function ensureMailWatch(db: Db, origin: string, force = false): Promise<MailWatchView> {
  const key = await hostingerKey(db);
  if (!key) return readMailWatch(db);
  if (!canRegister(origin)) return readMailWatch(db);

  const doc = await readDoc(db);
  const now = Date.now();
  if (!force && doc && doc.url === origin && now - doc.checkedAt < RECHECK_MS && doc.hooks.length > 0) {
    return readMailWatch(db);
  }

  const account = await hostingerAccount(key);
  const kept: HookRow[] = [];
  for (const mailbox of account.mailboxes) {
    const url = `${origin}${hookPath(mailbox.resourceId)}`;
    const base = `/mailboxes/${enc(mailbox.resourceId)}/webhooks`;
    try {
      const existing = await hostingerPage<RawWebhook>(key, base, { perPage: 100 });
      const ours = existing.data.filter((hook) => hook.url.includes("/api/hooks/mail/"));
      const saved = doc?.hooks.find((hook) => hook.mailboxId === mailbox.resourceId);
      const still = saved && saved.webhookId && ours.find((hook) => hook.id === saved.webhookId && hook.url === url);

      // Anything of ours that is not the one being kept goes, so old origins and retries never stack up.
      for (const hook of ours) {
        if (still && hook.id === still.id) continue;
        await hostingerRequest(key, "DELETE", `${base}/${enc(hook.id)}`).catch(() => null);
      }

      if (saved && still) {
        kept.push(saved);
        continue;
      }
      const made = await hostingerRequest<{ id: string; secret: string }>(key, "POST", base, {
        body: {
          name: "AV Homes console",
          description: "Tells the console a new email arrived, so it can notify the team.",
          events: ["message.received"],
          url,
          status: "active",
        },
      });
      if (!made?.id || !made.secret) continue;
      kept.push({ mailboxId: mailbox.resourceId, address: mailbox.address, webhookId: made.id, secret: sealSecret(made.secret) });
    } catch (err) {
      console.error(
        "[mail-watch]",
        JSON.stringify({ mailbox: mailbox.address, message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  await rows(db).updateOne(
    { _id: DOC_ID },
    {
      $set: { url: origin, hooks: kept, checkedAt: now, updatedAt: now },
      $setOnInsert: { highWater: {}, lastEventAt: 0 },
    },
    { upsert: true },
  );
  return readMailWatch(db);
}

/** Removes every webhook this site made. Mail still arrives; the console just stops being told. */
async function stopMailWatch(db: Db): Promise<void> {
  const key = await hostingerKey(db);
  const doc = await readDoc(db);
  if (key && doc) {
    for (const hook of doc.hooks) {
      await hostingerRequest(key, "DELETE", `/mailboxes/${enc(hook.mailboxId)}/webhooks/${enc(hook.webhookId)}`).catch(
        () => null,
      );
    }
  }
  await rows(db).updateOne({ _id: DOC_ID }, { $set: { hooks: [], updatedAt: Date.now() } });
}

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isSignInCode(subject: string | null | undefined): boolean {
  return (subject ?? "").toLowerCase().includes(SIGN_IN_CODE_MARKER);
}

export interface MailWatchDeps {
  onNewMail: (db: Db, mail: NewMail) => Promise<void>;
}

/**
 * The webhook itself. A machine callback: it reads no cookie and carries its
 * own authority, the bearer secret, which is why it is mounted above the
 * session middleware.
 */
export function mailHookRoutes(deps: MailWatchDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/hooks/mail/:mailbox", async (c) => {
    const db = await currentDb(c);
    const mailboxId = pathParam(c, "mailbox");
    const doc = await readDoc(db);
    const hook = doc?.hooks.find((row) => row.mailboxId === mailboxId);
    if (!doc || !hook) throw new NotFoundError("mail hook");

    const secret = openSecret(hook.secret);
    const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/iu, "");
    if (!secret || given === "" || !sameSecret(given, secret)) throw new UnauthenticatedError("mail hook secret");

    const key = await hostingerKey(db);
    if (!key) return c.json({ ok: true, announced: 0 });

    let latest: RawMessage[];
    try {
      latest = (
        await hostingerPage<RawMessage>(key, `/mailboxes/${enc(mailboxId)}/folders/INBOX/messages`, {
          perPage: 10,
          sort: "-date",
        })
      ).data;
    } catch (err) {
      // Answered 200 anyway: a retry would hit the same wall, and the next new message tries again.
      console.error("[mail-watch]", JSON.stringify({ message: err instanceof HostingerError ? err.message : String(err) }));
      return c.json({ ok: true, announced: 0 });
    }

    const top = latest.reduce((max, m) => Math.max(max, m.uid), 0);
    // `before` is the row as it stood, so two deliveries racing here split the messages rather than both announcing them.
    const before = await rows(db).findOneAndUpdate(
      { _id: DOC_ID },
      { $max: { [`highWater.${mailboxId}`]: top }, $set: { lastEventAt: Date.now() } },
      { returnDocument: "before" },
    );
    const seen = before?.highWater?.[mailboxId] ?? 0;
    const own = new Set((before?.hooks ?? doc.hooks).map((row) => row.address.toLowerCase()));
    const cutoff = Date.now() - FIRST_RUN_MS;

    const fresh = latest
      .filter((m) => m.uid > seen)
      .filter((m) => (m.unseen ?? !(m.flags ?? []).includes("\\Seen")))
      // Sign-in codes never reach a lock screen, and the site's own mail to itself is already announced as what it is.
      .filter((m) => !isSignInCode(m.subject))
      .filter((m) => !own.has((m.from?.address ?? "").toLowerCase()))
      .filter((m) => seen > 0 || Date.parse(m.date) >= cutoff)
      .sort((a, b) => a.uid - b.uid);

    if (fresh.length > 0) {
      await deps.onNewMail(db, {
        mailboxId,
        address: hook.address,
        messages: fresh.map((m) => ({
          uid: m.uid,
          fromName: m.from?.name ?? "",
          fromAddress: m.from?.address ?? "",
          subject: m.subject ?? "",
        })),
      });
    }
    return c.json({ ok: true, announced: fresh.length });
  });

  return routes;
}

export function mailWatchRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/mail/watch", requireAdmin(), async (c) => {
    return c.json({ watch: await readMailWatch(await currentDb(c)) });
  });

  /* Re-points every mailbox at this site, for after a domain change or a deleted webhook. */
  routes.post("/admin/mail/watch", requireAdmin(), async (c) => {
    await readJsonOrEmpty(c, z.object({}).strict());
    const db = await currentDb(c);
    return c.json({ watch: await ensureMailWatch(db, requestOrigin(c.req), true) });
  });

  routes.delete("/admin/mail/watch", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    await stopMailWatch(db);
    return c.json({ watch: await readMailWatch(db) });
  });

  return routes;
}
