import { createHash } from "node:crypto";
import webpush, { WebPushError } from "web-push";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { newId } from "@avhomes/core";
import {
  ALL_ROLES,
  PUSH_SCOPE,
  hasDomain,
  isConsoleRole,
  isScopedRole,
  type Domain,
  type PushApp,
  type PushKind,
  type PushLogView,
  type PushMessage,
  type PushOutcome,
  type PushPayload,
  type Role,
} from "@avhomes/contracts";
import { vapidKeys, vapidSubject } from "./vapid";

/**
 * Sending, and writing down how each send went.
 *
 * Every function here NEVER THROWS. A notification is news about something that
 * already happened, and a push service being slow or a key being unreadable must
 * not undo the deal review or the payment that caused it.
 */

export interface DeviceDoc {
  _id: string;
  userId: string;
  app: PushApp;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label: string;
  failures: number;
  lastOkAt: number | null;
  lastFailAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LogDoc {
  _id: string;
  userId: string;
  app: PushApp;
  kind: PushKind;
  title: string;
  body: string;
  url: string;
  outcome: PushOutcome;
  devices: number;
  delivered: number;
  failed: number;
  gone: number;
  errors: string[];
  openedAt: number | null;
  createdAt: number;
  expiresAtDate: Date;
}

export function devices(db: Db) {
  return collection<DeviceDoc>(db, COLLECTIONS.pushDevices);
}

export function pushLog(db: Db) {
  return collection<LogDoc>(db, COLLECTIONS.pushLog);
}

/** Stable per browser, so subscribing again updates the row instead of adding one. */
export function deviceId(endpoint: string): string {
  return `pdv_${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}`;
}

const LOG_KEPT_MS = 180 * 24 * 60 * 60 * 1000;
/** A device that has failed this many times in a row is dropped. One success resets it. */
const MAX_FAILURES = 10;
/** How many devices are sent to at once, so a broadcast cannot open hundreds of sockets. */
const BATCH = 25;

export interface SendOptions {
  /** `high` for something the person has to act on. Push services wake a sleeping phone for it. */
  urgency?: "high" | "normal" | "low";
  /** How long a push service holds it for a phone that is off. */
  ttlSeconds?: number;
}

export function toLogView(doc: LogDoc): PushLogView {
  return {
    id: doc._id,
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    outcome: doc.outcome,
    devices: doc.devices,
    delivered: doc.delivered,
    createdAt: doc.createdAt,
    openedAt: doc.openedAt,
  };
}

function short(err: unknown): string {
  if (err instanceof WebPushError) return `${err.statusCode} ${err.body || err.message}`.slice(0, 200);
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

/** A link outside the app's own scope would open in a browser tab rather than the installed app. */
function inScope(app: PushApp, url: string): string {
  const scope = PUSH_SCOPE[app];
  return url === scope || url.startsWith(`${scope}/`) || url.startsWith(`${scope}?`) || url.startsWith(`${scope}#`)
    ? url
    : scope;
}

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(run));
  }
}

/**
 * One notification to each of these people, on every device they turned it on
 * for in this app. One ledger row per person, `no-device` included, so "did they
 * get it" is answered by a read rather than a guess.
 */
