import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import { currentDb, isProduction, newId, requestOrigin, type AppEnv } from "@avhomes/core";
import {
  isWhatsappGroupUrl,
  whatsappLink,
  type EmailTemplateKey,
  type Marketer,
  type MarketingUpdate,
  type PushMessage,
  type WhatsappChangeReason,
  type WhatsappClickKind,
  type WhatsappLinkChange,
  type WhatsappClickRow,
  type WhatsappPartnerRow,
  type WhatsappReport,
} from "@avhomes/contracts";
import { findMarketerByCode, findMarketerByUser } from "./repo";
import { readMarketingSettings } from "./settings";

interface ClickDoc {
  _id: string;
  at: number;
  kind: WhatsappClickKind;
  ownerId: string;
  ownerCode: string;
  ownerName: string;
  openerMarketerId: string | null;
  openerName: string | null;
  /** A random id kept in a cookie on the opening browser. Not tied to a person unless they sign in. */
  visitor: string;
}

function clicks(db: Db) {
  return collection<ClickDoc>(db, COLLECTIONS.whatsappClicks);
}

const VISITOR_COOKIE = "avwa";
// Browsers cap cookie lifetime at 400 days, and Hono refuses anything longer.
const VISITOR_MAX_AGE = 60 * 60 * 24 * 395;
/** A double tap or a link preview fetch is one open, not two. */
const DEBOUNCE_MS = 30_000;

/**
 * `/wa/<code>`: count the open, credit it to the partner whose link it is, and
 * send the browser on to the group.
 *
 * Mounted after the session middleware so a signed in partner opening their own
 * link is recognised, but it requires nothing: a forwarded link is opened by
 * people with no account at all.
 */
export function whatsappRedirectRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/wa/:code?", async (c) => {
    const db = await currentDb(c);
    const settings = await readMarketingSettings(db);
    const target = settings.whatsappGroupUrl;
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (!isWhatsappGroupUrl(target)) return c.redirect(`${requestOrigin(c.req)}/partner-with-us`, 302);

    const code = (c.req.param("code") ?? "").trim().toUpperCase();
    // Link unfurlers fetch the URL to draw a preview. Counting them would credit a forward nobody opened.
    const agent = c.req.header("user-agent") ?? "";
    const bot = /bot|crawler|spider|facebookexternalhit|whatsapp|slack|telegram|preview/iu.test(agent);
    if (code !== "" && !bot) {
      try {
        await recordClick(db, c, code);
      } catch (err) {
        console.error("[whatsapp]", JSON.stringify({ requestId: c.get("requestId"), message: String(err) }));
      }
    }
    return c.redirect(target, 302);
  });

  return routes;
}

async function recordClick(db: Db, c: Context<AppEnv>, code: string) {
  const owner = await findMarketerByCode(db, code);
  if (!owner) return;

  let visitor = getCookie(c, VISITOR_COOKIE) ?? "";
  if (!/^[a-f0-9]{32}$/u.test(visitor)) {
    visitor = randomBytes(16).toString("hex");
    setCookie(c, VISITOR_COOKIE, visitor, {
      path: "/",
      httpOnly: true,
      secure: isProduction(),
      sameSite: "Lax",
      maxAge: VISITOR_MAX_AGE,
    });
  }

  const user = c.get("user");
  const opener = user ? await findMarketerByUser(db, user.id) : null;
  let kind: WhatsappClickKind;
  if (opener) {
    kind = opener.id === owner.id ? "self" : "forward";
  } else {
    // A browser the partner once opened their own link in is still them.
    const seen = await clicks(db).findOne({ ownerId: owner.id, visitor, kind: "self" }, { projection: { _id: 1 } });
    kind = seen ? "self" : "forward";
  }

  const now = Date.now();
  const recent = await clicks(db).findOne(
    { ownerId: owner.id, visitor, at: { $gte: now - DEBOUNCE_MS } },
    { projection: { _id: 1 } },
  );
  if (recent) return;

  await clicks(db).insertOne({
    _id: newId("wac", now),
    at: now,
    kind,
    ownerId: owner.id,
    ownerCode: owner.code,
    ownerName: owner.displayName,
    openerMarketerId: opener?.id ?? null,
    openerName: opener?.displayName ?? null,
    visitor,
  });
}

export async function hasJoinedWhatsapp(db: Db, marketerId: string): Promise<boolean> {
  return (await clicks(db).findOne({ ownerId: marketerId, kind: "self" }, { projection: { _id: 1 } })) !== null;
}

