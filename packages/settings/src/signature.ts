import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  currentDb,
  currentUser,
  deploymentOrigin,
  readJson,
  type AppEnv,
  type MailMessage,
  type Mailer,
} from "@avhomes/core";
import {
  DEFAULT_SIGNATURE_PREFS,
  MAIL_SETUP_SNOOZE_MS,
  appendSignature,
  companySignatureGaps,
  personSignatureGaps,
  renderSignature,
  resolveSignature,
  type AuthUser,
  type MailSetupItem,
  type MailSetupItemId,
  type MailSetupResponse,
  type PersonSignatureField,
  type RenderedSignature,
  type SignatureCompany,
  type SignaturePerson,
  type SignaturePrefs,
  type SiteSettings,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { readSettings, SignaturePrefsBody } from "./settings";

/**
 * Who signs each email, and the one place a signature is added to mail the
 * app sends. Per member choices live on their mail_prefs row.
 */

/*
 * Mail clients need absolute https image URLs. On Vercel that is the
 * deployment's own origin; off it (a local build, a script) there is no host
 * a recipient could reach, so the production alias serves the images.
 */
const PRODUCTION_ORIGIN = "https://av-homes.vercel.app";

export function signatureOrigin(req: { url: string } = { url: "" }): string {
  const origin = deploymentOrigin(req);
  return /^https?:\/\//u.test(origin) ? origin : PRODUCTION_ORIGIN;
}

interface PrefsRow {
  _id: string;
  signature?: Partial<SignaturePrefs>;
  setupSnoozedUntil?: number;
  setupDismissed?: MailSetupItemId[];
  createdAt: number;
  updatedAt: number;
}

function prefsRows(db: Db) {
  return collection<PrefsRow>(db, COLLECTIONS.mailPrefs);
}

export async function readSignaturePrefs(db: Db, userId: string): Promise<SignaturePrefs> {
  const row = await prefsRows(db).findOne({ _id: userId }, { projection: { signature: 1 } });
  return { ...DEFAULT_SIGNATURE_PREFS, ...(row?.signature ?? {}) };
}

export function companyFacts(site: SiteSettings, origin: string): SignatureCompany {
  const office = site.offices[0];
  return {
    name: site.emailSignature.companyName,
    phone: site.contactPhone,
    email: site.contactEmail,
    officeAddress: office ? office.address : "",
    website: site.emailSignature.website || origin,
    logoUrl: site.emailSignature.logoUrl,
    assetOrigin: origin,
  };
}

export function personOf(user: Pick<AuthUser, "displayName" | "title" | "phone" | "email">): SignaturePerson {
  return { name: user.displayName ?? "", title: user.title ?? "", phone: user.phone ?? "", email: user.email ?? "" };
}

/** The team's signature: invites, codes, notifications, newsletters and team-signed replies. */
export function teamSignature(site: SiteSettings, origin: string): RenderedSignature {
  const person: SignaturePerson = { name: site.teamName, title: "", phone: site.contactPhone, email: site.contactEmail };
  return resolveSignature(site.emailSignature.team, person, companyFacts(site, origin));
}

export async function memberSignature(
  db: Db,
  user: Pick<AuthUser, "id" | "displayName" | "title" | "phone" | "email">,
  origin: string,
  site?: SiteSettings,
): Promise<RenderedSignature> {
  const [prefs, settings] = await Promise.all([readSignaturePrefs(db, user.id), site ?? readSettings(db)]);
  return resolveSignature(prefs, personOf(user), companyFacts(settings, origin));
}

/** A reply to a buyer is signed the way the reply itself is: by the agent, or by the team. */
export async function enquirySignature(
  db: Db,
  user: Pick<AuthUser, "id" | "displayName" | "title" | "phone" | "email">,
  origin: string,
): Promise<RenderedSignature> {
  const site = await readSettings(db);
  return site.replyIdentity === "team" ? teamSignature(site, origin) : memberSignature(db, user, origin, site);
}

export async function companySignature(db: Db, origin = signatureOrigin()): Promise<RenderedSignature> {
  return teamSignature(await readSettings(db), origin);
}

/* ─────────────────────────────── the mailer ─────────────────────────────── */

const TTL_MS = 60_000;
let cachedTeam: { at: number; value: Promise<RenderedSignature | null> } | null = null;

function cachedCompanySignature(resolveDb: () => Promise<Db>): Promise<RenderedSignature | null> {
  const now = Date.now();
  if (cachedTeam && now - cachedTeam.at < TTL_MS) return cachedTeam.value;
  const value = resolveDb()
    .then((db) => companySignature(db))
    .catch((err: unknown) => {
      // Unsigned mail beats no mail.
      console.error("[mail]", JSON.stringify({ signature: err instanceof Error ? err.message : String(err) }));
      cachedTeam = null;
      return null;
    });
  cachedTeam = { at: now, value };
  return value;
}

/**
 * Every message the app sends passes here: the sender's own signature when the
 * route supplied one, the company's otherwise. Already signed mail is left alone.
 */
export function signingMailer(inner: Mailer, resolveDb: () => Promise<Db>): Mailer {
  async function sign(message: MailMessage): Promise<MailMessage> {
    const { signature, ...rest } = message;
    if (signature === false) return rest;
    const sig = signature ?? (await cachedCompanySignature(resolveDb));
    return sig ? appendSignature(rest, sig) : rest;
  }
  return {
    assertConfigured: () => inner.assertConfigured(),
    async send(message) {
      await inner.send(await sign(message));
    },
    ...(inner.sendBatch
      ? {
          async sendBatch(messages: MailMessage[]) {
            await inner.sendBatch?.(await Promise.all(messages.map(sign)));
          },
        }
      : {}),
  };
}

/* ─────────────────────────────── routes ─────────────────────────────── */

export interface MySignatureResponse {
  prefs: SignaturePrefs;
  /** What goes out now. */
  signature: RenderedSignature;
  /** The AV Homes signature, whatever is chosen. */
  standard: RenderedSignature;
  /** For a live preview while the profile is edited. */
  company: SignatureCompany;
  gaps: PersonSignatureField[];
}

async function mySignature(db: Db, user: AuthUser, origin: string): Promise<MySignatureResponse> {
  const [prefs, site] = await Promise.all([readSignaturePrefs(db, user.id), readSettings(db)]);
  const company = companyFacts(site, origin);
  const person = personOf(user);
  return {
    prefs,
    signature: resolveSignature(prefs, person, company),
    standard: renderSignature(person, company),
    company,
    gaps: personSignatureGaps(person),
  };
}

const SetupBody = z
  .object({
    snooze: z.boolean().optional(),
    dismiss: z
      .enum(["company-logo", "company-website"])
      .optional(),
  })
  .strict();

export function signatureRoutes(deps: { senderChosen: (db: Db) => Promise<boolean> }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /* Any member, and only their own row: agents sign enquiry replies too. */
  routes.get("/admin/signature", requireAuth(), async (c) => {
    return c.json(await mySignature(await currentDb(c), currentUser(c), deploymentOrigin(c.req)));
  });

  routes.put("/admin/signature", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const prefs = await readJson(c, SignaturePrefsBody);
    const now = Date.now();
    await prefsRows(db).updateOne(
      { _id: user.id },
      { $set: { signature: prefs, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return c.json(await mySignature(db, user, deploymentOrigin(c.req)));
  });

  /* The setup card on the Mailboxes page. Owner and developer, like the page. */
  routes.get("/admin/mail/setup", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    return c.json(await mailSetup(db, currentUser(c), deps.senderChosen));
  });

  routes.patch("/admin/mail/setup", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, SetupBody);
    const now = Date.now();
    await prefsRows(db).updateOne(
      { _id: user.id },
      {
        $set: { updatedAt: now, ...(body.snooze ? { setupSnoozedUntil: now + MAIL_SETUP_SNOOZE_MS } : {}) },
        ...(body.dismiss ? { $addToSet: { setupDismissed: body.dismiss } } : {}),
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return c.json(await mailSetup(db, user, deps.senderChosen));
  });

  return routes;
}

async function mailSetup(
  db: Db,
  user: AuthUser,
  senderChosen: (db: Db) => Promise<boolean>,
): Promise<MailSetupResponse> {
  const [site, row, chosen] = await Promise.all([
    readSettings(db),
    prefsRows(db).findOne({ _id: user.id }, { projection: { setupSnoozedUntil: 1, setupDismissed: 1 } }),
    senderChosen(db).catch(() => true),
  ]);
  const personGaps = personSignatureGaps(personOf(user));
  const office = site.offices[0]?.address ?? "";
  const companyGaps = companySignatureGaps({
    officeAddress: office,
    website: site.emailSignature.website,
    phone: site.contactPhone,
    email: site.contactEmail,
  });
  const profile = "/admin/profile#signature";
  const settings = "/admin/settings#email-signature";
  const items: MailSetupItem[] = [
    {
      id: "signature-name",
      title: "Add your name",
      description: "It is the first line of your signature.",
      action: { label: "Add name", href: profile },
      optional: false,
      done: !personGaps.includes("name"),
    },
    {
      id: "signature-title",
      title: "Add your job title",
      description: "Your signature shows it under your name, beside the company.",
      action: { label: "Add title", href: profile },
      optional: false,
      done: !personGaps.includes("title"),
    },
    {
      id: "signature-phone",
      title: "Add your phone number",
      description: "Until you do, your signature gives the company number.",
      action: { label: "Add phone", href: profile },
      optional: false,
      done: !personGaps.includes("phone"),
    },
    {
      id: "company-office",
      title: "Add an office address",
      description: "Every signature links it to a map, so people can see where you are.",
      action: { label: "Add office address", href: "/admin/settings#offices" },
      optional: false,
      done: !companyGaps.includes("office"),
    },
    {
      id: "company-phone",
      title: "Add the company phone",
      description: "Mail the team sends, and anyone without their own number, needs one to show.",
      action: { label: "Add phone", href: "/admin/settings" },
      optional: false,
      done: !companyGaps.includes("phone"),
    },
    {
      id: "company-email",
      title: "Add the company email",
      description: "The address system mail and team replies give people to write back to.",
      action: { label: "Add email", href: "/admin/settings" },
      optional: false,
      done: !companyGaps.includes("email"),
    },
    {
      id: "sender-mailbox",
      title: "Choose the mailbox the site sends as",
      description: "Invites, codes and replies go out from the first mailbox until you pick one.",
      action: { label: "Choose mailbox", href: "/admin/settings#email-delivery" },
      optional: false,
      done: chosen,
    },
    {
      id: "company-website",
      title: "Add your website address",
      description: "Signatures link to this site's own address until you set one.",
      action: { label: "Add website", href: settings },
      optional: true,
      done: !companyGaps.includes("website"),
    },
    {
      id: "company-logo",
      title: "Upload a signature logo",
      description: "Optional. Signatures use the round AV Homes logo until you do.",
      action: { label: "Upload logo", href: settings },
      optional: true,
      done: site.emailSignature.logoUrl.trim() !== "",
    },
  ];
  return {
    items,
    snoozedUntil: row?.setupSnoozedUntil ?? 0,
    snoozed: (row?.setupSnoozedUntil ?? 0) > Date.now(),
    dismissed: row?.setupDismissed ?? [],
  };
}
