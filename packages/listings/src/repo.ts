import type { Filter } from "mongodb";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  DuplicateError,
  NotFoundError,
  PreconditionFailedError,
  StaleWriteError,
  disambiguateSlug,
  keysetFilter,
  keysetSort,
  newId,
  slugify,
  takePage,
} from "@avhomes/core";
import {
  DEFAULT_CURRENCY,
  ESTATE_TYPE,
  FEATURABLE_STATUSES,
  PRICE_HISTORY_MAX,
  PROPERTY_STATUSES,
  PUBLIC_PROPERTY_STATUSES,
  isEstate,
  type ListingType,
  type Page,
  type PriceChange,
  type Property,
  type PropertyStatus,
  type PropertyType,
  type SiteStat,
  type Testimonial,
} from "@avhomes/contracts";
import {
  PROPERTY_SORTS,
  type PropertyDoc,
  type PropertySort,
  type SiteStatDoc,
  type TestimonialDoc,
  toProperty,
  toSiteStat,
  toTestimonial,
} from "./schema";

function properties(db: Db) {
  return collection<PropertyDoc>(db, COLLECTIONS.properties);
}

export const LISTING_KINDS = ["estate", "home"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export interface ListQuery {
  sort: PropertySort;
  limit: number;
  cursor?: string | undefined;
  status?: PropertyStatus | undefined;
  type?: PropertyType | undefined;
  /** Estates versus everything else. Composes with `type` rather than replacing it. */
  kind?: ListingKind | undefined;
  /** The deal (sale/rent). Separate from `type`, which is PropertyType (Villa, Duplex). */
  listingType?: ListingType | undefined;
  city?: string | undefined;
  bedrooms?: number | undefined;
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  featured?: boolean | undefined;
  q?: string | undefined;
  agentUserId?: string | undefined;
  /** Admin lists see drafts and trash; the public list never does. */
  includeHidden?: boolean;
  /**
   * Substring matching instead of the text index. Admin lists only.
   *
   * `$text` is whole-word and stemmed, which is right for a visitor typing a
   * finished query into the site's search box and wrong for an operator
   * narrowing a table as they type: "trop" matched nothing until it became
   * "tropical", so the screen went empty while the listing they wanted was on
   * it. This is a filter, not a search, so it behaves like one.
   */
  substring?: boolean;
}

/**
 * A caller's own text, made safe to put inside a RegExp.
 *
 * Without this a search for `(` is a syntax error thrown from inside a route,
 * and one for `.*` is a filter that matches the whole collection.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildFilter(query: ListQuery): Filter<PropertyDoc> {
  const and: Filter<PropertyDoc>[] = [];

  if (query.includeHidden) {
    if (query.status) and.push({ status: query.status });
  } else {
    // The public list is defined by what it EXCLUDES, so a status added later is
    // hidden until somebody adds it to PUBLIC_PROPERTY_STATUSES on purpose.
    and.push({ status: query.status ?? { $in: [...PUBLIC_PROPERTY_STATUSES] } });
    and.push({ deletedAt: null });
  }

  if (query.type) and.push({ type: query.type });
  if (query.kind === "estate") and.push({ type: ESTATE_TYPE });
  if (query.kind === "home") and.push({ type: { $ne: ESTATE_TYPE } });
  if (query.listingType) and.push({ listingType: query.listingType });
  if (query.city) and.push({ city: query.city });
  if (query.bedrooms !== undefined) and.push({ bedrooms: { $gte: query.bedrooms } });
  if (query.featured !== undefined) and.push({ featured: query.featured });
  // Lifecycle moves clear the flag now, but a row featured before they did
  // would otherwise still headline the home page after it sold.
  if (query.featured === true) {
    and.push({ status: { $in: [...FEATURABLE_STATUSES] }, deletedAt: null });
    // A sold-out estate advertises something nobody can buy.
    and.push({
      $or: [{ type: { $ne: ESTATE_TYPE } }, { prototypes: { $elemMatch: { available: true } } }],
    } as Filter<PropertyDoc>);
  }
  if (query.agentUserId) and.push({ agentUserId: query.agentUserId });

  if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) {
    const range: Record<string, number> = {};
    if (query.minPriceMinor !== undefined) range.$gte = query.minPriceMinor;
    if (query.maxPriceMinor !== undefined) range.$lte = query.maxPriceMinor;
    and.push({ priceMinor: range } as Filter<PropertyDoc>);
  }

  /*
   * TWO SEARCHES, and which one runs is the caller's choice.
   *
   * `$text` is the public one: stemmed, relevance ranked, index backed. It does
   * not compose with keyset paging, because relevance is not a stored field and
   * there is nothing to put in a cursor, so a public search is one bounded page.
   *
   * `substring` is the admin one. It is a scan, and that is the deliberate
   * trade: an authenticated screen with a bounded page size, in exchange for a
   * filter that narrows on every keystroke, respects the sort the operator
   * chose, and pages like every other view. `description` is left out on
   * purpose, or a common word in one long body drags an unrelated listing to
   * the top of the operator's table. Option names are in, so "3 bed" finds the
   * estate that sells one.
   */
  if (query.q && query.substring) {
    const like = new RegExp(escapeRegex(query.q), "iu");
    and.push({
      $or: [
        { title: like },
        { city: like },
        { location: like },
        { tagline: like },
        { "prototypes.name": like },
      ],
    } as Filter<PropertyDoc>);
  } else if (query.q) {
    and.push({ $text: { $search: query.q } } as Filter<PropertyDoc>);
  }

  const keyset = keysetFilter<PropertyDoc>(PROPERTY_SORTS[query.sort], query.cursor, query.sort);
  if (Object.keys(keyset).length > 0) and.push(keyset);

  return and.length === 0 ? {} : { $and: and };
}