/** The pinned card on the app's home screen, until the partner has opened the group. */
export async function whatsappCard(db: Db, marketer: Marketer, origin: string): Promise<MarketingUpdate | null> {
  const settings = await readMarketingSettings(db);
  if (!isWhatsappGroupUrl(settings.whatsappGroupUrl)) return null;
  if (await hasJoinedWhatsapp(db, marketer.id)) return null;
  return {
    id: "whatsapp-group",
    title: "Join the partners' WhatsApp group",
    body: "New listings, site visit days and pay day news land there first.",
    imageUrl: "",
    linkLabel: "Join the group",
    linkHref: whatsappLink(origin, marketer.code),
    tone: "plum",
    pinned: true,
    status: "live",
    startsAt: 0,
    endsAt: null,
    createdByName: "AV Homes",
    createdAt: 0,
    updatedAt: 0,
    source: "admin",
  };
}

export const WHATSAPP_PUSH: Omit<PushMessage, "tag"> = {
  kind: "whatsapp-invite",
  title: "Join the AV Homes partners on WhatsApp",
  body: "New listings and pay day news land there first. Tap to join.",
  url: "/m/whatsapp",
};

export type SendTemplate = (
  db: Db,
  to: string,
  key: EmailTemplateKey,
  text: Record<string, string>,
  ctx: { requestId: string; route: string },
) => Promise<boolean>;

export interface InviteDeps {
  tell?: (db: Db, userIds: string[], message: PushMessage, options?: { urgency?: "high" | "normal" }) => Promise<void>;
  mail?: SendTemplate;
}

/**
 * One row per partner who has been sent the WhatsApp invite, so nobody gets it twice.
 *
 * The email and the push are tracked apart: with mail not set up the push still
 * goes, and the email follows on a later run once it is, without a second push.
 * `claimAt` is a short lease, so two admins saving the link at once cannot both
 * send to the same partner.
 */
interface InviteDoc {
  _id: string;
  firstAt: number;
  emailedAt: number | null;
  pushedAt: number | null;
  claimAt: number | null;
}

function invites(db: Db) {
  return collection<InviteDoc>(db, COLLECTIONS.whatsappInvites);
}

const CLAIM_LEASE_MS = 10 * 60_000;

