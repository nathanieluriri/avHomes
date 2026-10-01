import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "@avhomes/db";
import {
  BadRequestError,
  currentDb,
  currentUser,
  readJson,
  readJsonOrEmpty,
  requestOrigin,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  PUSH_APPS,
  PUSH_SCOPE,
  deviceLabel,
  isConsoleRole,
  isScopedRole,
  type AuthUser,
  type PushApp,
  type PushDeviceView,
  type PushDevicesResponse,
  type PushOutcome,
  type PushSettingsResponse,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { deviceId, devices, pushLog, pushToUsers, toLogView, type DeviceDoc } from "./send";
import { readVapidKeys, vapidKeys, writeVapidKeys } from "./vapid";

/**
 * A person's own devices: turning notifications on and off for this browser,
 * the list of where they are on, a test, and the tap that opened one. Plus the
 * key pair under Settings, for the owner and developers.
 *
 * Mounted at /api/push, outside /api/admin, because the partner app reaches it
 * too. Every route touches only the caller's own rows.
 */

export interface PushRouteDeps {
  /**
   * Runs after a console device subscribes, with the origin it came from. The
   * composition root uses it to make sure new mail reaches the console, so
   * nobody has to switch that on by hand.
   */
  onConsoleDevice?: (db: Db, user: AuthUser, origin: string) => Promise<void>;
}

const App = z.enum(PUSH_APPS);

const SubscribeBody = z
  .object({
    app: App,
    subscription: z.object({
      endpoint: str().url().max(1000),
      keys: z.object({ p256dh: str().min(1).max(200), auth: str().min(1).max(100) }),
    }),
  })
  .strict();

const ForgetBody = z.object({ endpoint: str().max(1000) }).strict();
const TestBody = z.object({ app: App }).strict();
const OpenedBody = z.object({ id: str().max(64) }).strict();

const KeysBody = z
  .object({ publicKey: str().trim().min(1).max(200), privateKey: str().trim().min(1).max(100) })
  .strict();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function settingsView(db: Db): Promise<PushSettingsResponse> {
  const since = Date.now() - WEEK_MS;
  const [keys, byApp, byOutcome, opened] = await Promise.all([
    readVapidKeys(db),
    devices(db).aggregate<{ _id: PushApp; n: number }>([{ $group: { _id: "$app", n: { $sum: 1 } } }]).toArray(),
    pushLog(db)
      .aggregate<{ _id: PushOutcome; n: number }>([
        { $match: { createdAt: { $gte: since }, kind: { $ne: "test" } } },
        { $group: { _id: "$outcome", n: { $sum: 1 } } },
      ])
      .toArray(),
    pushLog(db).countDocuments({ createdAt: { $gte: since }, kind: { $ne: "test" }, openedAt: { $ne: null } }),
  ]);
  const count = <K extends string>(list: { _id: K; n: number }[], key: K) => list.find((row) => row._id === key)?.n ?? 0;
  return {
    keys,
    devices: { m: count(byApp, "m"), admin: count(byApp, "admin") },
    week: {
      delivered: count(byOutcome, "delivered"),
      partial: count(byOutcome, "partial"),
      failed: count(byOutcome, "failed"),
      "no-device": count(byOutcome, "no-device"),
    },
    opened,
  };
}

function toView(doc: DeviceDoc): PushDeviceView {
  return { id: doc._id, app: doc.app, label: doc.label, createdAt: doc.createdAt, lastOkAt: doc.lastOkAt };
}

/** The same doors the two shells keep: no console for a marketer, no partner app for a partner lister. */
function assertApp(user: AuthUser, app: PushApp): void {
  if (app === "admin" ? !isConsoleRole(user.role) : isScopedRole(user.role)) {
    throw new BadRequestError(`notifications for this app are not for a ${user.role} account`);
  }
}

export function pushRoutes(deps: PushRouteDeps = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /* Public by nature, but only a signed-in browser has a use for it. */
  routes.get("/push/key", requireAuth(), async (c) => {
    const keys = await vapidKeys(await currentDb(c));
    return c.json({ publicKey: keys.publicKey });
  });

  routes.get("/push/devices", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const [mine, recent] = await Promise.all([
      devices(db).find({ userId: user.id }, { sort: { createdAt: -1 }, limit: 20 }).toArray(),
      pushLog(db).find({ userId: user.id }, { sort: { createdAt: -1 }, limit: 20 }).toArray(),
    ]);
    const out: PushDevicesResponse = { devices: mine.map(toView), recent: recent.map(toLogView) };
    return c.json(out);
  });

  /*
   * Saves this browser's subscription for the caller. Called on every visit
   * with notifications on, not only the first, so a browser another person
   * signed into last is handed back to whoever is using it now.
   */
  routes.post("/push/devices", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, SubscribeBody);
    assertApp(user, body.app);
    if (!body.subscription.endpoint.startsWith("https://")) throw new BadRequestError("endpoint");

    const now = Date.now();
    const id = deviceId(body.subscription.endpoint);
    await devices(db).updateOne(
      { _id: id },
      {
        $set: {
          userId: user.id,
          app: body.app,
          endpoint: body.subscription.endpoint,
          keys: body.subscription.keys,
          label: deviceLabel(c.req.header("user-agent") ?? ""),
          failures: 0,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now, lastOkAt: null, lastFailAt: null },
      },
      { upsert: true },
    );

    if (body.app === "admin" && deps.onConsoleDevice) {
      try {
        await deps.onConsoleDevice(db, user, requestOrigin(c.req));
      } catch (err) {
        console.error("[push]", JSON.stringify({ hook: "onConsoleDevice", message: err instanceof Error ? err.message : String(err) }));
      }
    }
    return c.json({ id }, 201);
  });

  /* Holding the endpoint is holding the subscription, so it is enough to drop it. */
  routes.post("/push/devices/forget", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, ForgetBody);
    await devices(db).deleteOne({ _id: deviceId(body.endpoint) });
    return c.json({ ok: true });
  });

  routes.delete("/push/devices/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    await devices(db).deleteOne({ _id: c.req.param("id"), userId: user.id });
    return c.json({ ok: true });
  });

  routes.post("/push/test", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, TestBody);
    const [sent] = await pushToUsers(
      db,
      [user.id],
      body.app,
      {
        kind: "test",
        title: "Notifications are on",
        body:
          body.app === "m"
            ? "This is how AV Homes tells you a deal was approved or money was sent."
            : "This is how the console tells you about new mail, deals and enquiries.",
        url: PUSH_SCOPE[body.app],
        tag: "test",
      },
      { urgency: "high", ttlSeconds: 60 * 10 },
    );
    return c.json({ result: sent ?? null });
  });

  /* ───────────── Settings: the key pair, owner and developer only ───────────── */

  /* `/api/admin/push` falls to the gate's `danger` catch-all, and each route repeats it. */
  routes.get("/admin/push", requireAdmin(), async (c) => {
    return c.json(await settingsView(await currentDb(c)));
  });

  /* A pasted pair, checked to be a real matching pair before it replaces the one in use. */
  routes.put("/admin/push/keys", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, KeysBody);
    await writeVapidKeys(db, body);
    await devices(db).deleteMany({});
    return c.json(await settingsView(db));
  });

  routes.post("/admin/push/keys/new", requireAdmin(), async (c) => {
    await readJsonOrEmpty(c, z.object({}).strict());
    const db = await currentDb(c);
    await writeVapidKeys(db, null);
    await devices(db).deleteMany({});
    return c.json(await settingsView(db));
  });

  /* The service worker reports a tap here, so the ledger says what was read. */
  routes.post("/push/opened", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, OpenedBody);
    await pushLog(db).updateOne({ _id: body.id, userId: user.id, openedAt: null }, { $set: { openedAt: Date.now() } });
    return c.json({ ok: true });
  });

  return routes;
}
