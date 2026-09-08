import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  currentDb,
  readJson,
  str,
  type AppEnv,
} from "@avhomes/core";
import { REPLY_IDENTITIES, type ReplyIdentity, type SiteSettings } from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";

/**
 * Who a reply is signed by, site-wide.
 *
 * It lives in the enquiries package because replies are the only thing it
 * governs. If a second unrelated site setting ever arrives, this moves out; one
 * setting does not earn a package, and a `settings` module that is really an
 * enquiry setting is easier to find than a generic one that is really this.
 *
 * ONE DOCUMENT, at a FIXED id. Settings are not a list, and the fixed id is what
 * makes the upsert below idempotent: there is no "which row is the live one"
 * question to get wrong, and no way to end up with two.
 */

const DOC_ID = "site";

interface SettingsDoc {
  _id: string;
  replyIdentity: ReplyIdentity;
  teamName: string;
  teamAvatarUrl: string;
  updatedAt: number;
  revision: number;
}

/**
 * The shape a brand new instance behaves as, WITHOUT writing it.
 *
 * A read that lazily creates its own default row turns every public page load
 * into a potential write, and races two of them into a duplicate key on the
 * first burst of traffic. Absent simply means default.
 */
const DEFAULTS: SiteSettings = {
  replyIdentity: "individual",
  teamName: "AV Constructions team",
  teamAvatarUrl: "",
  updatedAt: 0,
  revision: 0,
};

function settings(db: Db) {
  return collection<SettingsDoc>(db, COLLECTIONS.settings);
}

export async function readSettings(db: Db): Promise<SiteSettings> {
  const doc = await settings(db).findOne({ _id: DOC_ID });
  if (!doc) return DEFAULTS;
  return {
    replyIdentity: doc.replyIdentity,
    teamName: doc.teamName,
    teamAvatarUrl: doc.teamAvatarUrl ?? "",
    updatedAt: doc.updatedAt,
    revision: doc.revision,
  };
}

/**
 * The name and face to put on a reply, decided in ONE place.
 *
 * Both branches are resolved here rather than at the call sites, because the
 * two call sites are "the message written to the thread" and "the transcript
 * emailed to the buyer", and those disagreeing is the exact failure this
 * setting exists to prevent: a buyer reading one name on the page and a
 * different one in their inbox learns more about the staffing than the site
 * intended to tell them.
 */
export function replySignature(
  site: SiteSettings,
  agent: { displayName: string; avatarUrl: string },
): { name: string; avatarUrl: string } {
  if (site.replyIdentity === "team") {
    return { name: site.teamName, avatarUrl: site.teamAvatarUrl };
  }
  return { name: agent.displayName, avatarUrl: agent.avatarUrl };
}

const UpdateBody = z
  .object({
    replyIdentity: z.enum(REPLY_IDENTITIES).optional(),
    teamName: str().min(1).max(120).trim().optional(),
    teamAvatarUrl: str().max(600).trim().optional(),
  })
  .strict();

export function settingsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /*
   * READABLE BY ANY SIGNED-IN member, writable only by an admin. The enquiry
   * screens need to know which name they are about to sign with, and an agent
   * who cannot read that is an agent who cannot be shown what the buyer will
   * see before they press send.
   */
  routes.get("/admin/settings", requireAuth(), async (c) => {
    return c.json({ settings: await readSettings(await currentDb(c)) });
  });

  routes.patch("/admin/settings", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, UpdateBody);
    const now = Date.now();

    /*
     * `$setOnInsert` carries the defaults for the fields this PATCH did not
     * name. Without it, the first ever write of `replyIdentity` would create a
     * document with no `teamName`, and the next read would hand the wire a
     * settings object with an undefined name that the console renders as blank.
     */
    const set: Record<string, unknown> = { updatedAt: now };
    for (const key of ["replyIdentity", "teamName", "teamAvatarUrl"] as const) {
      if (body[key] !== undefined) set[key] = body[key];
    }
    const setOnInsert: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (key === "updatedAt" || key === "revision") continue;
      if (!(key in set)) setOnInsert[key] = value;
    }

    await settings(db).updateOne(
      { _id: DOC_ID },
      { $set: set, $setOnInsert: setOnInsert, $inc: { revision: 1 } },
      { upsert: true },
    );
    return c.json({ settings: await readSettings(db) });
  });

  return routes;
}