export async function listProperties(db: Db, query: ListQuery): Promise<Page<Property>> {
  const spec = PROPERTY_SORTS[query.sort];
  const filter = buildFilter(query);

  // Only the text path forfeits the chosen sort. A substring filter is an
  // ordinary query, so it keeps the operator's sort and its cursor.
  const relevance = Boolean(query.q) && !query.substring;

  const docs = await properties(db)
    .find(filter, {
      sort: relevance ? { score: { $meta: "textScore" } } : keysetSort(spec),
      // One extra, to answer "is there another page" without a count.
      limit: query.limit + 1,
    })
    .toArray();

  const { items, nextCursor } = takePage(docs, query.limit, spec, query.sort);
  return {
    items: items.map(toProperty),
    // A text search returns one page by construction, so it never offers a
    // cursor. A substring filter is keyset paged like any other list.
    nextCursor: relevance ? null : nextCursor,
  };
}

export async function countProperties(db: Db, query: ListQuery): Promise<number> {
  return properties(db).countDocuments(buildFilter({ ...query, cursor: undefined }));
}

/**
 * The public read by web address. Falls back to an address the listing USED to
 * have, so a link shared before a rename still lands; the page redirects to the
 * current one because the returned slug differs from the one asked for.
 */
export async function getPropertyBySlug(db: Db, slug: string): Promise<Property | null> {
  const visible = { deletedAt: null, status: { $in: [...PUBLIC_PROPERTY_STATUSES] } };
  const doc =
    (await properties(db).findOne({ slug, ...visible })) ??
    (await properties(db).findOne({ previousSlugs: slug, ...visible }, { sort: { updatedAt: -1 } }));
  return doc ? toProperty(doc) : null;
}

/** Another listing already answers at this address. */
export async function isSlugTaken(db: Db, slug: string, exceptId: string): Promise<boolean> {
  const hit = await properties(db).findOne({ slug, _id: { $ne: exceptId } }, { projection: { _id: 1 } });
  return hit !== null;
}

/** The admin read. Sees drafts, archived and trash. */
export async function getPropertyById(db: Db, id: string): Promise<Property | null> {
  const doc = await properties(db).findOne({ _id: id });
  return doc ? toProperty(doc) : null;
}

/**
 * Similar listings for a detail page.
 *
 * Same type first, then same city, in ONE query rather than two round trips.
 * `$or` plus a sort on a computed rank would need an aggregation; at this size
 * a single fetch and a client-side partition is cheaper and easier to read.
 */
export async function getSimilarProperties(
  db: Db,
  current: Property,
  limit = 3,
): Promise<Property[]> {
  const docs = await properties(db)
    .find(
      {
        _id: { $ne: current.id },
        deletedAt: null,
        status: { $in: [...PUBLIC_PROPERTY_STATUSES] },
        $or: [{ type: current.type }, { city: current.city }],
      },
      { sort: { publishedAt: -1, _id: -1 }, limit: limit * 3 },
    )
    .toArray();

  const sameType = docs.filter((d) => d.type === current.type);
  const sameCity = docs.filter((d) => d.type !== current.type && d.city === current.city);
  return [...sameType, ...sameCity].slice(0, limit).map(toProperty);
}

