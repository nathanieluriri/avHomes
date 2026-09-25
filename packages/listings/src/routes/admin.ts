import { Hono } from "hono";
import { z } from "zod";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
  StaleWriteError,
  assertCursorSort,
  auditBatch,
  auditBefore,
  auditEntityId,
  auditItem,
  clampLimit,
  currentDb,
  currentUser,
  logLine,
  pathParam,
  readJson,
  readJsonOrEmpty,
  readQuery,
  requestId,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  ASSIGNABLE_ROLES,
  AMENITY_LENGTH_MAX,
  AMENITY_MAX,
  BUILD_STAGES,
  FEE_KINDS,
  FEE_KINDS_FOR,
  FURNISHINGS,
  LISTING_TYPES,
  limitRefusal,
  NO_PARTNER,
  PROPERTY_STATUSES,
  OWNERSHIPS,
  PROPERTY_TYPES,
  PROTOTYPE_KINDS,
  PROTOTYPES_MAX,
  RENT_PERIODS,
  TITLE_DOCUMENTS,
  UNTITLED_LISTING,
  canFeature,
  derivedEstateColumns,
  fieldsFor,
  PUBLIC_PROPERTY_STATUSES,
  isAdminRole,
  isEstate,
  listingPublishBlockers,
  MAP_LINK_MAX,
  mapLinkRefusal,
  minStayUnit,
  moneyRefusalMessage,
  normalizeAmenities,
  normalizeFees,
  parseMajor,
  partnerScopeOf,
  PREVIOUS_SLUGS_MAX,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  toHandle,
  type AuthUser,
  type ListingFee,
  type Property,
  type SiteStat,
  type Testimonial,
} from "@avhomes/contracts";
import { type Db } from "@avhomes/db";
import { findUserById, limitsForPartner, requireAdmin, requireAuth } from "@avhomes/identity";
import { assertAuthorized, isScopedCaller } from "../authorize";
import { expandMapLink } from "../maps";
import {
  LISTING_KINDS,
  TRANSITIONS,
  countProperties,
  createProperty,
  deleteSiteStat,
  deleteTestimonial,
  getPropertyById,
  isSlugTaken,
  listProperties,
  listSiteStats,
  listTestimonials,
  assertTransition,
  partnerListingUsage,
  saveProperty,
  transitionProperty,
  trashProperty,
  upsertSiteStat,
  upsertTestimonial,
  type LifecycleOp,
  type PropertyPatch,
} from "../repo";
import { PROPERTY_SORT_NAMES } from "../schema";

/**
 * A fee as the form sends it: an amount in major units, exactly as the price
 * input works, not the minor-unit integer the document stores.
 */
const FeeInput = z
  .object({
    kind: z.enum(FEE_KINDS),
    amount: str().max(30),
    /** Defaults to the patch's (or listing's) own currency; set only to disagree. */
    currency: str().length(3).toUpperCase().optional(),
  })
  .strict();

/** One option inside an estate. Stored as sent; minor units, unlike a fee. */
const PrototypeInput = z
  .object({
    id: str().regex(/^pt_[a-z0-9]{6,40}$/u),
    kind: z.enum(PROTOTYPE_KINDS),
    name: str().max(120),
    bedrooms: z.number().int().min(0).max(20),
    bathrooms: z.number().int().min(0).max(20),
    sizeSqm: z.number().int().min(0).max(10_000_000),
    priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    image: str().max(2000).nullable(),
    available: z.boolean(),
  })
  .strict();

const PaymentPlanInput = z
  .object({
    depositPercent: z.number().int().min(1).max(100),
    months: z.number().int().min(1).max(120),
    note: str().max(200).default(""),
  })
  .strict();

/**
 * `status`, `publishedAt` and `revision` are ABSENT on purpose: status moves only
 * through the lifecycle routes. The schema is `.strict()`, so a body carrying one
 * is REFUSED rather than accepted and discarded.
 *
 * `slug` is accepted as the search listing's URL handle. The server normalises
 * it, refuses one another listing holds, and keeps the old address as a
 * redirect, so a published link never breaks when it changes.
 */
