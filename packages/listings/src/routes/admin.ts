import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  PreconditionFailedError,
  StaleWriteError,
  assertCursorSort,
  auditBefore,
  auditEntityId,
  clampLimit,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  readJsonOrEmpty,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  AMENITY_LENGTH_MAX,
  AMENITY_MAX,
  BUILD_STAGES,
  FEE_KINDS,
  FEE_KINDS_FOR,
  FURNISHINGS,
  LISTING_TYPES,
  PROPERTY_STATUSES,
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
  isEstate,
  listingPublishBlockers,
  minStayUnit,
  moneyRefusalMessage,
  normalizeAmenities,
  normalizeFees,
  parseMajor,
  PREVIOUS_SLUGS_MAX,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  toHandle,
  type ListingFee,
  type SiteStat,
  type Testimonial,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { assertAuthorized } from "../authorize";
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

export function listingsAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/properties", requireAuth(), async (c) => {
    const q = readQuery(c, AdminListQuery);
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, q.sort);

    const db = await currentDb(c);
    const user = currentUser(c);
    const query = {
      sort: q.sort,
      limit,
      cursor: q.cursor,
      status: q.status,
      kind: q.kind,
      type: q.type,
      listingType: q.listingType,
      q: q.q,
      agentUserId: q.mine === "1" ? user.id : undefined,
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
    const { title, type } = await readJsonOrEmpty(c, CreateBody);
    const property = await createProperty(db, {
      title,
      type,
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
    return c.json({ property });
  });

  /** Read first, then authorize, then act. An absent id is a 404 before a 403. */
  routes.patch("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, SaveBody);
    const user = currentUser(c);

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    auditBefore(c, current as unknown as Record<string, unknown>);
    assertAuthorized(current, user, "write");

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

    const property = await saveProperty(db, id, patch, body.baseRevision, {
      userId: user.id,
      name: user.displayName,
    });
    // Every mutation answers with the entity, so the client adopts the bumped
    // revision without a second request.
    return c.json({ property });
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
    const operation = op as LifecycleOp;

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    auditBefore(c, current as unknown as Record<string, unknown>);
    assertAuthorized(current, currentUser(c), "write");

    // Refusals name the operation and the status, so a screen can say what is
    // wrong rather than printing a status code.
    assertTransition(current, operation);
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
    const property = await transitionProperty(db, current, operation);
    return c.json({ property });
  });

  /** SOFT delete. There is no hard-delete route, on purpose. */
  routes.delete("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const base = readQuery(c, z.object({ baseRevision: z.coerce.number().int().min(0) }).strict());

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    // The row is already read, and it is the only record of what a trashed
    // listing said: "who deleted the one a buyer saw last week" needs the
    // listing, not just its id.
    auditBefore(c, current as unknown as Record<string, unknown>);
    assertAuthorized(current, currentUser(c), "write");
    if (base.baseRevision !== current.revision) {
      throw new StaleWriteError("property", base.baseRevision, current.revision, current);
    }
    if (current.deletedAt !== null) {
      throw new PreconditionFailedError("already_in_trash", {
        propertyId: id,
        detail: "This listing is already in the trash.",
      });
    }

    const property = await trashProperty(db, id, base.baseRevision);
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
