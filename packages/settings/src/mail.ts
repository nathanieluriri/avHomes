import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  HostingerError,
  currentDb,
  currentUser,
  email,
  getEnv,
  hostingerAccount,
  hostingerMailer,
  mailerWithFallback,
  openSecret,
  readJson,
  resendMailer,
  sealSecret,
  str,
  trySend,
  type AppEnv,
  type HostingerMailbox,
  type HostingerSender,
  type Mailer,
} from "@avhomes/core";
import type { MailProvider, MailSettingsView } from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";

/**
 * Email delivery: which Hostinger mailbox the site sends as, and the key.
 *
 * Its own document in the settings collection, never merged into the site
 * document, because `readSettings` is served to every signed-in member and the
 * public read is one projection away from it. Nothing that reads this document
 * returns the key: the view carries whether one is saved and its last four.
 */

const DOC_ID = "mail";

interface MailDoc {
  _id: string;
  /** `sealSecret` output. Never the plain key. */
  hostingerKey?: string;
  hostingerKeyLast4?: string;
  senderMailboxId?: string;
  senderAddress?: string;
  displayName?: string;
  updatedAt: number;
}

function rows(db: Db) {
  return collection<MailDoc>(db, COLLECTIONS.settings);
}

async function readDoc(db: Db): Promise<MailDoc | null> {
  return rows(db).findOne({ _id: DOC_ID });
}

/** The key to call Hostinger with: the saved one, else the deployment's. */
export async function hostingerKey(db: Db | null): Promise<string | null> {
  const doc = db ? await readDoc(db) : null;
  if (doc?.hostingerKey) {
    const plain = openSecret(doc.hostingerKey);
    if (plain) return plain;
  }
  const env = getEnv().HOSTINGER_MAIL_API_KEY;
  return env === "" ? null : env;
}

/* ─────────────────────────── the sender, cached ─────────────────────────── */

/*
 * Every send would otherwise cost a settings read, a decrypt and a call to
 * Hostinger's /me. A minute is short enough that a changed setting lands before
 * anybody goes looking, and a save clears it at once on the instance that took it.
 */
const TTL_MS = 60_000;
let cached: { at: number; value: Promise<HostingerSender | null> } | null = null;

export function forgetMailSender(): void {
  cached = null;
}

async function loadSender(db: Db | null): Promise<HostingerSender | null> {
  const key = await hostingerKey(db);
  if (!key) return null;
  const doc = db ? await readDoc(db) : null;
  let mailboxId = doc?.senderMailboxId ?? "";
  let address = doc?.senderAddress ?? "";
  if (mailboxId === "") {
    const first = (await hostingerAccount(key)).mailboxes[0];
    if (!first) return null;
    mailboxId = first.resourceId;
    address = first.address;
  }
  return { key, mailboxId, address, displayName: doc?.displayName ?? "" };
}

export function cachedMailSender(resolveDb: () => Promise<Db>): Promise<HostingerSender | null> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const value = resolveDb()
    // No database is no saved key, not an outage: the deployment's key still works.
    .catch(() => null)
    .then(loadSender)
    .catch((err: unknown) => {
      console.error("[mail]", JSON.stringify({ message: err instanceof Error ? err.message : String(err) }));
      // A failed lookup is not cached, so the next send tries again.
      cached = null;
      return null;
    });
  cached = { at: now, value };
  return value;
}

/**
 * The one transport the whole app sends through: the Hostinger mailbox when a
 * key is set, the Resend environment otherwise.
 */
export function appMailer(resolveDb: () => Promise<Db>): Mailer {
  return mailerWithFallback(hostingerMailer(() => cachedMailSender(resolveDb)), resendMailer());
}

/* ─────────────────────────────── the view ──────────────────────────────── */

function resendConfigured(): boolean {
  const env = getEnv();
  return env.RESEND_API_KEY !== "" && env.MAIL_FROM !== "";
}

export async function readMailSettings(db: Db): Promise<MailSettingsView> {
  const doc = await readDoc(db);
  const keySaved = Boolean(doc?.hostingerKey);
  const keyUnreadable = keySaved && openSecret(doc?.hostingerKey ?? "") === null;
  const envKey = getEnv().HOSTINGER_MAIL_API_KEY !== "";
  const provider: MailProvider =
    (keySaved && !keyUnreadable) || envKey ? "hostinger" : resendConfigured() ? "resend" : "none";
  return {
    provider,
    keySaved,
    keyLast4: keySaved ? (doc?.hostingerKeyLast4 ?? null) : null,
    keyUnreadable,
    envKey,
    senderMailboxId: doc?.senderMailboxId ?? "",
    senderAddress: doc?.senderAddress ?? "",
    displayName: doc?.displayName ?? "",
    resendConfigured: resendConfigured(),
    updatedAt: doc?.updatedAt ?? 0,
  };
}

