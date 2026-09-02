import type { Filter } from "mongodb";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  DuplicateError,
  NotFoundError,
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
  PUBLIC_PROPERTY_STATUSES,
  type Page,
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

export interface ListQuery {
  sort: PropertySort;
  limit: number;
  cursor?: string | undefined;
  status?: PropertyStatus | undefined;
  type?: PropertyType | undefined;
  city?: string | undefined;
  bedrooms?: number | undefined;
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  featured?: boolean | undefined;
  q?: string | undefined;
  agentUserId?: string | undefined;
  /** Admin lists see drafts and trash; the public list never does. */
  includeHidden?: boolean;
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
  if (query.city) and.push({ city: query.city });
  if (query.bedrooms !== undefined) and.push({ bedrooms: { $gte: query.bedrooms } });
  if (query.featured !== undefined) and.push({ featured: query.featured });
  if (query.agentUserId) and.push({ agentUserId: query.agentUserId });

  if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) {
    const range: Record<string, number> = {};
    if (query.minPriceMinor !== undefined) range.$gte = query.minPriceMinor;
    if (query.maxPriceMinor !== undefined) range.$lte = query.maxPriceMinor;
    and.push({ priceMinor: range } as Filter<PropertyDoc>);
  }

  /*
   * Text search and keyset paging do not compose: $text sorts by relevance,
   * which is not a stored field, so there is no value to put in a cursor. A
   * search is therefore a single bounded page, which is what a search box on
   * this site actually needs.
   */
  if (query.q) and.push({ $text: { $search: query.q } } as Filter<PropertyDoc>);

  const keyset = keysetFilter<PropertyDoc>(PROPERTY_SORTS[query.sort], query.cursor, query.sort);
  if (Object.keys(keyset).length > 0) and.push(keyset);

  return and.length === 0 ? {} : { $and: and };
}

export async function listProperties(db: Db, query: ListQuery): Promise<Page<Property>> {
  const spec = PROPERTY_SORTS[query.sort];
  const filter = buildFilter(query);

  const docs = await properties(db)
    .find(filter, {
      sort: query.q ? { score: { $meta: "textScore" } } : keysetSort(spec),
      // One extra, to answer "is there another page" without a count.
      limit: query.limit + 1,
    })
    .toArray();

  const { items, nextCursor } = takePage(docs, query.limit, spec, query.sort);
  return {
    items: items.map(toProperty),
    // A text search returns one page by construction, so it never offers a cursor.
    nextCursor: query.q ? null : nextCursor,
  };
}

export async function countProperties(db: Db, query: ListQuery): Promise<number> {
  return properties(db).countDocuments(buildFilter({ ...query, cursor: undefined }));
}

export async function getPropertyBySlug(db: Db, slug: string): Promise<Property | null> {
  const doc = await properties(db).findOne({
    slug,
    deletedAt: null,
    status: { $in: [...PUBLIC_PROPERTY_STATUSES] },
  });
  return doc ? toProperty(doc) : null;
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
    type: "Apartment",
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
  Omit<PropertyDoc, "_id" | "slug" | "status" | "createdAt" | "updatedAt" | "publishedAt" | "deletedAt" | "revision">
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
 */
export async function saveProperty(
  db: Db,
  id: string,
  patch: PropertyPatch,
  baseRevision: number,
): Promise<Property> {
  const now = Date.now();
  const after = await properties(db).findOneAndUpdate(
    { _id: id, revision: baseRevision, deletedAt: null },
    { $set: { ...patch, updatedAt: now }, $inc: { revision: 1 } },
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
export type LifecycleOp = "publish" | "unpublish" | "archive" | "unarchive" | "restore";

export async function transitionProperty(
  db: Db,
  id: string,
  op: LifecycleOp,
  status: PropertyStatus,
): Promise<Property> {
  const now = Date.now();
  const current = await properties(db).findOne({ _id: id });
  if (!current) throw new NotFoundError(id);

  const set: Partial<PropertyDoc> = { status, updatedAt: now };

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
    { $set: { deletedAt: now, status: "archived", updatedAt: now }, $inc: { revision: 1 } },
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
