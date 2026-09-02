import {
  ALL_ROLES,
  ENQUIRY_STATUSES,
  POST_STATUSES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  READING_TEMPLATES,
} from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

/**
 * Every enum-ish field carries a validator enum, mirroring the SQL habit of a
 * CHECK on every such column. A TypeScript union is compile-time only: without
 * this, a bug anywhere in the process could persist `role: "admin"` and nothing
 * would notice until it granted something.
 *
 * Timestamps are `long` OR `int` OR `double` because the driver may write an
 * epoch-ms number as any of the three depending on its magnitude and on whether
 * it arrived through JSON. Pinning one bson type here rejects perfectly valid
 * writes for a reason no error message would explain.
 */
const TS = { bsonType: ["long", "int", "double"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const INT = { bsonType: ["long", "int", "double"] };
const BOOL = { bsonType: "bool" };
const STR_ARRAY = { bsonType: "array", items: { bsonType: "string" } };

export const migration0001: Migration = {
  tag: "0001_init",
  why: `Creates every collection with its JSON Schema validator and the indexes the
read paths depend on. Keyset pagination needs a compound index per sort order,
and without one Mongo silently falls back to a collection scan that only becomes
visible as a timeout once the data is real.`,

  async up(db) {
    /* ───────────────────────────── identity ──────────────────────────── */

    await ensureCollection(db, COLLECTIONS.users, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "displayName", "role", "createdAt"],
        properties: {
          _id: STR,
          email: STR,
          displayName: STR,
          role: { enum: [...ALL_ROLES] },
          // Null when the deployment runs the Clerk door, or before a claim.
          passwordHash: NULLABLE_STR,
          createdAt: TS,
          updatedAt: TS,
          disabledAt: NULLABLE_TS,
        },
      },
    });
    // Lowercased on write, so a plain unique index is the whole constraint.
    await ensureIndex(db, COLLECTIONS.users, { email: 1 }, { unique: true, name: "users_email_uq" });
    await ensureIndex(db, COLLECTIONS.users, { role: 1 }, { name: "users_role" });

    await ensureCollection(db, COLLECTIONS.sessions, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "createdAt", "expiresAt", "absoluteExpiresAt"],
        properties: {
          // The HMAC of the token under SESSION_SECRET. The raw token is never stored.
          _id: STR,
          userId: STR,
          createdAt: TS,
          lastSeenAt: TS,
          expiresAt: TS,
          absoluteExpiresAt: TS,
          expiresAtDate: { bsonType: "date" },
          userAgent: NULLABLE_STR,
        },
      },
    });
    await ensureIndex(db, COLLECTIONS.sessions, { userId: 1 }, { name: "sessions_user" });
    /*
     * A TTL index needs a real BSON date, and every timestamp in this schema is
     * an epoch-ms number. `expiresAtDate` exists ONLY for this index: it is
     * written beside `expiresAt` and never read by the application, so the
     * number stays the single authority on whether a session is alive. Mongo
     * sweeping the row late is harmless, because resolveSession filters on
     * `expiresAt` anyway.
     */
    await ensureIndex(
      db,
      COLLECTIONS.sessions,
      { expiresAtDate: 1 },
      { expireAfterSeconds: 0, name: "sessions_ttl" },
    );

    await ensureCollection(db, COLLECTIONS.invites, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "role", "invitedBy", "createdAt", "expiresAt"],
        properties: {
          _id: STR,
          email: STR,
          role: { enum: [...ALL_ROLES] },
          invitedBy: STR,
          createdAt: TS,
          expiresAt: TS,
          acceptedAt: NULLABLE_TS,
        },
      },
    });
    // The claim query is (email, acceptedAt null, expiresAt gt now) ordered by
    // createdAt, so the index carries all four in that order.
    await ensureIndex(
      db,
      COLLECTIONS.invites,
      { email: 1, acceptedAt: 1, expiresAt: -1, createdAt: -1 },
      { name: "invites_claim" },
    );

    await ensureCollection(db, COLLECTIONS.authAttempts, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "key", "windowStart", "count"],
        properties: {
          _id: STR,
          key: STR,
          windowStart: TS,
          count: INT,
          expiresAtDate: { bsonType: "date" },
        },
      },
    });
    await ensureIndex(
      db,
      COLLECTIONS.authAttempts,
      { expiresAtDate: 1 },
      { expireAfterSeconds: 0, name: "auth_attempts_ttl" },
    );

    /* ───────────────────────────── listings ──────────────────────────── */

    await ensureCollection(db, COLLECTIONS.properties, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "title", "status", "type", "priceMinor", "currency", "revision", "createdAt"],
        properties: {
          _id: STR,
          // Nullable AND unique: drafts hold null until titled, and a unique
          // index with a partial filter permits many nulls.
          slug: NULLABLE_STR,
          title: STR,
          tagline: STR,
          description: STR,
          priceMinor: INT,
          currency: STR,
          status: { enum: [...PROPERTY_STATUSES] },
          type: { enum: [...PROPERTY_TYPES] },
          location: STR,
          city: STR,
          address: STR,
          bedrooms: INT,
          bathrooms: INT,
          areaSqft: INT,
          parkingSpaces: INT,
          yearBuilt: INT,
          featured: BOOL,
          amenities: STR_ARRAY,
          images: STR_ARRAY,
          agent: { bsonType: "object" },
          agentUserId: NULLABLE_STR,
          createdAt: TS,
          updatedAt: TS,
          publishedAt: NULLABLE_TS,
          deletedAt: NULLABLE_TS,
          revision: INT,
        },
      },
    });
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { slug: 1 },
      {
        unique: true,
        name: "properties_slug_uq",
        // Partial rather than sparse: sparse skips nulls but still indexes
        // documents where the field is absent, which is a different set.
        partialFilterExpression: { slug: { $type: "string" } },
      },
    );
    /*
     * One compound index per sort order the list route offers. The keyset query
     * is `{ $or: [{ k: { $lt: v } }, { k: v, _id: { $lt: id } }] }`, so the
     * tiebreaker has to be in the index or the sort spills to memory and Mongo
     * refuses it past 32MB.
     */
    await ensureIndex(db, COLLECTIONS.properties, { publishedAt: -1, _id: -1 }, { name: "properties_published" });
    await ensureIndex(db, COLLECTIONS.properties, { updatedAt: -1, _id: -1 }, { name: "properties_updated" });
    await ensureIndex(db, COLLECTIONS.properties, { priceMinor: -1, _id: -1 }, { name: "properties_price_desc" });
    await ensureIndex(db, COLLECTIONS.properties, { priceMinor: 1, _id: 1 }, { name: "properties_price_asc" });
    // The public list always filters on status first, so it leads the index.
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { status: 1, deletedAt: 1, publishedAt: -1, _id: -1 },
      { name: "properties_public" },
    );
    await ensureIndex(db, COLLECTIONS.properties, { agentUserId: 1 }, { name: "properties_agent" });
    await ensureIndex(db, COLLECTIONS.properties, { city: 1, type: 1 }, { name: "properties_facets" });
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { title: "text", tagline: "text", description: "text", city: "text", location: "text" },
      { name: "properties_text", weights: { title: 10, city: 5, tagline: 3, location: 3, description: 1 } },
    );

    await ensureCollection(db, COLLECTIONS.testimonials, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "quote", "rating", "position"],
        properties: {
          _id: STR,
          name: STR,
          role: STR,
          quote: STR,
          rating: INT,
          initials: STR,
          position: INT,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });
    await ensureIndex(db, COLLECTIONS.testimonials, { position: 1 }, { name: "testimonials_position" });

    await ensureCollection(db, COLLECTIONS.siteStats, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "value", "label", "position"],
        properties: {
          _id: STR,
          value: INT,
          label: STR,
          suffix: NULLABLE_STR,
          prefix: NULLABLE_STR,
          position: INT,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });
    await ensureIndex(db, COLLECTIONS.siteStats, { position: 1 }, { name: "site_stats_position" });

    /* ───────────────────────────── content ───────────────────────────── */

    await ensureCollection(db, COLLECTIONS.posts, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "title", "status", "content", "authorId", "revision", "createdAt"],
        properties: {
          _id: STR,
          slug: NULLABLE_STR,
          title: STR,
          subtitle: STR,
          excerpt: STR,
          excerptSource: { enum: ["derived", "author"] },
          content: { bsonType: "object" },
          // Derived on write and never returned on the wire.
          contentText: STR,
          coverImage: { bsonType: ["object", "null"] },
          category: STR,
          tags: STR_ARRAY,
          template: { enum: [...READING_TEMPLATES, null] },
          status: { enum: [...POST_STATUSES] },
          wordCount: INT,
          readingTime: INT,
          authorId: STR,
          createdAt: TS,
          updatedAt: TS,
          publishedAt: NULLABLE_TS,
          deletedAt: NULLABLE_TS,
          revision: INT,
        },
      },
    });
    await ensureIndex(
      db,
      COLLECTIONS.posts,
      { slug: 1 },
      { unique: true, name: "posts_slug_uq", partialFilterExpression: { slug: { $type: "string" } } },
    );
    await ensureIndex(
      db,
      COLLECTIONS.posts,
      { status: 1, deletedAt: 1, publishedAt: -1, _id: -1 },
      { name: "posts_public" },
    );
    await ensureIndex(db, COLLECTIONS.posts, { updatedAt: -1, _id: -1 }, { name: "posts_updated" });
    await ensureIndex(db, COLLECTIONS.posts, { authorId: 1 }, { name: "posts_author" });
    await ensureIndex(
      db,
      COLLECTIONS.posts,
      { title: "text", subtitle: "text", contentText: "text" },
      { name: "posts_text", weights: { title: 10, subtitle: 4, contentText: 1 } },
    );

    await ensureCollection(db, COLLECTIONS.postRevisions, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "postId", "revision", "kind", "createdAt", "authorId"],
        properties: {
          _id: STR,
          postId: STR,
          revision: INT,
          kind: { enum: ["autosave", "manual", "publish", "status"] },
          snapshot: { bsonType: "object" },
          note: NULLABLE_STR,
          authorId: STR,
          createdAt: TS,
        },
      },
    });
    await ensureIndex(
      db,
      COLLECTIONS.postRevisions,
      { postId: 1, revision: -1 },
      { name: "post_revisions_post" },
    );

    await ensureCollection(db, COLLECTIONS.categories, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "slug", "name", "position"],
        properties: {
          _id: STR,
          slug: STR,
          name: STR,
          blurb: STR,
          accent: STR,
          position: INT,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });
    await ensureIndex(db, COLLECTIONS.categories, { slug: 1 }, { unique: true, name: "categories_slug_uq" });

    /* ────────────────────────────── media ───────────────────────────── */

    await ensureCollection(db, COLLECTIONS.images, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "url", "contentType", "createdAt", "uploadedBy"],
        properties: {
          _id: STR,
          url: STR,
          alt: STR,
          contentType: STR,
          width: INT,
          height: INT,
          bytes: INT,
          pathname: STR,
          createdAt: TS,
          updatedAt: TS,
          uploadedBy: STR,
        },
      },
    });
    await ensureIndex(db, COLLECTIONS.images, { createdAt: -1, _id: -1 }, { name: "images_created" });
    await ensureIndex(db, COLLECTIONS.images, { uploadedBy: 1 }, { name: "images_uploader" });

    /* ──────────────────────────── enquiries ─────────────────────────── */

    await ensureCollection(db, COLLECTIONS.enquiries, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "email", "message", "status", "createdAt", "revision"],
        properties: {
          _id: STR,
          name: STR,
          email: STR,
          phone: NULLABLE_STR,
          message: STR,
          propertyId: NULLABLE_STR,
          propertySlug: NULLABLE_STR,
          status: { enum: [...ENQUIRY_STATUSES] },
          createdAt: TS,
          updatedAt: TS,
          handledBy: NULLABLE_STR,
          note: NULLABLE_STR,
          // Kept for abuse triage. Never returned on the wire.
          sourceIp: NULLABLE_STR,
          revision: INT,
        },
      },
    });
    await ensureIndex(
      db,
      COLLECTIONS.enquiries,
      { status: 1, createdAt: -1, _id: -1 },
      { name: "enquiries_inbox" },
    );
    await ensureIndex(db, COLLECTIONS.enquiries, { createdAt: -1, _id: -1 }, { name: "enquiries_created" });
    await ensureIndex(db, COLLECTIONS.enquiries, { propertyId: 1 }, { name: "enquiries_property" });
  },
};
