/**
 * Marketing over HTTP: the app a marketer carries, and the screens an admin
 * settles deals and pays people on.
 *
 * Three routers, split by who is allowed through:
 *
 *  - public: the join page and the two doors into the app. No cookie is read.
 *  - app: `/api/marketing/*`, any signed-in account that has a marketer profile.
 *    An admin gets one made for them the first time they open the app, which is
 *    what "every admin is a marketer" means in practice.
 *  - admin: `/api/admin/marketing/*`, gated by the `marketing` domain.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "mongodb";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
  UnauthenticatedError,
  auditBefore,
  auditEntityId,
  clientIp,
  currentDb,
  currentUser,
  newId,
  readJson,
  readJsonOrEmpty,
  readQuery,
  pathParam,
  str,
  email as emailString,
  type AppEnv,
} from "@avhomes/core";
import {
  ACCOUNT_PROVIDERS,
  DEAL_KINDS,
  LEAD_STATES,
  LEAD_NOTE_MAX,
  LEAD_NOTE_MIN,
  MARKETER_STATUSES,
  MARKETING_UPDATE_STATUSES,
  MARKETING_UPDATE_TONES,
  RENT_BASES,
  UPDATE_BODY_MAX,
  UPDATE_LINK_LABEL_MAX,
  UPDATE_LINK_MAX,
  UPDATE_TITLE_MAX,
  isNuban,
  payMonth,
  previewEarning,
  ratesRefusal,
  updateRefusal,
  leadRefusal,
  namesMatch,
  type Deal,
  type Lead,
  type Marketer,
  type MarketerBank,
  type MarketingSettings,
  type MarketingUpdate,
  type NotificationInput,
} from "@avhomes/contracts";
import {
  burnPasswordTime,
  createSession,
  createUser,
  findCredentialByEmail,
  findUserByEmail,
  hashPassword,
  limit,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from "@avhomes/identity";
import { listBanks, providerState, resolveAccount } from "./bank";
import {
  createLead,
  getLead,
  getLeadFor,
  leadCounts,
  listLeads,
  moveLead,
  noteOnLead,
  winLead,
  withShares,
} from "./leads";
import {
  paystackKeySaved,
  readMarketingSettings,
  writeMarketingSettings,
  writePaystackKey,
} from "./settings";
import { toMarketingUpdate } from "./schema";
import {
  alertsFor,
  balanceFor,
  buildPayRun,
  cancelDeal,
  chainFor,
  claimOn,
  closePayRun,
  createDeal,
  createMarketer,
  createUpdate,
  deleteUpdate,
  findMarketerByCode,
  findMarketerById,
  findMarketerByUser,
  getDeal,
  getDealFor,
  getIssue,
  getPayRun,
  getUpdate,
  holdPayItem,
  listDeals,
  listIssues,
  listLedger,
  listMarketers,
  listPayRuns,
  listUpdates,
  liveUpdates,
  markPayItem,
  marketingCounts,
  openIssue,
  payHistoryFor,
  previewShares,
  reconcile,
  replyToIssue,
  resolveIssue,
  resubmitDeal,
  reviewDeal,
  saveUpdate,
  setMarketerStatus,
  statementFor,
  teamFor,
  updateMarketerBank,
  updateMarketerProfile,
} from "./repo";

/** A marketer signing up is a write, so it is rate limited per address. */
const JOIN_IP_LIMIT = 6;
const JOIN_WINDOW_MS = 60 * 60 * 1000;

const MAX_PROOF_BYTES = 12 * 1024 * 1024;

/** A carousel, not a feed to scroll: the cards an admin wrote, then new listings, eight at most. */
const FEED_MAX = 8;
const LISTING_CARDS_MAX = 3;
/** How long a new listing keeps its card. */
const LISTING_CARD_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A listing as the Updates feed needs it, and nothing more. */
export interface RecentListing {
  id: string;
  title: string;
  city: string;
  /** The first photo, never a video, or empty. */
  imageUrl: string;
  publishedAt: number;
}

export interface MarketingDeps {
  storage?: {
    assertConfigured(): void;
    put(key: string, body: ArrayBuffer, contentType: string): Promise<{ url: string }>;
  };
  /** Reads the real bytes and names the type. Injected, so this package holds no media code. */
  sniff?: (buffer: ArrayBuffer) => { contentType: string; extension: string };
  /** Tells the console something needs a person. Injected at the composition root. */
  notify?: (db: Db, input: NotificationInput) => Promise<void>;
  /**
   * Live listings published since `sinceMs`, newest first, at most `limit`.
   * Injected, because this package may not read the listings package's collection.
   */
  recentListings?: (db: Db, sinceMs: number, limit: number) => Promise<RecentListing[]>;
}

/* ═══════════════════════════════════════════════════════════════════ BODIES ══ */

const BankBody = z
  .object({
    bankCode: str().max(20),
    bankName: str().max(120),
    accountNumber: str().max(20),
  })
  .strict();

const JoinBody = z
  .object({
    displayName: str().min(2).max(120),
    email: emailString(),
    phone: str().min(7).max(30),
    state: str().max(80).default(""),
    password: str().min(8).max(200),
    referrerCode: str().max(24).default(""),
    bank: BankBody.optional(),
  })
  .strict();

const SignInBody = z.object({ email: emailString(), password: str().min(1).max(200) }).strict();