/* ────────────────────────────── mutations ─────────────────────────────── */

export interface CreatePropertyArgs {
  title: string;
  /** Chosen at the naming step, because it decides which form the editor shows. */
  type?: PropertyType | undefined;
  agentUserId: string | null;
  agent: PropertyDoc["agent"];
}

export async function createProperty(db: Db, args: CreatePropertyArgs): Promise<Property> {
  const now = Date.now();
  const doc: PropertyDoc = {
    _id: newId("prop", now),
    // Null until published or titled. A unique index permits many nulls under a
    // partial filter, which is what makes "no slug yet" a storable state.
    slug: null,
    title: args.title,
    tagline: "",
    description: "",
    priceMinor: 0,
    currency: DEFAULT_CURRENCY,
    status: "draft",
    // Required by the validator: moderate validation checks every insert, and
    // an insert with no listingType fails it outright. Also the only deal an
    // estate can be, so a new estate needs nothing further here.
    listingType: "sale",
    type: args.type ?? "Apartment",
    location: "",
    city: "",
    address: "",
    bedrooms: 0,
    bathrooms: 0,
    areaSqft: 0,
    parkingSpaces: 0,
    yearBuilt: new Date(now).getFullYear(),
    featured: false,
    amenities: [],
    images: [],
    prototypes: [],
    paymentPlan: null,
    buildStage: null,
    titleDocument: null,
    furnishing: null,
    serviced: false,
    availableFrom: null,
    minStay: null,
    seoTitle: "",
    seoDescription: "",
    previousSlugs: [],
    agent: args.agent,
    agentUserId: args.agentUserId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    deletedAt: null,
    revision: 1,
  };
  await properties(db).insertOne(doc);
  return toProperty(doc);
}

export type PropertyPatch = Partial<
  Omit<
    PropertyDoc,
    "_id" | "status" | "priceHistory" | "createdAt" | "updatedAt" | "publishedAt" | "deletedAt" | "revision"
  >
>;

/**
 * Compare-and-swap, in one atomic document update.
 *
 * `revision: baseRevision` in the FILTER is the whole mechanism. A lost race
 * matches nothing, and the 409 carries the full current listing from a single
 * re-read so a client's "load theirs" needs no second request.
 *
 * No transaction, and none is wanted: a single-document update in MongoDB is
 * atomic by definition. Needing more than one document here would mean the
 * aggregate boundary was drawn wrong.
 *
 * Takes an actor because a price change needs somewhere to put `byName`, the
 * same snapshot idiom `EnquiryMessage.authorName` uses. Never a join.
 */
export async function saveProperty(
  db: Db,
  id: string,
  patch: PropertyPatch,
  baseRevision: number,
  actor: { userId: string; name: string },
): Promise<Property> {
  const now = Date.now();
  // Reads the row BEFORE the write: the price comparison needs the OLD price,
  // which a $set alone cannot see. Safe under the CAS the write enforces below:
  // if this read is already stale, the guarded update misses regardless and the
  // 409 path fires untouched, so a price change computed from a stale read is
  // simply discarded rather than applied.
  const before = await properties(db).findOne({ _id: id, deletedAt: null });

  // A change is recorded only when the old price was real and the new one
  // differs. createProperty seeds priceMinor 0, so a brand new listing's first
  // price is not a change: recording one would lie about a rise from nothing,
  // and it would trip the currency lock on a listing that never had a price.
  // A drop to zero is not recorded either. Zero is no price at all, and the
  // site would badge it as a cut.
  // An estate, or a listing crossing into or out of being one, records nothing:
  // its price is the cheapest option's, so adding a cheaper option is not an
  // asking price being cut, and the site would badge it as one.
  // TODO(test): a price change appends exactly one priceHistory entry, capped
  // at PRICE_HISTORY_MAX; an unrelated field change appends none.
  const change: PriceChange | null =
    before &&
    !isEstate(before.type) &&
    !isEstate(patch.type ?? before.type) &&
    patch.priceMinor !== undefined &&
    before.priceMinor > 0 &&
    patch.priceMinor > 0 &&
    patch.priceMinor !== before.priceMinor
      ? {
          at: now,
          fromMinor: before.priceMinor,
          toMinor: patch.priceMinor,
          currency: patch.currency ?? before.currency,
          byUserId: actor.userId,
          byName: actor.name,
        }
      : null;

  const after = await properties(db).findOneAndUpdate(
    { _id: id, revision: baseRevision, deletedAt: null },
    {
      $set: { ...patch, updatedAt: now },
      $inc: { revision: 1 },
      ...(change ? { $push: { priceHistory: { $each: [change], $slice: -PRICE_HISTORY_MAX } } } : {}),
    },
    { returnDocument: "after" },
  );
  if (after) return toProperty(after);

  const current = await properties(db).findOne({ _id: id });
  if (!current || current.deletedAt !== null) throw new NotFoundError(id);
  throw new StaleWriteError("property", baseRevision, current.revision, toProperty(current));
}