/** True when this caller now owns sending this partner's invite email. */
async function claimInvite(db: Db, marketerId: string, now: number): Promise<boolean> {
  try {
    const res = await invites(db).updateOne(
      {
        _id: marketerId,
        emailedAt: null,
        $or: [{ claimAt: null }, { claimAt: { $lt: now - CLAIM_LEASE_MS } }],
      },
      { $set: { claimAt: now }, $setOnInsert: { firstAt: now, pushedAt: null } },
      { upsert: true },
    );
    return res.modifiedCount + res.upsertedCount > 0;
  } catch (err) {
    // The upsert collided with a row that is already emailed or claimed.
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

async function settleInvite(db: Db, marketerId: string, emailed: boolean, pushed: boolean, now: number) {
  await invites(db).updateOne(
    { _id: marketerId },
    {
      $set: {
        claimAt: null,
        ...(emailed ? { emailedAt: now } : {}),
        ...(pushed ? { pushedAt: now } : {}),
      },
    },
  );
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/u)[0] || name;
}

/** The welcome a new partner gets. With a group set, it carries their link and counts as their invite. */
export async function welcomePartner(
  deps: InviteDeps,
  db: Db,
  marketer: Marketer,
  origin: string,
  ctx: { requestId: string; route: string },
): Promise<void> {
  const settings = await readMarketingSettings(db);
  const hasGroup = isWhatsappGroupUrl(settings.whatsappGroupUrl);
  const now = Date.now();
  const claimed = hasGroup && (await claimInvite(db, marketer.id, now));
  const emailed =
    (await deps.mail?.(
      db,
      marketer.email,
      "property-partner-welcome",
      {
        name: firstNameOf(marketer.displayName),
        appLink: `${origin}/m`,
        whatsappLink: hasGroup ? whatsappLink(origin, marketer.code) : "",
      },
      ctx,
    )) ?? false;
  if (!claimed) return;
  await deps.tell?.(db, [marketer.userId], { ...WHATSAPP_PUSH, tag: "whatsapp-invite" });
  await settleInvite(db, marketer.id, emailed, true, now);
}

/**
 * Invite every active partner who has not been sent the group yet.
 *
 * Run when an admin saves the link, so partners who joined before there was a
 * group are caught up. Anyone already invited is skipped, so saving the link
 * again, or changing it, sends nothing new: their /wa link follows the new group
 * on its own.
 */
export async function inviteUninvited(
  deps: InviteDeps,
  db: Db,
  origin: string,
  ctx: { requestId: string; route: string },
): Promise<{ invited: number; emailed: number }> {
  const settings = await readMarketingSettings(db);
  if (!isWhatsappGroupUrl(settings.whatsappGroupUrl)) return { invited: 0, emailed: 0 };

  const done = new Set(
    (await invites(db).find({ emailedAt: { $ne: null } }, { projection: { _id: 1 } }).toArray()).map((row) => row._id),
  );
  const pending = (await activePartners(db)).filter((m) => !done.has(m._id));
  const now = Date.now();
  let invited = 0;
  let emailed = 0;

  for (const m of pending) {
    if (!(await claimInvite(db, m._id, now))) continue;
    const row = await invites(db).findOne({ _id: m._id }, { projection: { pushedAt: 1 } });
    const pushNow = !row?.pushedAt;
    if (pushNow) await deps.tell?.(db, [m.userId], { ...WHATSAPP_PUSH, tag: "whatsapp-invite" });
    const sent =
      (await deps.mail?.(
        db,
        m.email,
        "property-partner-whatsapp",
        { name: firstNameOf(m.displayName), whatsappLink: whatsappLink(origin, m.code) },
        ctx,
      )) ?? false;
    await settleInvite(db, m._id, sent, pushNow, now);
    if (pushNow || sent) invited += 1;
    if (sent) emailed += 1;
  }
  return { invited, emailed };
}

/** Push and email every active partner who has not opened the group yet, invited or not. */
export async function remindPartners(
  deps: InviteDeps,
  db: Db,
  origin: string,
  ctx: { requestId: string; route: string },
): Promise<{ partners: number; emailed: number }> {
  const settings = await readMarketingSettings(db);
  if (!isWhatsappGroupUrl(settings.whatsappGroupUrl)) return { partners: 0, emailed: 0 };
  const joined = new Set(await clicks(db).distinct("ownerId", { kind: "self" }));
  const pending = (await activePartners(db)).filter((m) => !joined.has(m._id));
  const now = Date.now();

  await deps.tell?.(
    db,
    pending.map((m) => m.userId),
    { ...WHATSAPP_PUSH, tag: "whatsapp-invite" },
  );
  let emailed = 0;
  for (const m of pending) {
    const sent = await deps.mail?.(
      db,
      m.email,
      "property-partner-whatsapp",
      { name: firstNameOf(m.displayName), whatsappLink: whatsappLink(origin, m.code) },
      ctx,
    );
    if (sent) emailed += 1;
    // A reminder is an invite too, so a later save of the link does not send it again.
    await invites(db).updateOne(
      { _id: m._id },
      {
        $set: { pushedAt: now, claimAt: null, ...(sent ? { emailedAt: now } : {}) },
        $setOnInsert: { firstAt: now, ...(sent ? {} : { emailedAt: null }) },
      },
      { upsert: true },
    );
  }
  return { partners: pending.length, emailed };
}

interface PartnerRow {
  _id: string;
  userId: string;
  code: string;
  displayName: string;
  email: string;
}

function activePartners(db: Db): Promise<PartnerRow[]> {
  return db
    .collection<PartnerRow & { status: string; isAdmin: boolean }>(COLLECTIONS.marketers)
    .find({ status: "active", isAdmin: { $ne: true } }, { projection: { _id: 1, userId: 1, code: 1, displayName: 1, email: 1 } })
    .sort({ seq: 1 })
    .toArray();
}

interface LinkChangeDoc {
  _id: string;
  url: string;
  previousUrl: string;
  reason: WhatsappChangeReason;
  note: string;
  byId: string;
  byName: string;
  at: number;
  invited: number;
}

function linkHistory(db: Db) {
  return collection<LinkChangeDoc>(db, COLLECTIONS.whatsappLinkHistory);
}

function toLinkChange(doc: LinkChangeDoc): WhatsappLinkChange {
  return {
    id: doc._id,
    url: doc.url,
    previousUrl: doc.previousUrl,
    reason: doc.reason,
    note: doc.note,
    byName: doc.byName,
    at: doc.at,
    invited: doc.invited,
  };
}

export async function recordLinkChange(
  db: Db,
  change: Omit<LinkChangeDoc, "_id" | "at">,
): Promise<WhatsappLinkChange> {
  const now = Date.now();
  const doc: LinkChangeDoc = { _id: newId("wal", now), at: now, ...change };
  await linkHistory(db).insertOne(doc);
  return toLinkChange(doc);
}

export async function listLinkChanges(db: Db, limit = 100): Promise<WhatsappLinkChange[]> {
  const docs = await linkHistory(db).find({}, { sort: { at: -1, _id: -1 }, limit }).toArray();
  return docs.map(toLinkChange);
}

export async function whatsappReport(db: Db): Promise<WhatsappReport> {
  const [lastChange, settings, partners, sentInvites, grouped, totals, recent] = await Promise.all([
    linkHistory(db).findOne({}, { sort: { at: -1, _id: -1 } }),
    readMarketingSettings(db),
    activePartners(db),
    invites(db).find({}, { projection: { _id: 1, firstAt: 1 } }).toArray(),
    clicks(db)
      .aggregate<{
        _id: string;
        selfClicks: number;
        forwardClicks: number;
        forwardVisitors: string[];
        firstSelfAt: number | null;
        lastClickAt: number;
      }>([
        {
          $group: {
            _id: "$ownerId",
            selfClicks: { $sum: { $cond: [{ $eq: ["$kind", "self"] }, 1, 0] } },
            forwardClicks: { $sum: { $cond: [{ $eq: ["$kind", "forward"] }, 1, 0] } },
            forwardVisitors: { $addToSet: { $cond: [{ $eq: ["$kind", "forward"] }, "$visitor", "$$REMOVE"] } },
            firstSelfAt: { $min: { $cond: [{ $eq: ["$kind", "self"] }, "$at", null] } },
            lastClickAt: { $max: "$at" },
          },
        },
      ])
      .toArray(),
    clicks(db)
      .aggregate<{ clicks: number; selfClicks: number; people: number }>([
        {
          $group: {
            _id: null,
            clicks: { $sum: 1 },
            selfClicks: { $sum: { $cond: [{ $eq: ["$kind", "self"] }, 1, 0] } },
            visitors: { $addToSet: "$visitor" },
          },
        },
        { $project: { _id: 0, clicks: 1, selfClicks: 1, people: { $size: "$visitors" } } },
      ])
      .toArray(),
    clicks(db).find({}, { sort: { at: -1 }, limit: 200 }).toArray(),
  ]);

  const byOwner = new Map(grouped.map((row) => [row._id, row]));
  const invitedAt = new Map(sentInvites.map((row) => [row._id, row.firstAt]));
  const rows: WhatsappPartnerRow[] = partners.map((m) => {
    const g = byOwner.get(m._id);
    return {
      marketerId: m._id,
      name: m.displayName,
      code: m.code,
      invitedAt: invitedAt.get(m._id) ?? null,
      joinedAt: g?.firstSelfAt ?? null,
      selfClicks: g?.selfClicks ?? 0,
      forwardClicks: g?.forwardClicks ?? 0,
      forwardPeople: g?.forwardVisitors.length ?? 0,
      lastClickAt: g?.lastClickAt ?? null,
    };
  });
  rows.sort((a, b) => b.forwardClicks - a.forwardClicks || (b.lastClickAt ?? 0) - (a.lastClickAt ?? 0));

  const t = totals[0] ?? { clicks: 0, selfClicks: 0, people: 0 };
  const recentRows: WhatsappClickRow[] = recent.map((doc) => ({
    id: doc._id,
    at: doc.at,
    kind: doc.kind,
    ownerName: doc.ownerName,
    ownerCode: doc.ownerCode,
    openedByName: doc.openerName,
  }));

  return {
    url: settings.whatsappGroupUrl,
    totals: {
      clicks: t.clicks,
      selfClicks: t.selfClicks,
      forwardClicks: t.clicks - t.selfClicks,
      people: t.people,
      partners: rows.length,
      partnersInvited: rows.filter((row) => row.invitedAt !== null).length,
      partnersJoined: rows.filter((row) => row.joinedAt !== null).length,
    },
    partners: rows,
    recent: recentRows,
    lastChange: lastChange ? toLinkChange(lastChange) : null,
  };
}