const DealBody = z
  .object({
    listingId: str().max(64),
    listingTitle: str().max(300),
    listingLocation: str().max(200).default(""),
    listingEstate: str().max(200).default(""),
    listingType: z.enum(DEAL_KINDS),
    unitKey: str().max(80).default(""),
    amountMinor: z.number().int().min(1),
    buyerName: str().max(160).default(""),
    buyerPhone: str().max(40).default(""),
    proof: z.array(str().max(600)).min(1).max(5),
    note: str().max(600).default(""),
    closedOn: z.number().int().min(0).default(0),
  })
  .strict();

const ReviewBody = z
  .object({
    status: z.enum(["approved", "rejected", "info"]),
    reason: str().max(400).default(""),
    amountMinor: z.number().int().min(1).optional(),
  })
  .strict();

const ResubmitBody = z
  .object({
    proof: z.array(str().max(600)).min(1).max(5),
    note: str().max(600).default(""),
  })
  .strict();

/* Trimmed before the length check, so trailing spaces never cost a character. */
const UPDATE_FIELDS = {
  title: str().trim().min(1).max(UPDATE_TITLE_MAX),
  body: str().trim().max(UPDATE_BODY_MAX),
  imageUrl: str().trim().max(2000),
  linkLabel: str().trim().max(UPDATE_LINK_LABEL_MAX),
  linkHref: str().trim().max(UPDATE_LINK_MAX),
  tone: z.enum(MARKETING_UPDATE_TONES),
  pinned: z.boolean(),
  status: z.enum(MARKETING_UPDATE_STATUSES),
  // 0 means from now, so a form that leaves the first day empty still saves.
  startsAt: z.number().int().min(0),
  endsAt: z.number().int().min(1).nullable(),
};

const CreateUpdateBody = z
  .object({
    ...UPDATE_FIELDS,
    body: UPDATE_FIELDS.body.default(""),
    imageUrl: UPDATE_FIELDS.imageUrl.default(""),
    linkLabel: UPDATE_FIELDS.linkLabel.default(""),
    linkHref: UPDATE_FIELDS.linkHref.default(""),
    tone: UPDATE_FIELDS.tone.default("wine"),
    pinned: UPDATE_FIELDS.pinned.default(false),
    status: UPDATE_FIELDS.status.default("draft"),
    startsAt: UPDATE_FIELDS.startsAt.default(0),
    endsAt: UPDATE_FIELDS.endsAt.default(null),
  })
  .strict();

const PatchUpdateBody = z.object(UPDATE_FIELDS).partial().strict();

/** The same refusals the console checks before Save, as a 400 naming the field. */
function assertUpdate(update: Parameters<typeof updateRefusal>[0]): void {
  const refusal = updateRefusal(update);
  if (refusal) throw new BadRequestError(refusal.message, [refusal]);
}

/* Trimmed before the length check, so a note of spaces is not four characters. */
const MoveBody = z
  .object({
    to: z.enum(LEAD_STATES),
    reason: str().trim().max(120),
    note: str().trim().min(LEAD_NOTE_MIN).max(LEAD_NOTE_MAX),
  })
  .strict();

const LeadNoteBody = z
  .object({ note: str().trim().min(LEAD_NOTE_MIN).max(LEAD_NOTE_MAX) })
  .strict();

const LeadBody = z
  .object({
    buyerName: str().trim().min(2).max(160),
    buyerPhone: str().trim().min(7).max(40),
    listingId: str().max(64).nullable().default(null),
    listingTitle: str().max(300).default(""),
    wantKind: z.enum(DEAL_KINDS).nullable().default(null),
    wantArea: str().trim().max(160).default(""),
    wantBudgetMinor: z.number().int().min(0).default(0),
    brief: str().trim().max(600).default(""),
  })
  .strict();

const WinBody = z
  .object({
    listingId: str().max(64),
    listingTitle: str().max(300),
    listingLocation: str().max(200).default(""),
    listingEstate: str().max(200).default(""),
    listingType: z.enum(DEAL_KINDS),
    unitKey: str().max(80).default(""),
    amountMinor: z.number().int().min(1),
    closedOn: z.number().int().min(0).default(0),
    reason: str().trim().max(120),
    note: str().trim().min(LEAD_NOTE_MIN).max(LEAD_NOTE_MAX),
  })
  .strict();