/**
 * Lifecycle moves, which are the only way `status`, `slug` and `publishedAt`
 * change. They are absent from the patch schema on purpose, so a body carrying
 * one is refused rather than accepted and discarded.
 */
export type LifecycleOp =
  | "publish"
  | "unpublish"
  | "markOffer"
  | "relist"
  | "close"
  | "archive"
  | "unarchive"
  | "restore";

interface Transition {
  to: PropertyStatus;
  /** Statuses the op may start from. Matches the controls the editor offers. */
  from: readonly PropertyStatus[];
  /** Only `restore` runs on a trashed listing, and it runs on nothing else. */
  trashed: boolean;
}

export const TRANSITIONS: Record<LifecycleOp, Transition> = {
  publish: { to: "live", from: ["draft", "archived"], trashed: false },
  unpublish: { to: "draft", from: ["live", "under-offer"], trashed: false },
  markOffer: { to: "under-offer", from: ["live"], trashed: false },
  // Under offer and closed both need a way back to live, or a collapsed deal
  // forces an agent to lie about the listing's state.
  relist: { to: "live", from: ["under-offer", "closed"], trashed: false },
  close: { to: "closed", from: ["live", "under-offer"], trashed: false },
  archive: { to: "archived", from: ["draft", "live", "under-offer", "closed"], trashed: false },
  unarchive: { to: "draft", from: ["archived"], trashed: false },
  // Whatever status a trashed row holds, being in the trash is the whole test.
  restore: { to: "draft", from: PROPERTY_STATUSES, trashed: true },
};

const OP_PHRASES: Record<LifecycleOp, string> = {
  publish: "published",
  unpublish: "unpublished",
  markOffer: "marked under offer",
  relist: "put back on the market",
  close: "marked closed",
  archive: "archived",
  unarchive: "unarchived",
  restore: "restored",
};

const STATUS_PHRASES: Record<PropertyStatus, string> = {
  draft: "A draft",
  live: "A live listing",
  "under-offer": "A listing under offer",
  closed: "A closed listing",
  archived: "An archived listing",
};

/** Refuses an op the listing's current status (or the trash) does not allow. */
export function assertTransition(current: Property, op: LifecycleOp): void {
  const rule = TRANSITIONS[op];
  const trashed = current.deletedAt !== null;
  // An estate sells option by option, so "under offer" and "closed" would contradict
  // its options' own availability. It stays live until archived.
  if (!trashed && isEstate(current.type) && (op === "markOffer" || op === "close")) {
    throw new PreconditionFailedError("invalid_transition", {
      propertyId: current.id,
      detail: "An estate is sold option by option. Mark the options that have sold as sold out instead.",
    });
  }
  if (trashed === rule.trashed && rule.from.includes(current.status)) return;

  const detail = trashed
    ? `A listing in the trash cannot be ${OP_PHRASES[op]}. Restore it first.`
    : op === "restore"
      ? "This listing is not in the trash."
      : `${STATUS_PHRASES[current.status]} cannot be ${OP_PHRASES[op]}.`;
  throw new PreconditionFailedError("invalid_transition", { propertyId: current.id, detail });
}

/**
 * Writes the move against the revision `current` was read at, so the checks a
 * caller ran on that read (the allowed-from table, the publish blockers) hold
 * for the row actually written. A listing changed in between is a 409.
 */