/** Hostinger's refusal, as a sentence the owner can act on. */
export function hostingerProblem(err: unknown): never {
  if (err instanceof HostingerError) {
    if (err.status === 401) {
      throw new BadRequestError("Hostinger did not accept the API key. Paste a fresh one from the Hostinger panel.");
    }
    if (err.status === 403) {
      throw new BadRequestError("The API key is not allowed to use that mailbox.");
    }
    if (err.status === 429) {
      throw new BadRequestError("Hostinger is rate limiting this key. Wait a minute and try again.");
    }
    if (err.status < 500) throw new BadRequestError(err.message);
  }
  throw err;
}

async function mailboxesFor(key: string): Promise<HostingerMailbox[]> {
  try {
    return (await hostingerAccount(key)).mailboxes;
  } catch (err) {
    hostingerProblem(err);
  }
}

/* ─────────────────────────────── the routes ────────────────────────────── */

const UpdateBody = z
  .object({
    /* Empty or absent keeps the saved key, null clears it. The input is never
       prefilled, because the key never comes back. */
    apiKey: str().trim().max(500).nullable().optional(),
    senderMailboxId: str().trim().max(80).optional(),
    displayName: str().trim().max(80).optional(),
  })
  .strict();

const TestSendBody = z.object({ to: email() }).strict();

export function mailSettingsRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/settings/mail", requireAdmin(), async (c) => {
    return c.json({ mail: await readMailSettings(await currentDb(c)) });
  });

  routes.put("/admin/settings/mail", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, UpdateBody);
    const set: Partial<MailDoc> = { updatedAt: Date.now() };
    const unset: Record<string, ""> = {};

    // A chosen mailbox belongs to the key that listed it, so a new key or none drops it.
    const dropSender = () => {
      set.senderMailboxId = "";
      set.senderAddress = "";
    };
    if (body.apiKey === null) {
      unset.hostingerKey = "";
      unset.hostingerKeyLast4 = "";
      dropSender();
    } else if (body.apiKey) {
      // Proven against Hostinger before it is stored, so a typo is a 400 now rather than silent mail loss later.
      const reachable = await mailboxesFor(body.apiKey);
      set.hostingerKey = sealSecret(body.apiKey);
      set.hostingerKeyLast4 = body.apiKey.slice(-4);
      const current = (await readDoc(db))?.senderMailboxId ?? "";
      if (!reachable.some((m) => m.resourceId === current)) dropSender();
    }

    if (body.senderMailboxId !== undefined) {
      if (body.senderMailboxId === "") {
        set.senderMailboxId = "";
        set.senderAddress = "";
      } else {
        const key = body.apiKey || (body.apiKey === null ? null : await hostingerKey(db));
        if (!key) throw new BadRequestError("Save a Hostinger API key before choosing a mailbox.");
        const match = (await mailboxesFor(key)).find((m) => m.resourceId === body.senderMailboxId);
        if (!match) throw new BadRequestError("That mailbox is not one this API key can send from.");
        set.senderMailboxId = match.resourceId;
        set.senderAddress = match.address;
      }
    }
    if (body.displayName !== undefined) set.displayName = body.displayName;

    await rows(db).updateOne(
      { _id: DOC_ID },
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      { upsert: true },
    );
    forgetMailSender();
    return c.json({ mail: await readMailSettings(db) });
  });

  /* Proves the key works and lists what it can reach. Sends nothing. */
  routes.post("/admin/settings/mail/test", requireAdmin(), async (c) => {
    const key = await hostingerKey(await currentDb(c));
    if (!key) throw new BadRequestError("There is no Hostinger API key to test.");
    const mailboxes = await mailboxesFor(key);
    return c.json({ ok: true, mailboxes });
  });

  /* A real email through the same transport invites and replies use. */
  routes.post("/admin/settings/mail/test-send", requireAdmin(), async (c) => {
    const { to } = await readJson(c, TestSendBody);
    const db = await currentDb(c);
    const view = await readMailSettings(db);
    const user = currentUser(c);
    const sent = await trySend(
      deps.mailer,
      {
        to,
        subject: "Test email from the AV Homes console",
        text: `${user.displayName} sent this from Settings to check that email delivery works.\n\nIf you can read it, the site can send mail.`,
      },
      { requestId: c.get("requestId"), route: "POST /admin/settings/mail/test-send" },
    );
    if (!sent) {
      throw new BadRequestError(
        view.provider === "none"
          ? "Email is not set up yet. Save a Hostinger API key first."
          : "The test email was not accepted. Check the key and the mailbox, then try again.",
      );
    }
    return c.json({ sent: true, to, provider: view.provider });
  });

  return routes;
}