export async function pushToUsers(
  db: Db,
  userIds: readonly string[],
  app: PushApp,
  message: PushMessage,
  options: SendOptions = {},
): Promise<PushLogView[]> {
  const people = [...new Set(userIds.filter((id) => id !== ""))];
  if (people.length === 0) return [];
  try {
    const now = Date.now();
    const url = inScope(app, message.url);
    const title = message.title.slice(0, 120);
    const body = message.body.slice(0, 300);
    const targets = await devices(db).find({ userId: { $in: people }, app }).toArray();

    let keys: Awaited<ReturnType<typeof vapidKeys>> | null = null;
    let keyError = "";
    if (targets.length > 0) {
      try {
        keys = await vapidKeys(db);
      } catch (err) {
        keyError = `keys: ${short(err)}`;
      }
    }

    const logs = new Map<string, LogDoc>(
      people.map((userId, i) => [
        userId,
        {
          _id: newId("push", now + i),
          userId,
          app,
          kind: message.kind,
          title,
          body,
          url,
          outcome: "no-device",
          devices: 0,
          delivered: 0,
          failed: 0,
          gone: 0,
          errors: [],
          openedAt: null,
          createdAt: now,
          expiresAtDate: new Date(now + LOG_KEPT_MS),
        },
      ]),
    );

    await inBatches(targets, async (device) => {
      const log = logs.get(device.userId);
      if (!log) return;
      log.devices += 1;
      if (!keys) {
        log.failed += 1;
        if (!log.errors.includes(keyError)) log.errors.push(keyError);
        return;
      }
      const payload: PushPayload = { ...message, title, body, url, id: log._id };
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: device.keys },
          JSON.stringify(payload),
          {
            vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: options.ttlSeconds ?? 24 * 60 * 60,
            urgency: options.urgency ?? "normal",
            contentEncoding: "aes128gcm",
            timeout: 10_000,
          },
        );
        log.delivered += 1;
        await devices(db).updateOne(
          { _id: device._id },
          { $set: { lastOkAt: Date.now(), failures: 0 } },
        );
      } catch (err) {
        // 404 and 410 are the push service saying this subscription is over for good.
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          log.gone += 1;
          await devices(db).deleteOne({ _id: device._id });
          return;
        }
        log.failed += 1;
        const reason = short(err);
        if (log.errors.length < 3 && !log.errors.includes(reason)) log.errors.push(reason);
        const after = await devices(db).findOneAndUpdate(
          { _id: device._id },
          { $inc: { failures: 1 }, $set: { lastFailAt: Date.now() } },
          { returnDocument: "after" },
        );
        if (after && after.failures >= MAX_FAILURES) await devices(db).deleteOne({ _id: device._id });
      }
    });

    for (const log of logs.values()) {
      log.outcome =
        log.devices === 0 || log.devices === log.gone
          ? "no-device"
          : log.delivered === 0
            ? "failed"
            : log.delivered + log.gone < log.devices
              ? "partial"
              : "delivered";
    }
    const rows = [...logs.values()];
    await pushLog(db).insertMany(rows);
    if (rows.some((row) => row.failed > 0)) {
      console.error(
        "[push]",
        JSON.stringify({ kind: message.kind, failed: rows.reduce((n, r) => n + r.failed, 0), errors: rows.flatMap((r) => r.errors).slice(0, 3) }),
      );
    }
    return rows.map(toLogView);
  } catch (err) {
    console.error("[push]", JSON.stringify({ kind: message.kind, message: short(err) }));
    return [];
  }
}

interface UserDoc {
  _id: string;
  role: Role;
  disabledAt: number | null;
}

/** Console roles holding this domain. `developer` names the role itself, for the developer's own inbox. */
function rolesFor(audience: Domain | "developer"): Role[] {
  if (audience === "developer") return ["developer"];
  return ALL_ROLES.filter((role) => isConsoleRole(role) && !isScopedRole(role) && hasDomain(role, audience));
}

/** The active console accounts that work this area, minus whoever caused the news. */
export async function consoleUserIds(
  db: Db,
  audience: Domain | "developer",
  exceptUserId: string | null = null,
): Promise<string[]> {
  const rows = await collection<UserDoc>(db, COLLECTIONS.users)
    .find(
      {
        role: { $in: rolesFor(audience) },
        disabledAt: null,
        ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  return rows.map((row) => row._id);
}

/** News for the console, to everyone who works the area it belongs to. */
export async function pushToConsole(
  db: Db,
  audience: Domain | "developer",
  message: PushMessage,
  options: SendOptions & { exceptUserId?: string | null } = {},
): Promise<void> {
  try {
    const ids = await consoleUserIds(db, audience, options.exceptUserId ?? null);
    await pushToUsers(db, ids, "admin", message, options);
  } catch (err) {
    console.error("[push]", JSON.stringify({ kind: message.kind, message: short(err) }));
  }
}

/**
 * Whether this kind of news went out recently, so a run of failures becomes one
 * notification rather than one per failure.
 */
export async function sentWithin(db: Db, kind: PushKind, ms: number): Promise<boolean> {
  try {
    return (await pushLog(db).countDocuments({ kind, createdAt: { $gte: Date.now() - ms } }, { limit: 1 })) > 0;
  } catch {
    return false;
  }
}