export async function transitionProperty(
  db: Db,
  current: Property,
  op: LifecycleOp,
): Promise<Property> {
  assertTransition(current, op);
  const now = Date.now();
  const id = current.id;
  const status = TRANSITIONS[op].to;

  const set: Partial<PropertyDoc> = { status, updatedAt: now };
  // A sold or unpublished listing on the home page advertises something nobody
  // can act on, so leaving the featurable statuses takes the flag with it.
  if (!FEATURABLE_STATUSES.includes(status)) set.featured = false;

  if (op === "publish") {
    set.publishedAt = current.publishedAt ?? now;
    // The slug is derived at publish, from the title as it stands then. It is
    // server-authoritative and never accepted from a request body.
    if (current.slug === null) set.slug = await claimSlug(db, current.title, id);
  }
  if (op === "restore") set.deletedAt = null;

  const after = await properties(db).findOneAndUpdate(
    { _id: id, revision: current.revision },
    { $set: set, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (!after) {
    const reread = await properties(db).findOne({ _id: id });
    if (!reread) throw new NotFoundError(id);
    throw new StaleWriteError("property", current.revision, reread.revision, toProperty(reread));
  }
  return toProperty(after);
}

/**
 * Derives a free slug, retrying on the unique index rather than scanning for the
 * next free integer. A scan is a read per attempt against an index that will
 * answer the question anyway.
 */
async function claimSlug(db: Db, title: string, id: string): Promise<string | null> {
  const base = slugify(title);
  if (!base) return null;
  for (let candidate = base, attempt = 0; attempt < 5; attempt++) {
    const taken = await properties(db).findOne(
      { slug: candidate, _id: { $ne: id } },
      { projection: { _id: 1 } },
    );
    if (!taken) return candidate;
    candidate = disambiguateSlug(base);
  }
  throw new DuplicateError("slug", base);
}

/**
 * SOFT delete, to the trash, never destroyed.
 *
 * There is deliberately no hard-delete route: an enquiry that names a property
 * must not be able to point at nothing, and the only way to guarantee that
 * without a foreign key across a package boundary is not to offer the operation.
 */
export async function trashProperty(db: Db, id: string, baseRevision: number): Promise<Property> {
  const now = Date.now();
  const after = await properties(db).findOneAndUpdate(
    { _id: id, revision: baseRevision },
    { $set: { deletedAt: now, status: "archived", featured: false, updatedAt: now }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (after) return toProperty(after);
  const current = await properties(db).findOne({ _id: id });
  if (!current) throw new NotFoundError(id);
  throw new StaleWriteError("property", baseRevision, current.revision, toProperty(current));
}

/* ──────────────────────── testimonials and stats ──────────────────────── */

export async function listTestimonials(db: Db): Promise<Testimonial[]> {
  const docs = await collection<TestimonialDoc>(db, COLLECTIONS.testimonials)
    .find({}, { sort: { position: 1 } })
    .toArray();
  return docs.map(toTestimonial);
}

export async function listSiteStats(db: Db): Promise<SiteStat[]> {
  const docs = await collection<SiteStatDoc>(db, COLLECTIONS.siteStats)
    .find({}, { sort: { position: 1 } })
    .toArray();
  return docs.map(toSiteStat);
}

export async function upsertTestimonial(
  db: Db,
  id: string | null,
  body: Omit<Testimonial, "id">,
): Promise<Testimonial> {
  const now = Date.now();
  const _id = id ?? newId("tst", now);
  const doc: TestimonialDoc = { _id, ...body, createdAt: now, updatedAt: now };
  await collection<TestimonialDoc>(db, COLLECTIONS.testimonials).updateOne(
    { _id },
    { $set: { ...body, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  return toTestimonial(doc);
}

export async function deleteTestimonial(db: Db, id: string): Promise<boolean> {
  const result = await collection<TestimonialDoc>(db, COLLECTIONS.testimonials).deleteOne({ _id: id });
  return result.deletedCount === 1;
}

export async function upsertSiteStat(
  db: Db,
  id: string | null,
  body: Omit<SiteStat, "id">,
): Promise<SiteStat> {
  const now = Date.now();
  const _id = id ?? newId("stat", now);
  const set = {
    value: body.value,
    label: body.label,
    suffix: body.suffix ?? null,
    prefix: body.prefix ?? null,
    position: body.position,
    updatedAt: now,
  };
  await collection<SiteStatDoc>(db, COLLECTIONS.siteStats).updateOne(
    { _id },
    { $set: set, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  return toSiteStat({ _id, createdAt: now, ...set });
}

export async function deleteSiteStat(db: Db, id: string): Promise<boolean> {
  const result = await collection<SiteStatDoc>(db, COLLECTIONS.siteStats).deleteOne({ _id: id });
  return result.deletedCount === 1;
}