const LeadQuery = z
  .object({
    state: z.enum(LEAD_STATES).optional(),
    q: str().trim().max(120).default(""),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();

const SettingsBody = z
  .object({
    saleRates: z.array(z.number()).length(3).optional(),
    rentRates: z.array(z.number()).length(3).optional(),
    rentBasis: z.enum(RENT_BASES).optional(),
    issueWindowDays: z.number().int().min(1).max(90).optional(),
    payCutoffDay: z.number().int().min(1).max(28).optional(),
    requireApproval: z.boolean().optional(),
    joinOpen: z.boolean().optional(),
    blockSelfDeals: z.boolean().optional(),
    minPayoutMinor: z.number().int().min(0).optional(),
    supportPhone: str().max(40).optional(),
    accountProvider: z.enum(ACCOUNT_PROVIDERS).optional(),
    /* The key is write-only. Absent leaves what is saved alone, because the
       form posts every field on every save and can never prefill this one.
       null is how an admin clears it deliberately. */
    paystackKey: str().max(200).nullable().optional(),
  })
  .strict();

/* ══════════════════════════════════════════════════════════════════ PUBLIC ══ */

export function marketingPublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** What the join page needs before anybody types: who invited them, and the banks. */
  routes.get("/public/marketing/join", async (c) => {
    const db = await currentDb(c);
    const code = c.req.query("code") ?? "";
    const settings = await readMarketingSettings(db);
    const referrer = code ? await findMarketerByCode(db, code) : null;
    return c.json({
      open: settings.joinOpen,
      supportPhone: settings.supportPhone,
      rates: settings.saleRates,
      bankCheck: (await providerState(db)).ready,
      referrer:
        referrer && referrer.status === "active"
          ? { code: referrer.code, displayName: referrer.displayName }
          : null,
    });
  });

  routes.get("/public/marketing/banks", async (c) => {
    const db = await currentDb(c);
    const banks = await listBanks();
    c.header("cache-control", "public, max-age=3600");
    return c.json({ banks, checked: (await providerState(db)).ready });
  });

  /** The name on an account, so nobody signs up with a typo for a bank account. */
  routes.post("/public/marketing/resolve-account", async (c) => {
    const body = await readJson(c, BankBody);
    if (!isNuban(body.accountNumber)) {
      throw new BadRequestError("accountNumber", [
        { path: "accountNumber", message: "an account number is ten digits" },
      ]);
    }
    const db = await currentDb(c);
    await limit(db, `bankcheck:${clientIp(c)}`, 20, JOIN_WINDOW_MS);
    const resolved = await resolveAccount(db, body.accountNumber, body.bankCode);
    return c.json({ accountName: resolved?.accountName ?? "", checked: resolved !== null });
  });

  /**
   * Signing up.
   *
   * The account and the marketer profile are made together, and the session is
   * issued here so the app opens already signed in. There is no invite: this is
   * the one door in this system that anybody may walk through, which is why the
   * rate limit sits on it.
   */
  routes.post("/public/marketing/join", async (c) => {
    const body = await readJson(c, JoinBody);
    const db = await currentDb(c);
    await limit(db, `mktjoin:${clientIp(c)}`, JOIN_IP_LIMIT, JOIN_WINDOW_MS);

    const settings = await readMarketingSettings(db);
    if (!settings.joinOpen) {
      throw new PreconditionFailedError("join_closed", {
        detail: "New marketers are not being taken on right now.",
      });
    }

    const address = body.email.trim().toLowerCase();
    const existing = await findUserByEmail(db, address);
    if (existing) {
      throw new PreconditionFailedError("account_exists", {
        detail: "There is already an account for this email. Sign in instead.",
      });
    }

    let bank: MarketerBank | null = null;
    if (body.bank) {
      if (!isNuban(body.bank.accountNumber)) {
        throw new BadRequestError("bank", [
          { path: "bank.accountNumber", message: "an account number is ten digits" },
        ]);
      }
      const resolved = await resolveAccount(db, body.bank.accountNumber, body.bank.bankCode);
      bank = {
        bankCode: body.bank.bankCode,
        bankName: body.bank.bankName,
        accountNumber: body.bank.accountNumber,
        accountName: resolved?.accountName ?? "",
        verifiedAt: resolved?.verifiedAt ?? null,
      };
    }

    const user = await createUser(db, {
      email: address,
      displayName: body.displayName.trim(),
      role: "marketer",
      passwordHash: await hashPassword(body.password),
    });

    const marketer = await createMarketer(db, {
      userId: user.id,
      displayName: body.displayName.trim(),
      email: address,
      phone: body.phone.trim(),
      state: body.state.trim(),
      referrerCode: body.referrerCode.trim(),
      bank,
      isAdmin: false,
    });

    const { token, expiresAt } = await createSession(db, user.id, c.req.header("user-agent") ?? null);
    setSessionCookie(c, token, expiresAt);
    auditEntityId(c, marketer.id);
    return c.json({ marketer }, 201);
  });

  /**
   * The marketer's own door.
   *
   * Separate from the console's door on purpose: which door the console uses is
   * a deployment setting, and a marketer must be able to sign in either way.
   * Console accounts are refused here and sent to the console's own sign in.
   */
  routes.post("/public/marketing/sign-in", async (c) => {
    const body = await readJson(c, SignInBody);
    const db = await currentDb(c);
    const ip = clientIp(c);
    await limit(db, `mktlogin:${ip}`, 10, JOIN_WINDOW_MS);

    const found = await findCredentialByEmail(db, body.email);
    if (!found) {
      // Pay for a hash anyway, so an unknown address takes as long as a known one.
      await burnPasswordTime(body.password);
      throw new UnauthenticatedError("no account for that address, or the password is wrong");
    }
    if (found.disabledAt != null) {
      throw new ForbiddenError("this account has been closed");
    }
    if (!(await verifyPassword(body.password, found.passwordHash))) {
      throw new UnauthenticatedError("no account for that address, or the password is wrong");
    }

    const { token, expiresAt } = await createSession(
      db,
      found.user.id,
      c.req.header("user-agent") ?? null,
    );
    setSessionCookie(c, token, expiresAt);
    return c.json({ user: found.user });
  });

  return routes;
}

/* ═════════════════════════════════════════════════════════════════════ APP ══ */

/**
 * The marketer behind this request.
 *
 * An admin who has never opened the app gets a profile made on the spot, under
 * the founder, because the owner asked that every admin be a marketer without
 * having to sign up for it.
 */
async function currentMarketer(db: Db, c: Parameters<typeof currentUser>[0]): Promise<Marketer> {
  const user = currentUser(c);
  const found = await findMarketerByUser(db, user.id);
  if (found) return found;

  if (user.role === "marketer") {
    // A marketer account with no profile cannot happen through the join route.
    throw new NotFoundError("marketer profile");
  }
  return createMarketer(db, {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    phone: "",
    state: "",
    referrerCode: "",
    bank: null,
    isAdmin: true,
  });
}

function assertActive(marketer: Marketer): void {
  if (marketer.status === "active") return;
  throw new ForbiddenError(
    marketer.status === "paused"
      ? "your account is paused, so you cannot report a deal right now"
      : "your account has been closed",
  );
}

/** A deal as one marketer reads it: their own share, and a buyer only if the buyer is theirs. */
function dealView(deal: Deal, marketerId: string) {
  const mine = deal.reporterId === marketerId;
  return {
    // Somebody else's buyer is not this marketer's business.
    deal: mine ? deal : { ...deal, buyerName: "", buyerPhone: "" },
    myShare: deal.shares.find((share) => share.marketerId === marketerId) ?? null,
  };
}

/** A new listing's card. Made on every read and never stored, so a withdrawn listing loses it at once. */
function listingCard(listing: RecentListing): MarketingUpdate {
  const city = listing.city.trim();
  return {
    id: listing.id,
    // The home's name is what a marketer scans a banner for; "new" is the small print.
    title: listing.title.trim() || "New on AV Homes",
    body: city !== "" ? `Just listed in ${city}` : "Just listed on AV Homes",
    imageUrl: listing.imageUrl,
    linkLabel: "Share it",
    linkHref: `/m/listings?focus=${encodeURIComponent(listing.id)}`,
    tone: "gold",
    pinned: false,
    status: "live",
    startsAt: listing.publishedAt,
    endsAt: listing.publishedAt + LISTING_CARD_DAYS * DAY_MS,
    createdByName: "AV Homes",
    createdAt: listing.publishedAt,
    updatedAt: listing.publishedAt,
    source: "listing",
  };
}

export function marketingAppRoutes(deps: MarketingDeps = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** Everything the app's home screen needs, in one read. */
  routes.get("/marketing/me", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const settings = await readMarketingSettings(db);
    const bankCheck = (await providerState(db)).ready;
    const [balance, team, alerts] = await Promise.all([
      balanceFor(db, marketer.id, settings.currency),
      teamFor(db, marketer.id),
      alertsFor(db, marketer, settings, { bankCheck }),
    ]);
    return c.json({
      marketer,
      balance,
      levels: team.levels,
      rates: { sale: settings.saleRates, rent: settings.rentRates },
      supportPhone: settings.supportPhone,
      bankCheck,
      isAdmin: currentUser(c).role !== "marketer",
      // The bell's number: only what they must act on.
      alertCount: alerts.filter((alert) => alert.tone === "act").length,
    });
  });

  /** What the marketer should handle, act first. Worked out on every read. */
  routes.get("/marketing/alerts", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const settings = await readMarketingSettings(db);
    return c.json({
      items: await alertsFor(db, marketer, settings, { bankCheck: (await providerState(db)).ready }),
    });
  });

  /**
   * The Updates carousel.
   *
   * What an admin wrote and set live comes first, pinned cards leading, then a
   * card for each listing published in the last three weeks. A listing an admin
   * already wrote a card linking to does not get a second one.
   */
  routes.get("/marketing/updates", requireAuth(), async (c) => {
    const db = await currentDb(c);
    await currentMarketer(db, c);
    const now = Date.now();
    const written = await liveUpdates(db, now, FEED_MAX);
    const room = Math.min(LISTING_CARDS_MAX, FEED_MAX - written.length);
    const listings =
      room > 0 && deps.recentListings
        ? await deps.recentListings(db, now - LISTING_CARD_DAYS * DAY_MS, room)
        : [];
    const linked = new Set(written.map((update) => update.linkHref));
    const cards = listings.map(listingCard).filter((card) => !linked.has(card.linkHref));
    return c.json({ items: [...written, ...cards].slice(0, FEED_MAX) });
  });

  routes.patch("/marketing/me", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const body = await readJson(
      c,
      z
        .object({
          displayName: str().min(2).max(120).optional(),
          phone: str().max(30).optional(),
          state: str().max(80).optional(),
        })
        .strict(),
    );
    return c.json({ marketer: await updateMarketerProfile(db, marketer.id, body) });
  });

  routes.put("/marketing/me/bank", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const body = await readJson(c, BankBody);
    if (!isNuban(body.accountNumber)) {
      throw new BadRequestError("accountNumber", [
        { path: "accountNumber", message: "an account number is ten digits" },
      ]);
    }
    const resolved = await resolveAccount(db, body.accountNumber, body.bankCode);
    const bank: MarketerBank = {
      bankCode: body.bankCode,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      accountName: resolved?.accountName ?? marketer.bank?.accountName ?? "",
      verifiedAt: resolved?.verifiedAt ?? null,
    };
    const after = await updateMarketerBank(db, marketer.id, bank);
    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-bank",
        title: `${marketer.displayName} changed their bank account`,
        body: `${bank.bankName}, account ending ${bank.accountNumber.slice(-4)}.`,
        href: `/admin/marketers/${marketer.id}`,
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json({ marketer: after });
  });

  routes.get("/marketing/team", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const team = await teamFor(db, marketer.id);
    return c.json({ levels: team.levels, members: team.members });
  });

  routes.get("/marketing/deals", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const scope = c.req.query("scope") === "team" ? "team" : "mine";
    const page = await listDeals(db, {
      limit: 50,
      ...(scope === "mine" ? { reporterId: marketer.id } : { sharedWith: marketer.id }),
    });
    // A team deal shows what THIS marketer earned from it, not the whole deal.
    const items = page.items.map((deal) => ({
      ...deal,
      myShare: deal.shares.find((share) => share.marketerId === marketer.id) ?? null,
      // Somebody else's buyer is not this marketer's business.
      buyerName: deal.reporterId === marketer.id ? deal.buyerName : "",
      buyerPhone: deal.reporterId === marketer.id ? deal.buyerPhone : "",
    }));
    return c.json({ items, total: page.total });
  });

  /** What this deal would pay, before it is sent. The app shows it as a promise of nothing. */
  routes.post("/marketing/deals/preview", requireAuth(), async (c) => {
    const db = await currentDb(c);
    await currentMarketer(db, c);
    const body = await readJson(
      c,
      z.object({ amountMinor: z.number().int().min(0), listingType: z.enum(DEAL_KINDS) }).strict(),
    );
    const settings = await readMarketingSettings(db);
    const rates = body.listingType === "rent" ? settings.rentRates : settings.saleRates;
    return c.json({ amountMinor: previewEarning(body.amountMinor, rates), rate: rates[0] });
  });

  routes.post("/marketing/deals", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const body = await readJson(c, DealBody);
    const settings = await readMarketingSettings(db);

    const claim = await claimOn(db, body.listingId, body.unitKey);
    const deal = await createDeal(
      db,
      marketer,
      { ...body, currency: settings.currency },
      settings,
    );
    auditEntityId(c, deal.id);

    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-deal",
        title: `${marketer.displayName} reported a deal`,
        body: `${body.listingTitle}. Check the proof and approve it.`,
        href: "/admin/marketers/deals",
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json(
      {
        deal,
        // Said plainly rather than refused: an admin decides between two claims.
        alsoClaimed: claim && claim.reporterId !== marketer.id ? true : false,
      },
      201,
    );
  });

  /** One deal, for the marketer who reported it or one it pays. Anyone else gets the 404 a missing id gets. */
  routes.get("/marketing/deals/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const id = pathParam(c, "id");
    const deal = await getDealFor(db, id, marketer.id);
    if (!deal) throw new NotFoundError(`deal ${id}`);
    return c.json(dealView(deal, marketer.id));
  });

  /** The answer to "Need more info": new proof, a line of explanation, and back in the queue. */
  routes.post("/marketing/deals/:id/resubmit", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const id = pathParam(c, "id");
    const body = await readJson(c, ResubmitBody);
    const deal = await resubmitDeal(db, id, marketer, body);
    auditEntityId(c, deal.id);

    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-deal",
        title: `${marketer.displayName} sent more for a deal`,
        body: `${deal.listingTitle}. They answered what you asked for, so it is waiting to be checked again.`,
        href: `/admin/marketers/deals/${deal.id}`,
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json(dealView(deal, marketer.id));
  });

  /* ═══ BUYERS ════════════════════════════════════════════════════════════ */

  /** One lead, with this marketer's share on it. Same shape the list returns. */
  async function one(db: Db, lead: Lead, marketerId: string) {
    const [row] = await withShares(db, [lead], marketerId);
    return row;
  }

  /** Everyone this marketer handed over, newest movement first. */
  routes.get("/marketing/leads", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const page = await listLeads(db, { reporterId: marketer.id, limit: 100 });
    const items = await withShares(db, page.items, marketer.id);
    return c.json({ items, total: page.total });
  });

  routes.post("/marketing/leads", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const body = await readJson(c, LeadBody);
    const refusal = leadRefusal(body);
    if (refusal) throw new BadRequestError(refusal.message, [refusal]);

    const settings = await readMarketingSettings(db);
    const lead = await createLead(db, marketer, body, settings);
    auditEntityId(c, lead.id);

    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-deal",
        title: `${marketer.displayName} logged a buyer`,
        body: `${lead.buyerName}. Reach them and move it along.`,
        href: `/admin/marketers/buyers/${lead.id}`,
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json(await one(db, lead, marketer.id), 201);
  });

  /** Theirs, or the 404 a missing id gets. Somebody else's buyer is not their business. */
  routes.get("/marketing/leads/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const id = pathParam(c, "id");
    const lead = await getLeadFor(db, id, marketer.id);
    if (!lead) throw new NotFoundError(`lead ${id}`);
    return c.json(await one(db, lead, marketer.id));
  });

  /**
   * The marketer closing their own buyer.
   *
   * Only `lost`, and `moveLead` enforces that rather than trusting this route:
   * the rule belongs next to the write, where the admin path cannot route
   * around it either.
   */
  routes.post("/marketing/leads/:id/state", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const id = pathParam(c, "id");
    const found = await getLeadFor(db, id, marketer.id);
    if (!found) throw new NotFoundError(`lead ${id}`);

    const body = await readJson(c, MoveBody);
    const lead = await moveLead(db, id, body.to, body, {
      id: marketer.id,
      name: marketer.displayName,
      side: "marketer",
    });
    auditEntityId(c, lead.id);

    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-deal",
        title: `${marketer.displayName} closed a buyer`,
        body: `${lead.buyerName}. ${body.reason}.`,
        href: `/admin/marketers/buyers/${lead.id}`,
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json(await one(db, lead, marketer.id));
  });

  routes.post("/marketing/leads/:id/note", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const id = pathParam(c, "id");
    const found = await getLeadFor(db, id, marketer.id);
    if (!found) throw new NotFoundError(`lead ${id}`);

    const body = await readJson(c, LeadNoteBody);
    const lead = await noteOnLead(db, id, body.note, {
      id: marketer.id,
      name: marketer.displayName,
      side: "marketer",
    });
    auditEntityId(c, lead.id);
    return c.json(await one(db, lead, marketer.id));
  });

  routes.get("/marketing/money", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const settings = await readMarketingSettings(db);
    const [balance, lines, payments] = await Promise.all([
      balanceFor(db, marketer.id, settings.currency),
      listLedger(db, marketer.id, 60),
      payHistoryFor(db, marketer.id, 24),
    ]);
    return c.json({
      balance,
      lines,
      payments,
      bank: marketer.bank,
      issueWindowDays: settings.issueWindowDays,
      month: payMonth(Date.now()),
    });
  });

  /** Every money event, for the history screen. Filtered on the client: a
      marketer's statement is small enough that a round trip per filter tap
      would be slower than the filter itself. */
  routes.get("/marketing/statement", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const items = await statementFor(db, marketer.id, 400);
    return c.json({ items, joinedAt: marketer.joinedAt });
  });

  routes.post("/marketing/issues", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const body = await readJson(
      c,
      z.object({ payRunId: str().max(64), text: str().max(600).default("") }).strict(),
    );
    const settings = await readMarketingSettings(db);
    const issue = await openIssue(db, marketer, body.payRunId, body.text, settings);
    auditEntityId(c, issue.id);
    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-issue",
        title: `${marketer.displayName} did not get their payment`,
        body: `${issue.month}. They say the transfer never arrived.`,
        href: "/admin/marketers/problems",
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    return c.json({ issue }, 201);
  });

  routes.get("/marketing/issues", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    return c.json({ items: await listIssues(db, { marketerId: marketer.id, limit: 20 }) });
  });

  routes.post("/marketing/issues/:id/reply", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const id = pathParam(c, "id");
    const issue = await getIssue(db, id);
    if (!issue || issue.marketerId !== marketer.id) throw new NotFoundError(`payment problem ${id}`);
    const body = await readJson(c, z.object({ text: str().min(1).max(600) }).strict());
    return c.json({
      issue: await replyToIssue(db, id, {
        byName: marketer.displayName,
        bySide: "marketer",
        text: body.text,
        proof: [],
      }),
    });
  });

  routes.post("/marketing/issues/:id/close", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const id = pathParam(c, "id");
    const issue = await getIssue(db, id);
    if (!issue || issue.marketerId !== marketer.id) throw new NotFoundError(`payment problem ${id}`);
    await readJsonOrEmpty(c, z.object({}).strict());
    return c.json({
      issue: await resolveIssue(db, id, {
        byName: marketer.displayName,
        bySide: "marketer",
        text: "Got it now, thank you.",
      }),
    });
  });

  /**
   * Proof of a deal, straight from a phone camera.
   *
   * The console's image library is an admin surface a marketer cannot reach, so
   * this is its own upload: same storage, same byte sniffing, but the file is
   * not added to anybody's media library.
   */
  routes.post("/marketing/uploads", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    if (!deps.storage || !deps.sniff) {
      throw new PreconditionFailedError("uploads_unavailable", {
        detail: "File storage is not set up on this site yet.",
      });
    }
    deps.storage.assertConfigured();

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new BadRequestError("file", [{ path: "file", message: "a file is required" }]);
    }
    if (file.size > MAX_PROOF_BYTES) {
      throw new BadRequestError("file", [
        { path: "file", message: "that photo is over 12MB. Take it again at a smaller size." },
      ]);
    }
    const buffer = await file.arrayBuffer();
    const sniffed = deps.sniff(buffer);
    const key = `marketing/${newId("deal", Date.now())}.${sniffed.extension}`;
    const stored = await deps.storage.put(key, buffer, sniffed.contentType);
    return c.json({ url: stored.url }, 201);
  });

  return routes;
}