const PatchBody = z
  .object({
    title: str().min(1).max(300),
    tagline: str().max(300),
    description: str().max(20_000),
    priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: str().length(3).toUpperCase(),
    listingType: z.enum(LISTING_TYPES),
    // Null on a sale. A sale carrying a non-null period is refused, not
    // silently nulled: see the check beside the PATCH route below.
    rentPeriod: z.enum(RENT_PERIODS).nullable(),
    fees: z.array(FeeInput).max(FEE_KINDS.length),
    type: z.enum(PROPERTY_TYPES),
    location: str().max(200),
    city: str().max(120),
    address: str().max(300),
    /* Checked for shape below, not here: a refusal has to name Google Maps and
       say where the Share button is, which a length ceiling cannot. */
    mapUrl: str().max(MAP_LINK_MAX),
    bedrooms: z.number().int().min(0).max(100),
    bathrooms: z.number().int().min(0).max(100),
    areaSqft: z.number().int().min(0).max(10_000_000),
    parkingSpaces: z.number().int().min(0).max(100),
    yearBuilt: z.number().int().min(1800).max(2200),
    featured: z.boolean(),
    amenities: z.array(str().max(AMENITY_LENGTH_MAX)).max(AMENITY_MAX),
    images: z.array(str().max(2000)).max(40),
    // Which of these apply is `fieldsFor`'s call, not the schema's. One that
    // does not is cleared on save, the way a rent-only fee is on a sale.
    prototypes: z.array(PrototypeInput).max(PROTOTYPES_MAX),
    paymentPlan: PaymentPlanInput.nullable(),
    buildStage: z.enum(BUILD_STAGES).nullable(),
    titleDocument: z.enum(TITLE_DOCUMENTS).nullable(),
    furnishing: z.enum(FURNISHINGS).nullable(),
    serviced: z.boolean(),
    // Epoch ms at UTC midnight. Null means available now.
    availableFrom: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    minStay: z.number().int().min(1).max(3650).nullable(),
    seoTitle: str().max(SEO_TITLE_MAX),
    seoDescription: str().max(SEO_DESCRIPTION_MAX),
    slug: str().max(200),
    agent: z
      .object({
        id: str().max(120),
        name: str().max(200),
        role: str().max(120),
        phone: str().max(60),
        email: str().max(320),
        avatarUrl: str().max(2000),
      })
      .strict(),
    agentUserId: str().max(120).nullable(),
    /*
     * Whose property this is. Editable by staff, because an agent listing an
     * outside owner's house is the case the field exists for, and IGNORED for a
     * scoped caller: see the handler, which drops it rather than refusing, so a
     * partner saving the form does not meet an error about a control they were
     * never shown.
     */
    ownership: z.enum(OWNERSHIPS),
    ownerLabel: str().max(160),
  })
  .partial()
  .strict();

const SaveBody = z
  .object({
    patch: PatchBody,
    /** The CAS token the form was loaded with. Absent is a 400, never a blind write. */
    baseRevision: z.number().int().min(0),
  })
  .strict();

/** The most listings one bulk request may touch. A page of the list is 25. */
const BULK_MAX = 200;

/**
 * The moves a bulk request may make. `close` is left out because the single
 * route refuses it too: a sale is recorded one listing at a time.
 */
const BULK_OPS = [
  "publish",
  "unpublish",
  "markOffer",
  "relist",
  "archive",
  "unarchive",
  "restore",
  "submit",
  "sendBack",
  "patch",
  "trash",
  "reassign",
] as const satisfies readonly (LifecycleOp | "patch" | "trash" | "reassign")[];

/** The fields that mean the same thing on every listing they are set on. */
const BulkPatch = z
  .object({
    featured: PatchBody.shape.featured,
    city: PatchBody.shape.city,
    location: PatchBody.shape.location,
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "nothing to change" });

const BulkBody = z
  .object({
    ids: z.array(str().min(1).max(120)).min(1).max(BULK_MAX),
    op: z.enum(BULK_OPS),
    patch: BulkPatch.optional(),
    /** Reassign only: the team member the listings go to. */
    to: str().min(1).max(120).optional(),
    /** The revision each row was listed at. Patch and trash need one per id, as their single routes do. */
    revisions: z.record(str().max(120), z.number().int().min(0)).optional(),
  })
  .strict();

const CreateBody = z
  .object({
    title: str().min(1).max(300).default(UNTITLED_LISTING),
    type: z.enum(PROPERTY_TYPES).optional(),
  })
  .strict();

const AdminListQuery = z
  .object({
    sort: z.enum(PROPERTY_SORT_NAMES).default("updated"),
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(PROPERTY_STATUSES).optional(),
    kind: z.enum(LISTING_KINDS).optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    listingType: z.enum(LISTING_TYPES).optional(),
    mine: z.enum(["1", "0"]).optional(),
    q: str().max(200).optional(),
    withTotal: z.enum(["1", "0"]).optional(),
  })
  .strict();

