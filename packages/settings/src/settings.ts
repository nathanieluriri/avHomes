import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { currentDb, email, readJson, str, type AppEnv } from "@avhomes/core";
import {
  REPLY_IDENTITIES,
  type ClientLogo,
  type Office,
  type ReplyIdentity,
  type SiteSettings,
  type SocialPlatform,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";

/**
 * The facts about this business that only its owner can supply.
 *
 * It used to live in the enquiries package, holding one field, above a comment
 * saying it should move out the day a second unrelated setting arrived. That
 * day is this one: a phone number, an office address and a client list are not
 * enquiry concerns, and enquiries importing a package that owns them would be
 * the cross-feature import the layout exists to prevent. Enquiries now imports
 * THIS, which is the direction that stays legal.
 *
 * EVERY NEW FIELD DEFAULTS TO EMPTY, AND EMPTY MEANS NOT SET. No field here is
 * ever seeded with a plausible-looking value. The site shipped a phone number
 * of `+234 800 000 0000` and five client logos whose files did not exist, and
 * both were read by visitors as evidence that nobody was home. A surface with
 * nothing to show hides its block; it never prints a placeholder.
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
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  offices: Office[];
  clientLogos: ClientLogo[];
  social: Record<SocialPlatform, string>;
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
  contactPhone: "",
  contactEmail: "",
  whatsappNumber: "",
  offices: [],
  clientLogos: [],
  /*
   * Instagram and X carry the accounts the site already advertised and that the
   * QA pass confirmed are real. LinkedIn and Facebook start EMPTY rather than
   * keeping what was there, because what was there was `linkedin.com` and
   * `facebook.com`: not profiles, and not ours to guess.
   */
  social: {
    linkedin: "",
    instagram: "https://www.instagram.com/_avconstruction",
    facebook: "",
    x: "https://x.com/_avconstruction",
  },
  updatedAt: 0,
  revision: 0,
};

/** The fields a PATCH may name, and the order `$setOnInsert` fills the rest. */
const WRITABLE = [
  "replyIdentity",
  "teamName",
  "teamAvatarUrl",
  "contactPhone",
  "contactEmail",
  "whatsappNumber",
  "offices",
  "clientLogos",
  "social",
] as const;

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
    // Every field below post-dates the first release, so a document written
    // before them is missing the key rather than holding an empty one.
    contactPhone: doc.contactPhone ?? "",
    contactEmail: doc.contactEmail ?? "",
    whatsappNumber: doc.whatsappNumber ?? "",
    offices: doc.offices ?? [],
    clientLogos: doc.clientLogos ?? [],
    social: { ...DEFAULTS.social, ...(doc.social ?? {}) },
    updatedAt: doc.updatedAt,
    revision: doc.revision,
  };
}

/**
 * What the public site is allowed to know.
 *
 * `replyIdentity` and `teamName` are how the console decides whose name signs a
 * reply. That is staffing, and it stays behind the session.
 */
export interface PublicSiteSettings {
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  offices: Office[];
  clientLogos: ClientLogo[];
  social: Record<SocialPlatform, string>;
}

export async function readPublicSettings(db: Db): Promise<PublicSiteSettings> {
  const s = await readSettings(db);
  return {
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    whatsappNumber: s.whatsappNumber,
    offices: s.offices,
    clientLogos: s.clientLogos,
    social: s.social,
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

/** Empty, or a real address. The empty case is how a field says "not set". */
const optionalEmail = z.union([z.literal(""), email()]);

/**
 * Digits with the country code first and no `+`, which is the form `wa.me`
 * takes in its path. Storing the display form and stripping it at each call
 * site is how one surface ends up linking to `wa.me/+234 801...`.
 */
const whatsapp = z.union([z.literal(""), str().trim().regex(/^[0-9]{7,15}$/u, "digits")]);

/**
 * An absolute https URL, or empty.
 *
 * `https` specifically: every one of these is rendered as an outbound link in
 * the footer, and a stored `javascript:` or a scheme-relative `//evil` would be
 * an injection through the settings screen.
 */
const socialUrl = z.union([
  z.literal(""),
  str().trim().max(300).regex(/^https:\/\/[^\s]+$/u, "https-url"),
]);

const OfficeBody = z
  .object({
    label: str().min(1).max(80).trim(),
    address: str().min(1).max(240).trim(),
  })
  .strict();

const ClientLogoBody = z
  .object({
    name: str().min(1).max(120).trim(),
    imageUrl: str().min(1).max(600).trim(),
  })
  .strict();

const UpdateBody = z
  .object({
    replyIdentity: z.enum(REPLY_IDENTITIES).optional(),
    teamName: str().min(1).max(120).trim().optional(),
    teamAvatarUrl: str().max(600).trim().optional(),
    contactPhone: str().max(40).trim().optional(),
    contactEmail: optionalEmail.optional(),
    whatsappNumber: whatsapp.optional(),
    offices: z.array(OfficeBody).max(8).optional(),
    clientLogos: z.array(ClientLogoBody).max(16).optional(),
    /* Spelled out rather than built from SOCIAL_PLATFORMS. A generated shape
       needs a cast to satisfy zod's inference, and a cast here would be the one
       place a new platform could slip past validation unnoticed. */
    social: z
      .object({
        linkedin: socialUrl,
        instagram: socialUrl,
        facebook: socialUrl,
        x: socialUrl,
      })
      .partial()
      .strict()
      .optional(),
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
    for (const key of WRITABLE) {
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

export function settingsPublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/public/settings", async (c) => {
    return c.json({ settings: await readPublicSettings(await currentDb(c)) });
  });

  return routes;
}