/* ═══════════════════════════════════════════════════════════════════ ADMIN ══ */

/* No deps: everything the console does here is a database write. The app's
   own routes are the ones that have to tell somebody. */
export function marketingAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/marketing/counts", requireAuth(), async (c) => {
    const db = await currentDb(c);
    return c.json({ counts: await marketingCounts(db) });
  });

  routes.get("/admin/marketing/settings", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const [settings, provider, keySaved] = await Promise.all([
      readMarketingSettings(db),
      providerState(db),
      paystackKeySaved(db),
    ]);
    // The key itself never leaves the server; the console only needs to know
    // whether one is saved so it can say so and offer to replace it.
    return c.json({ settings, bankCheck: provider.ready, paystackKeySaved: keySaved });
  });

  routes.patch("/admin/marketing/settings", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, SettingsBody);
    for (const key of ["saleRates", "rentRates"] as const) {
      const value = body[key];
      if (!value) continue;
      const refusal = ratesRefusal(value);
      if (refusal) throw new BadRequestError(key, [{ path: key, message: refusal }]);
    }
    const { paystackKey, ...rest } = body;
    if (paystackKey !== undefined) await writePaystackKey(db, paystackKey);
    const settings = await writeMarketingSettings(db, rest as Partial<MarketingSettings>);
    const [provider, keySaved] = await Promise.all([providerState(db), paystackKeySaved(db)]);
    return c.json({ settings, bankCheck: provider.ready, paystackKeySaved: keySaved });
  });

  routes.get("/admin/marketing/marketers", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const q = readQuery(
      c,
      z
        .object({
          status: z.enum(MARKETER_STATUSES).optional(),
          q: str().max(120).optional(),
        })
        .strict(),
    );
    const page = await listMarketers(db, { status: q.status, q: q.q, limit: 100 });
    return c.json(page);
  });

  routes.get("/admin/marketing/marketers/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const marketer = await findMarketerById(db, id);
    if (!marketer) throw new NotFoundError(`marketer ${id}`);
    const settings = await readMarketingSettings(db);
    const [balance, team, chain, deals, lines, payments] = await Promise.all([
      balanceFor(db, id, settings.currency),
      teamFor(db, id),
      chainFor(db, id),
      listDeals(db, { reporterId: id, limit: 25 }),
      listLedger(db, id, 25),
      payHistoryFor(db, id, 12),
    ]);
    return c.json({
      marketer,
      balance,
      levels: team.levels,
      members: team.members,
      upline: chain.slice(1),
      deals: deals.items,
      lines,
      payments,
    });
  });

  routes.post("/admin/marketing/marketers/:id/status", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(
      c,
      z.object({ status: z.enum(MARKETER_STATUSES), reason: str().max(300).default("") }).strict(),
    );
    const marketer = await setMarketerStatus(db, id, body.status, body.reason);
    return c.json({ marketer });
  });

  routes.get("/admin/marketing/deals", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const q = readQuery(
      c,
      z
        .object({
          status: z.enum(["pending", "approved", "rejected", "info", "cancelled"]).optional(),
          q: str().max(120).optional(),
        })
        .strict(),
    );
    const page = await listDeals(db, { status: q.status, q: q.q, limit: 60 });
    return c.json(page);
  });

  /**
   * Check a marketer's bank account, now, from the console.
   *
   * THE ACCOUNT RESOLVING IS THE VERIFICATION. Whether the returned name looks
   * like the marketer's name is reported and never enforced: a wife's account,
   * a business name, a middle name nobody uses and a bank that puts the surname
   * first are all ordinary, and refusing those would send an admin back to
   * typing names by hand. So the name is saved either way and the console shows
   * both, with `matches` as advice.
   */
  routes.post("/admin/marketing/marketers/:id/verify-bank", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const marketer = await findMarketerById(db, id);
    if (!marketer) throw new NotFoundError(`marketer ${id}`);
    if (!marketer.bank) {
      throw new PreconditionFailedError("no_bank", {
        detail: "This marketer has not added a bank account yet.",
      });
    }

    const resolved = await resolveAccount(db, marketer.bank.accountNumber, marketer.bank.bankCode);
    if (!resolved) {
      return c.json({
        marketer,
        found: false,
        matches: false,
        accountName: "",
        detail: "That account number and bank did not match any account.",
      });
    }

    const bank: MarketerBank = {
      ...marketer.bank,
      accountName: resolved.accountName,
      verifiedAt: resolved.verifiedAt,
    };
    const after = await updateMarketerBank(db, marketer.id, bank);
    auditEntityId(c, marketer.id);

    return c.json({
      marketer: after,
      found: true,
      accountName: resolved.accountName,
      matches: namesMatch(resolved.accountName, marketer.displayName),
      detail: "",
    });
  });

  routes.get("/admin/marketing/deals/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const deal = await getDeal(db, id);
    if (!deal) throw new NotFoundError(`deal ${id}`);
    const settings = await readMarketingSettings(db);
    const [shares, other] = await Promise.all([
      deal.status === "approved"
        ? Promise.resolve(deal.shares)
        : previewShares(db, deal, deal.amountMinor, settings),
      listDeals(db, { limit: 5, q: "" }).then((page) =>
        page.items.filter(
          (row) =>
            row.id !== deal.id &&
            row.listingId === deal.listingId &&
            row.unitKey === deal.unitKey &&
            ["pending", "approved"].includes(row.status),
        ),
      ),
    ]);
    return c.json({ deal, shares, alsoClaimed: other, rates: settings });
  });

  routes.post("/admin/marketing/deals/:id/review", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, ReviewBody);
    const settings = await readMarketingSettings(db);
    const deal = await reviewDeal(
      db,
      id,
      { ...body, actorId: user.id, actorName: user.displayName },
      settings,
    );
    return c.json({ deal });
  });

  routes.post("/admin/marketing/deals/:id/cancel", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, z.object({ reason: str().max(400).default("") }).strict());
    const deal = await cancelDeal(db, id, body.reason, { id: user.id, name: user.displayName });
    return c.json({ deal });
  });

  /* ═══ BUYERS ════════════════════════════════════════════════════════════ */

  routes.get("/admin/marketing/leads", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const query = readQuery(c, LeadQuery);
    const [page, counts] = await Promise.all([
      listLeads(db, { limit: query.limit, q: query.q, ...(query.state ? { state: query.state } : {}) }),
      leadCounts(db),
    ]);
    return c.json({ items: page.items, total: page.total, counts });
  });

  routes.get("/admin/marketing/leads/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const lead = await getLead(db, id);
    if (!lead) throw new NotFoundError(`lead ${id}`);
    return c.json(lead);
  });

  /**
   * Any state but `won`, which needs an amount and goes through `convert`.
   *
   * Leaving `won` un-mints the money, and `moveLead` does that by cancelling the
   * deal rather than by deleting anything: the marketer keeps a readable history
   * and a clawback line if they had already been paid.
   */
  routes.post("/admin/marketing/leads/:id/state", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const before = await getLead(db, id);
    if (!before) throw new NotFoundError(`lead ${id}`);
    auditBefore(c, before as unknown as Record<string, unknown>);

    const body = await readJson(c, MoveBody);
    const lead = await moveLead(db, id, body.to, body, {
      id: user.id,
      name: user.displayName,
      side: "admin",
    });
    auditEntityId(c, lead.id);
    return c.json(lead);
  });

  routes.post("/admin/marketing/leads/:id/note", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, LeadNoteBody);
    const lead = await noteOnLead(db, id, body.note, {
      id: user.id,
      name: user.displayName,
      side: "admin",
    });
    auditEntityId(c, lead.id);
    return c.json(lead);
  });

  /** They bought. Mints the deal, approves it, and the ledger does the rest. */
  routes.post("/admin/marketing/leads/:id/convert", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const before = await getLead(db, id);
    if (!before) throw new NotFoundError(`lead ${id}`);
    auditBefore(c, before as unknown as Record<string, unknown>);

    const reporter = await findMarketerById(db, before.reporterId);
    if (!reporter) throw new NotFoundError(`marketer ${before.reporterId}`);

    const body = await readJson(c, WinBody);
    const settings = await readMarketingSettings(db);
    const { lead, dealId } = await winLead(
      db,
      id,
      { ...body, closedOn: body.closedOn || Date.now() },
      reporter,
      { id: user.id, name: user.displayName, side: "admin" },
      settings,
    );
    auditEntityId(c, lead.id);
    return c.json({ lead, dealId });
  });

  routes.get("/admin/marketing/pay-runs", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const settings = await readMarketingSettings(db);
    const [runs, counts] = await Promise.all([listPayRuns(db, 24), marketingCounts(db)]);
    return c.json({ items: runs, counts, settings });
  });

  routes.post("/admin/marketing/pay-runs", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJsonOrEmpty(
      c,
      z.object({ month: str().max(7).optional() }).strict(),
    );
    const settings = await readMarketingSettings(db);
    const month = body.month && body.month !== "" ? body.month : payMonth(Date.now());
    const run = await buildPayRun(db, month, settings, user.displayName);
    auditEntityId(c, run.id);
    return c.json({ run }, 201);
  });

  routes.get("/admin/marketing/pay-runs/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const run = await getPayRun(db, id);
    if (!run) throw new NotFoundError(`pay run ${id}`);
    return c.json({ run, check: await reconcile(db) });
  });

  routes.post("/admin/marketing/pay-runs/:id/pay", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(
      c,
      z
        .object({
          marketerId: str().max(64),
          reference: str().max(120).default(""),
          proof: z.array(str().max(600)).max(3).default([]),
        })
        .strict(),
    );
    const run = await markPayItem(db, id, body.marketerId, {
      proof: body.proof,
      reference: body.reference,
      paidByName: user.displayName,
    });
    return c.json({ run });
  });

  routes.post("/admin/marketing/pay-runs/:id/hold", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(
      c,
      z.object({ marketerId: str().max(64), note: str().max(300).default("") }).strict(),
    );
    return c.json({ run: await holdPayItem(db, id, body.marketerId, body.note) });
  });

  routes.post("/admin/marketing/pay-runs/:id/close", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    await readJsonOrEmpty(c, z.object({}).strict());
    return c.json({ run: await closePayRun(db, id) });
  });

  routes.get("/admin/marketing/issues", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const status = c.req.query("status");
    return c.json({
      items: await listIssues(db, {
        status: status === "resolved" ? "resolved" : status === "open" ? "open" : undefined,
        limit: 50,
      }),
    });
  });

  routes.post("/admin/marketing/issues/:id/reply", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(
      c,
      z
        .object({ text: str().min(1).max(600), proof: z.array(str().max(600)).max(3).default([]) })
        .strict(),
    );
    return c.json({
      issue: await replyToIssue(db, id, {
        byName: user.displayName,
        bySide: "admin",
        text: body.text,
        proof: body.proof,
      }),
    });
  });

  routes.post("/admin/marketing/issues/:id/resolve", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, z.object({ text: str().max(600).default("") }).strict());
    return c.json({
      issue: await resolveIssue(db, id, {
        byName: user.displayName,
        bySide: "admin",
        text: body.text || "Sorted.",
      }),
    });
  });

  /* ─────────────────────────────── updates ─────────────────────────────── */

  routes.get("/admin/marketing/updates", requireAuth(), async (c) => {
    const db = await currentDb(c);
    return c.json({ items: await listUpdates(db, 100) });
  });

  routes.post("/admin/marketing/updates", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, CreateUpdateBody);
    const input = { ...body, startsAt: body.startsAt === 0 ? Date.now() : body.startsAt };
    assertUpdate(input);
    const update = await createUpdate(db, input, { id: user.id, name: user.displayName });
    auditEntityId(c, update.id);
    return c.json({ update }, 201);
  });

  routes.patch("/admin/marketing/updates/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, PatchUpdateBody);
    const current = await getUpdate(db, id);
    if (!current) throw new NotFoundError(`update ${id}`);
    auditBefore(c, current as unknown as Record<string, unknown>);
    const patch = body.startsAt === 0 ? { ...body, startsAt: Date.now() } : body;
    // Checked as the card will stand after the write, not as the patch alone.
    assertUpdate({ ...toMarketingUpdate(current), ...patch });
    return c.json({ update: await saveUpdate(db, id, patch) });
  });

  routes.delete("/admin/marketing/updates/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const current = await getUpdate(db, id);
    if (!current) throw new NotFoundError(`update ${id}`);
    auditBefore(c, current as unknown as Record<string, unknown>);
    await deleteUpdate(db, id);
    return c.json({ ok: true });
  });

  return routes;
}