const TestimonialBody = z
  .object({
    name: str().min(1).max(200),
    role: str().max(200).default(""),
    quote: str().min(1).max(2000),
    rating: z.number().int().min(1).max(5),
    initials: str().max(4).default(""),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();

const StatBody = z
  .object({
    value: z.number().int().min(0),
    label: str().min(1).max(120),
    suffix: str().max(12).optional(),
    prefix: str().max(12).optional(),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();

/**
 * Refuses when a company has no room left under one listing limit.
 *
 * Counted at the moment of the action. Two actions in the same instant can
 * each see room for one more; the overshoot is at most the company's headcount,
 * and these are commercial caps, so a counter that drifts would be worse.
 */
async function assertRoom(
  db: Db,
  partnerId: string,
  limit: "review" | "live",
  audience: "partner" | "av",
): Promise<void> {
  const found = await limitsForPartner(db, partnerId);
  if (!found) throw new NotFoundError(`partner ${partnerId}`);
  const usage = (await partnerListingUsage(db, [partnerId])).get(partnerId) ?? { review: 0, live: 0 };
  const count = usage[limit];
  const max = found.limits[limit];
  if (count >= max) {
    throw new PreconditionFailedError("limit_reached", {
      limit,
      count,
      max,
      detail: limitRefusal(limit, count, max, audience),
    });
  }
}

/** Handed the row a change was judged against, so the caller can file it with the audit. */
type OnBefore = (current: Property) => void;

/**
 * Every rule the PATCH route applies, as one function, so the bulk route runs
 * the same checks on each listing rather than a copy of them.
 */
async function patchListing(
  db: Db,
  user: AuthUser,
  id: string,
  body: z.infer<typeof SaveBody>,
  onBefore: OnBefore,
): Promise<Property> {
  const current = await getPropertyById(db, id);
  if (!current) throw new NotFoundError(`property ${id}`);
  onBefore(current);
  assertAuthorized(current, user, "write");

  /*
   * Four fields are AV Homes' to set, and a scoped caller's copies are dropped
   * rather than refused: the form never showed them, and a 400 about a control
   * somebody cannot see is a dead end.
   *
   *   ownership, ownerLabel  a partner's listing is partner property by definition
   *   featured               the home page slot is a promotion AV Homes chooses
   *   agentUserId            who owns the record; a partner could hand theirs to
   *                          another account, or null it and lock themselves out
   */
  if (isScopedCaller(user)) {
    delete body.patch.ownership;
    delete body.patch.ownerLabel;
    delete body.patch.featured;
    delete body.patch.agentUserId;
  }

  // The rules below judge `current`, so the write must land on exactly that
  // revision. Without this, a revision ahead of the read is checked against one
  // row and written onto the next (a featured draft, a let estate).
  if (body.baseRevision !== current.revision) {
    throw new StaleWriteError("property", body.baseRevision, current.revision, current);
  }

  // Every rule below reads the shape the listing will HAVE, not the one it had,
  // so a patch that switches type and fills the new fields in one save works.
  const type = body.patch.type ?? current.type;
  const estate = isEstate(type);

  // Refused rather than coerced: a caller asking for a let estate has the
  // wrong idea of what it is editing, and silently selling it would hide that.
  if (estate && body.patch.listingType === "rent") {
    throw new BadRequestError("listingType", [
      { path: "listingType", message: "an estate is sold, not let" },
    ]);
  }
  const listingType = estate ? "sale" : (body.patch.listingType ?? current.listingType);

  const prototypeIds = new Set<string>();
  for (const [index, prototype] of (body.patch.prototypes ?? []).entries()) {
    if (prototypeIds.has(prototype.id)) {
      throw new BadRequestError("prototypes", [
        { path: `prototypes.${index}.id`, message: "two options share an id" },
      ]);
    }
    prototypeIds.add(prototype.id);
  }

  // Not a silent null: a stale rent period left on a sale is refused with a
  // named field rather than discarded, so the caller knows to clear it.
  // TODO(test): a rentPeriod on a sale patch is refused with 400 naming the field.
  if (listingType === "sale" && body.patch.rentPeriod !== undefined && body.patch.rentPeriod !== null) {
    throw new BadRequestError("rentPeriod", [
      { path: "rentPeriod", message: "a sale cannot carry a rent period" },
    ]);
  }

  // A history in mixed currencies is not comparable, so the field locks the
  // moment there is a history to protect. createProperty's first real price is
  // never recorded as a change, so a brand new listing's currency stays fixable.
  // TODO(test): currency is refused with 409 once priceHistory is non-empty,
  // and stays editable on a listing whose price has never actually changed.
  if (
    body.patch.currency !== undefined &&
    body.patch.currency !== current.currency &&
    current.priceHistory.length > 0
  ) {
    throw new PreconditionFailedError("currency_locked", {
      propertyId: id,
      detail: "The currency cannot change once this listing has price history.",
    });
  }

  // Judged on the SAVED record: status and trash move only through their own
  // routes, so nothing in this patch can make the listing featurable.
  if (body.patch.featured === true && !canFeature(current)) {
    throw new PreconditionFailedError("not_featurable", {
      propertyId: id,
      detail: canFeature({ status: current.status, deletedAt: current.deletedAt })
        ? "An estate with every option sold out cannot be featured."
        : "Only a live or under offer listing can be featured.",
    });
  }

  const { fees: feeInput, ...patchRest } = body.patch;
  const patch: PropertyPatch = { ...patchRest };

  // Written on every sale save, so a home switched from rent to sale does not
  // keep the period it was let by. A sale that sent a period was refused above.
  if (listingType === "sale") patch.rentPeriod = null;

  // A plot has no rooms, whatever the row held before its kind was switched.
  if (patch.prototypes !== undefined) {
    patch.prototypes = patch.prototypes.map((prototype) =>
      prototype.kind === "plot" ? { ...prototype, bedrooms: 0, bathrooms: 0 } : prototype,
    );
  }

  if (estate) {
    patch.listingType = "sale";
    // Recomputed on every estate save, whatever the client sent for these
    // three, so the list's sort and filters never read a stale from-price.
    Object.assign(patch, derivedEstateColumns(patch.prototypes ?? current.prototypes));
  }

  // Fields `fieldsFor` says do not apply are cleared rather than refused, the
  // same call the fee rule below makes. Written only when this patch could
  // have made one stale: it changed the shape, or it sent the field itself.
  const fields = fieldsFor({ type, listingType });
  const shapeChanged = body.patch.type !== undefined || body.patch.listingType !== undefined;
  const touched = (...keys: (keyof typeof body.patch)[]) =>
    shapeChanged || keys.some((key) => body.patch[key] !== undefined);
  if (!fields.prototypes && touched("prototypes")) patch.prototypes = [];
  if (!fields.paymentPlan && touched("paymentPlan")) patch.paymentPlan = null;
  if (!fields.buildStage && touched("buildStage")) patch.buildStage = null;
  if (!fields.titleDocument && touched("titleDocument")) patch.titleDocument = null;
  if (!fields.rentTerms && touched("furnishing", "serviced", "availableFrom", "minStay")) {
    patch.furnishing = null;
    patch.serviced = false;
    patch.availableFrom = null;
    patch.minStay = null;
  }

  // Selling the last open option takes an estate off the home page in the same write.
  if (
    (current.featured || patch.featured === true) &&
    !canFeature({ ...current, type, prototypes: patch.prototypes ?? current.prototypes })
  ) {
    patch.featured = false;
  }

  // A minimum stay counts nights on a shortlet and months otherwise, so a period
  // change across that line would silently turn 12 months into 12 nights.
  const nextPeriod = listingType === "rent" ? (patch.rentPeriod ?? current.rentPeriod ?? "year") : null;
  if (
    body.patch.minStay === undefined &&
    current.minStay !== null &&
    minStayUnit(nextPeriod) !== minStayUnit(current.rentPeriod)
  ) {
    patch.minStay = null;
  }

  if (patch.amenities !== undefined) patch.amenities = normalizeAmenities(patch.amenities);

  /*
   * The map link is checked, then FOLLOWED once, then stored.
   *
   * Refused rather than silently dropped: an operator who pasted the wrong
   * thing has to be told, because a saved-and-ignored link reads as a map
   * that never appears. Expanded because the Share button hands out
   * `maps.app.goo.gl/XXXX`, which names no place until something follows it,
   * and the public listing page is the wrong place to be making that request.
   */
  if (body.patch.mapUrl !== undefined) {
    const refusal = mapLinkRefusal(body.patch.mapUrl);
    if (refusal) throw new BadRequestError("mapUrl", [{ path: "mapUrl", message: refusal }]);
    patch.mapUrl = await expandMapLink(body.patch.mapUrl);
  }

  // A new web address keeps the old one as a redirect, so nothing already shared breaks.
  if (body.patch.slug !== undefined) {
    const handle = toHandle(body.patch.slug);
    if (handle === null) {
      throw new BadRequestError("slug", [
        { path: "slug", message: "a web address needs at least one letter or number" },
      ]);
    }
    if (handle === current.slug) {
      delete patch.slug;
    } else {
      if (await isSlugTaken(db, handle, id)) {
        throw new PreconditionFailedError("slug_taken", {
          propertyId: id,
          detail: `Another listing already uses /listings/${handle}.`,
        });
      }
      patch.slug = handle;
      const kept = current.previousSlugs.filter((s) => s !== handle);
      // A draft's address was never public, so there is nothing to redirect from.
      if (current.slug !== null && current.publishedAt !== null) kept.push(current.slug);
      patch.previousSlugs = kept.slice(-PREVIOUS_SLUGS_MAX);
    }
  }

  // Fees are resolved whenever they are sent, or whenever listingType changes
  // and might strand a fee kind the new type cannot carry: a caution fee left
  // over from a rental is dropped on the switch to sale, not rejected. That
  // includes the switch an estate forces, since `listingType` is the effective one.
  // TODO(test): a fee kind the new listingType cannot carry is dropped on
  // save, not rejected, whether or not fees itself rides the same patch.
  if (feeInput !== undefined || listingType !== current.listingType) {
    const effectiveCurrency = body.patch.currency ?? current.currency;
    const source: ListingFee[] = feeInput
      ? feeInput.map((fee) => {
          const currency = fee.currency ?? effectiveCurrency;
          const money = parseMajor(fee.amount, currency);
          if (!money.ok) {
            throw new BadRequestError("fees", [
              { path: `fees.${fee.kind}`, message: moneyRefusalMessage(money.reason, currency) },
            ]);
          }
          return { kind: fee.kind, amountMinor: money.minor, currency };
        })
      : current.fees;
    patch.fees = normalizeFees(source).filter((fee) => FEE_KINDS_FOR[listingType].includes(fee.kind));
  }

  // A listing already on the site stays one Publish would accept. Only blockers
  // this patch INTRODUCES are refused, so a legacy row missing an address can
  // still have its title fixed.
  if (current.deletedAt === null && PUBLIC_PROPERTY_STATUSES.includes(current.status)) {
    const before = new Set(listingPublishBlockers(current).map((b) => b.message));
    const introduced = listingPublishBlockers({
      title: patch.title ?? current.title,
      priceMinor: patch.priceMinor ?? current.priceMinor,
      city: patch.city ?? current.city,
      address: patch.address ?? current.address,
      type,
      prototypes: patch.prototypes ?? current.prototypes,
    }).filter((b) => !before.has(b.message));
    if (introduced.length > 0) {
      throw new PreconditionFailedError("not_ready", {
        propertyId: id,
        blockers: introduced,
        detail: `This listing is on the site, so it has to stay complete. ${introduced.map((b) => b.message).join(" ")}`,
      });
    }
  }

  return saveProperty(db, id, patch, body.baseRevision, {
    userId: user.id,
    name: user.displayName,
  });
}

/** Every rule the lifecycle route applies, shared with the bulk route. */
async function moveListing(
  db: Db,
  user: AuthUser,
  id: string,
  operation: LifecycleOp,
  onBefore: OnBefore,
): Promise<Property> {
  const current = await getPropertyById(db, id);
  if (!current) throw new NotFoundError(`property ${id}`);
  onBefore(current);
  assertAuthorized(current, user, "write");

  /*
   * `close` does not happen here. It is reachable only through the recorded-sale
   * flow, which supplies the amount, the buyer, the proof and who closed it, and
   * leaving a bare status route open to it would be the exact hole that flow
   * exists to close: a property off the market with no record of its sale.
   */
  if (operation === "close") {
    throw new PreconditionFailedError("record_the_sale", {
      propertyId: id,
      detail: "Record the sale instead. A closed listing needs the amount, the buyer and proof.",
    });
  }

  /*
   * Everything except `submit` is a status decision, and a scoped role does not
   * make those. A partner may hand a listing over and edit it; AV Homes decides
   * when it is public.
   */
  if (operation !== "submit") {
    assertAuthorized(current, user, "status");
  }

  // Refusals name the operation and the status, so a screen can say what is
  // wrong rather than printing a status code.
  assertTransition(current, operation);

  /* A partner's listing going on the market needs room under the live limit:
     on submission, so the partner hears it before anyone at AV Homes does; on
     publish, which is AV Homes approving it; on relisting a sold one. */
  if (current.partnerId !== null) {
    const who = isScopedCaller(user) ? "partner" : "av";
    if (operation === "submit") await assertRoom(db, current.partnerId, "live", who);
    if (operation === "publish") await assertRoom(db, current.partnerId, "live", "av");
    if (operation === "relist" && current.status === "closed") {
      await assertRoom(db, current.partnerId, "live", "av");
    }
  }

  /*
   * The publish check runs on SUBMIT too, and that is the point of running it
   * twice: a partner is told what is missing while they can still fix it, rather
   * than after somebody at AV Homes opens their listing and sends it back.
   */
  if (operation === "submit") {
    const blockers = listingPublishBlockers(current);
    if (blockers.length > 0) {
      throw new PreconditionFailedError("not_ready", {
        propertyId: id,
        blockers,
        detail:
          blockers.length === 1
            ? blockers[0].message
            : `This listing is not ready to send: ${blockers.map((b) => b.field).join(", ")}.`,
      });
    }
  }
  /*
   * `publish` is the ONLY transition that carries a listing from a private
   * status into a public one, because TRANSITIONS enforces where each op may
   * start: publish runs from draft or archived, markOffer, relist and close
   * only from a status that is public already, and every other op lands
   * private. So this is the one gate a blank listing has to get past; the
   * PATCH route keeps a listing that is already public from being emptied.
   */
  if (operation === "publish") {
    const blockers = listingPublishBlockers(current);
    if (blockers.length > 0) {
      throw new PreconditionFailedError("not_ready", {
        propertyId: id,
        blockers,
        detail:
          blockers.length === 1
            ? blockers[0].message
            : `This listing is not ready: ${blockers.map((b) => b.field).join(", ")}.`,
      });
    }
  }

  // Written against the revision just checked, so a listing edited since is a
  // 409 rather than a move the checks above never saw.
  return transitionProperty(db, current, operation);
}

type AgentCard = Property["agent"];

/**
 * Hands a listing to another team member: who may edit it and the agent card
 * buyers see both move, because a listing whose card names someone other than
 * its holder sends buyers to the wrong person.
 */
async function reassignListing(
  db: Db,
  user: AuthUser,
  id: string,
  baseRevision: number,
  to: AgentCard,
  onBefore: OnBefore,
): Promise<Property> {
  const current = await getPropertyById(db, id);
  if (!current) throw new NotFoundError(`property ${id}`);
  onBefore(current);
  assertAuthorized(current, user, "write");
  if (baseRevision !== current.revision) {
    throw new StaleWriteError("property", baseRevision, current.revision, current);
  }
  if (current.deletedAt !== null) {
    throw new PreconditionFailedError("in_trash", {
      propertyId: id,
      detail: "This listing is in the trash. Restore it first.",
    });
  }
  // A partner's listing is held by the partner company's own accounts.
  if (current.partnerId !== null) {
    throw new PreconditionFailedError("partner_listing", {
      propertyId: id,
      detail: "This listing belongs to a partner company, so it stays with their account.",
    });
  }
  return saveProperty(db, id, { agentUserId: to.id, agent: to }, baseRevision, {
    userId: user.id,
    name: user.displayName,
  });
}

/** SOFT delete, as the DELETE route does it. */
async function trashListing(
  db: Db,
  user: AuthUser,
  id: string,
  baseRevision: number,
  onBefore: OnBefore,
): Promise<Property> {
  const current = await getPropertyById(db, id);
  if (!current) throw new NotFoundError(`property ${id}`);
  // The row is already read, and it is the only record of what a trashed
  // listing said: "who deleted the one a buyer saw last week" needs the
  // listing, not just its id.
  onBefore(current);
  assertAuthorized(current, user, "write");
  if (baseRevision !== current.revision) {
    throw new StaleWriteError("property", baseRevision, current.revision, current);
  }
  if (current.deletedAt !== null) {
    throw new PreconditionFailedError("already_in_trash", {
      propertyId: id,
      detail: "This listing is already in the trash.",
    });
  }
  return trashProperty(db, id, baseRevision);
}

type BulkResult =
  | { id: string; ok: true; property: Property }
  | { id: string; ok: false; status: number; error: string; detail: string };

/** One row's refusal, in the words the single route would have used. */
function refusalOf(error: unknown, reqId: string): { status: number; error: string; detail: string } {
  if (!(error instanceof ApiError)) {
    console.error("[listings bulk]", JSON.stringify(logLine(error, { requestId: reqId })));
    return { status: 500, error: "internal", detail: "Something went wrong on our side." };
  }
  const body = error.body();
  const detail =
    error instanceof NotFoundError
      ? "This listing no longer exists."
      : error instanceof StaleWriteError
        ? "It changed since the list loaded. Reload and try again."
        : error instanceof BadRequestError
          ? (error.issues?.[0]?.message ?? error.detail)
          : typeof body.detail === "string"
            ? body.detail
            : typeof body.reason === "string"
              ? body.reason
              : error.code;
  return { status: error.status, error: error.code, detail };
}

export function listingsAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/properties", requireAuth(), async (c) => {
    const q = readQuery(c, AdminListQuery);
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, q.sort);

    const db = await currentDb(c);
    const user = currentUser(c);
    const scope = partnerScopeOf(user);
    const query = {
      sort: q.sort,
      limit,
      cursor: q.cursor,
      status: q.status,
      kind: q.kind,
      type: q.type,
      listingType: q.listingType,
      q: q.q,
      /*
       * A scoped role is pinned to its company's rows whatever `mine` says. `mine`
       * is a convenience for staff; this is a boundary, so it wins, and it is
       * applied as a FILTER rather than by dropping rows after the fetch: a
       * filtered page would come back short and read as the end of the list.
       */
      partnerId: scope ?? undefined,
      agentUserId: scope === null && q.mine === "1" ? user.id : undefined,
      includeHidden: true,
      // The console's box is a filter that narrows as an operator types, not
      // the site's whole-word search. See `substring` in the repo for the
      // trade this buys and what it costs.
      substring: true,
    };
    const page = await listProperties(db, query);
    // Only when asked. Paging deliberately avoids the count, and a screen that
    // wants a total is asking the server to pay for one on purpose.
    const total = q.withTotal === "1" ? await countProperties(db, query) : undefined;
    return c.json(total === undefined ? page : { ...page, total });
  });

  routes.post("/admin/properties", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const scope = partnerScopeOf(user);
    // Never written: NO_PARTNER is the sentinel a companyless account scopes to,
    // and stamping it on a row would let every other companyless account match it.
    if (scope === NO_PARTNER) throw new ForbiddenError("this partner account has no company");
    if (scope !== null) await assertRoom(db, scope, "review", "partner");
    const { title, type } = await readJsonOrEmpty(c, CreateBody);
    const property = await createProperty(db, {
      title,
      type,
      /*
       * A partner account can only ever create partner property, decided here and
       * not offered as a field. Everyone else gets AV Homes' own by default and
       * changes it on the form, where an agent listing an outside owner's house
       * says so deliberately.
       */
      ownership: scope !== null ? "partner" : "av",
      partnerId: scope,
      agentUserId: user.id,
      // Seeded from the creating account so a new listing is never agent-less on
      // screen. Every field stays editable afterwards.
      agent: {
        id: user.id,
        name: user.displayName,
        role: "Sales agent",
        phone: "",
        email: user.email,
        avatarUrl: "",
      },
    });
    auditEntityId(c, property.id);
    return c.json({ property }, 201);
  });

  routes.get("/admin/properties/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const property = await getPropertyById(await currentDb(c), id);
    if (!property) throw new NotFoundError(`property ${id}`);
    /* A scoped caller asking for somebody else's listing gets the same answer as
       for an id that does not exist. `authorize` decides it; this is the one read
       route where that matters, because the id came from the URL rather than from
       a list this caller was allowed to see. */
    assertAuthorized(property, currentUser(c), "read");
    return c.json({ property });
  });

  /** Read first, then authorize, then act. An absent id is a 404 before a 403. */
  routes.patch("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, SaveBody);
    const property = await patchListing(db, currentUser(c), id, body, (doc) =>
      auditBefore(c, doc as unknown as Record<string, unknown>),
    );
    // Every mutation answers with the entity, so the client adopts the bumped
    // revision without a second request.
    return c.json({ property });
  });

  /**
   * The same three writes as the single routes, over many listings, each one
   * judged on its own: a refusal on one row is reported and the rest go ahead.
   * Sequential on purpose, so a partner's live limit is counted after each
   * publish rather than once for the whole batch.
   */
  routes.post("/admin/properties/bulk", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const body = await readJson(c, BulkBody);
    if ((body.op === "patch") !== (body.patch !== undefined)) {
      throw new BadRequestError("patch", [
        { path: "patch", message: "send a patch with op patch, and only then" },
      ]);
    }
    if ((body.op === "reassign") !== (body.to !== undefined)) {
      throw new BadRequestError("to", [{ path: "to", message: "send to with op reassign, and only then" }]);
    }

    // Resolved once, before any row is touched, so a bad target refuses the batch.
    let heir: AgentCard | null = null;
    if (body.op === "reassign") {
      if (!isAdminRole(user.role)) throw new ForbiddenError("only an owner or developer can reassign listings");
      const found = await findUserById(db, body.to!);
      const staff = ["owner", ...ASSIGNABLE_ROLES] as string[];
      if (!found || found.disabledAt !== null || !staff.includes(found.user.role) || found.user.partnerId) {
        throw new PreconditionFailedError("reassign_target", {
          detail: "Listings can only go to an active member of the AV Homes team.",
        });
      }
      heir = {
        id: found.user.id,
        name: found.user.displayName,
        role: found.user.title || "Sales agent",
        phone: found.user.phone,
        email: found.user.email,
        avatarUrl: found.user.avatarUrl,
      };
    }
    auditBatch(c);

    const results: BulkResult[] = [];
    for (const id of new Set(body.ids)) {
      let before: Property | null = null;
      const onBefore = (doc: Property) => {
        before = doc;
      };
      try {
        let property: Property;
        if (body.op === "patch" || body.op === "trash" || body.op === "reassign") {
          // Both are compare-and-set writes on their single routes, and stay so here.
          const revision = body.revisions?.[id];
          if (revision === undefined) {
            throw new BadRequestError("revisions", [
              { path: `revisions.${id}`, message: "send the revision this listing was listed at" },
            ]);
          }
          property =
            body.op === "patch"
              ? // A copy per row: the rules drop staff-only fields from the patch they are given.
                await patchListing(db, user, id, { patch: { ...body.patch }, baseRevision: revision }, onBefore)
              : body.op === "reassign"
                ? await reassignListing(db, user, id, revision, heir!, onBefore)
                : await trashListing(db, user, id, revision, onBefore);
        } else {
          property = await moveListing(db, user, id, body.op, onBefore);
        }
        results.push({ id, ok: true, property });
        auditItem(c, {
          entityId: id,
          action: body.op === "patch" || body.op === "reassign" ? "update" : body.op === "trash" ? "delete" : `op:${body.op}`,
          before: before as Record<string, unknown> | null,
          requested: {
            bulk: true,
            op: body.op,
            ...(body.patch ? { patch: body.patch } : {}),
            ...(heir ? { to: heir.id } : {}),
          },
        });
      } catch (error) {
        results.push({ id, ok: false, ...refusalOf(error, requestId(c)) });
      }
    }
    return c.json({ results });
  });

  routes.post("/admin/properties/:id/:op", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const op = pathParam(c, "op");
    // Own keys only: `in` would let "toString" through as an op.
    if (!Object.hasOwn(TRANSITIONS, op)) {
      throw new BadRequestError("op", [
        { path: "op", message: `unknown operation, expected one of ${Object.keys(TRANSITIONS).join(", ")}` },
      ]);
    }
    const property = await moveListing(db, currentUser(c), id, op as LifecycleOp, (doc) =>
      auditBefore(c, doc as unknown as Record<string, unknown>),
    );
    return c.json({ property });
  });

  /** SOFT delete. There is no hard-delete route, on purpose. */
  routes.delete("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const base = readQuery(c, z.object({ baseRevision: z.coerce.number().int().min(0) }).strict());
    const property = await trashListing(db, currentUser(c), id, base.baseRevision, (doc) =>
      auditBefore(c, doc as unknown as Record<string, unknown>),
    );
    return c.json({ property });
  });

  /* ────────────────────── testimonials and counters ─────────────────── */

  routes.get("/admin/testimonials", requireAuth(), async (c) =>
    c.json({ items: await listTestimonials(await currentDb(c)) }),
  );

  routes.put("/admin/testimonials/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, TestimonialBody);
    const item = await upsertTestimonial(await currentDb(c), id === "new" ? null : id, body as Omit<Testimonial, "id">);
    if (id === "new") auditEntityId(c, item.id);
    return c.json({ testimonial: item });
  });

  routes.delete("/admin/testimonials/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    if (!(await deleteTestimonial(await currentDb(c), id))) throw new NotFoundError(id);
    return c.json({ ok: true });
  });

  routes.get("/admin/stats", requireAuth(), async (c) =>
    c.json({ items: await listSiteStats(await currentDb(c)) }),
  );

  routes.put("/admin/stats/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, StatBody);
    const item = await upsertSiteStat(await currentDb(c), id === "new" ? null : id, body as Omit<SiteStat, "id">);
    if (id === "new") auditEntityId(c, item.id);
    return c.json({ stat: item });
  });

  routes.delete("/admin/stats/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    if (!(await deleteSiteStat(await currentDb(c), id))) throw new NotFoundError(id);
    return c.json({ ok: true });
  });

  return routes;
}
