import {
  FEE_KINDS,
  LISTING_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RENT_PERIODS,
} from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const BOOL = { bsonType: "bool" };
const STR_ARRAY = { bsonType: "array", items: { bsonType: "string" } };
/*
 * NOT 0005's narrower `{ bsonType: ["int", "long"] }`. That shape is correct for
 * a counter that stays small, which is all 0005 ever pins it to. `priceMinor` is
 * naira in kobo, so a mid-market Lagos sale clears 2^31 the moment it is priced
 * in minor units, and the driver serialises a plain JS number past that range as
 * a BSON double, never a Long. A query against the live properties collection
 * while writing this migration found exactly that split, 12 of 20 rows double
 * and 8 int, purely a function of price. `amountMinor` and `fromMinor`/`toMinor`
 * below are the same kind of number for the same reason, so they get the same
 * three-type set.
 */
const INT = { bsonType: ["long", "int", "double"] };

export const migration0007: Migration = {
  tag: "0007_listing_truth",
  why: `@avhomes/contracts now separates two things the old \`status\` enum ran
together: \`status\` is lifecycle (draft, live, under-offer, closed, archived)
and \`listingType\` is the deal (sale, rent). That split is a type today, not yet
a stored fact. Every property document on disk still carries the retired
five-value enum (draft, for-sale, for-rent, sold, archived) and has no
\`listingType\` field at all. This migration is what makes the collection agree
with the contract: the validator, the rewrite of every row, and the index the
type filter needs.

0005 argued against backfilling, and that argument does not transfer. An
enquiry written before the chat existed is missing \`channel\` and \`messages\`
outright, and absence there has exactly one honest reading: the feature did
not exist yet, which is what lets a read coalesce it to "form" forever without
that ever becoming a lie. A property's \`status\` is not absent. It is PRESENT
and, under the new enum, invalid: "for-sale" is not a lifecycle stage a reader
can coalesce into one, because the old word was standing in for two answers at
once (the listing is live, AND it is a sale) and the new schema has exactly one
slot to put a two-part answer in. Keeping a read-time translation table for five
retired strings alive is not a lighter commitment than rewriting the rows once;
it is the same translation paid on every read forever instead of once now, and
it is exactly how a deprecated vocabulary never actually leaves a codebase.

The old values do not all carry the same information. "for-sale" and "for-rent"
say the deal outright, so they map to \`sale\` and \`rent\` with nothing guessed.
"sold", "draft" and "archived" never recorded which kind of deal they were: the
old enum used one lifecycle word for "no longer listed" whether the listing had
been a sale or a let, and there is no other field on the old document a
migration could read to recover that. Those three default \`listingType\` to
"sale", and the count of rows this guessed on is logged for an operator to go
correct, rather than the guess quietly passing for a recorded fact.

\`rentPeriod\`, \`fees\` and \`priceHistory\` have no old counterpart at all, so
nothing here writes them. Their absence on a legacy row is resolved on read,
the same idiom \`channel ?? "form"\` already uses.

The index is additive rather than a replacement. \`properties_public\` (status,
deletedAt, publishedAt, _id) is the public list's sort index, and
\`ensureIndex\` is a bare \`createIndex\` with no drop, so recreating that exact
name with \`listingType\` spliced into its keys is an \`IndexKeySpecsConflict\`
against the copy 0001 already created, on a fresh database as much as an old
one, because 0001 always runs before this does. A second index carries
\`listingType\` for the one query that actually filters on it, the admin's type
facet, and leaves the default public list exactly as indexed as it has always
been.`,

  async up(db) {
    /*
     * VALIDATOR FIRST. validationLevel is "moderate", which validates an insert
     * always but an update only when the document already satisfied the schema
     * before that update. A `for-sale` row satisfies the OLD (0001) validator,
     * so if the backfill below ran before this collMod, setting its status to
     * "live" would be checked against the enum that does not contain "live" and
     * Mongo would refuse it. Applying the new validator first flips that: the
     * row stops satisfying the schema the instant the validator changes (its
     * status is not in the new enum and it has no listingType), moderate then
     * skips validating further writes to it, and the $set that finally makes it
     * compliant goes through unchecked. Doing this in the other order fails the
     * very first time the migration runs.
     */
    await ensureCollection(db, COLLECTIONS.properties, {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "_id",
          "title",
          "status",
          "listingType",
          "type",
          "priceMinor",
          "currency",
          "revision",
          "createdAt",
        ],
        properties: {
          _id: STR,
          slug: NULLABLE_STR,
          title: STR,
          tagline: STR,
          description: STR,
          priceMinor: INT,
          currency: STR,
          status: { enum: [...PROPERTY_STATUSES] },
          listingType: { enum: [...LISTING_TYPES] },
          // Null on a sale. Absent entirely on every row this migration does
          // not rewrite; readRentPeriod resolves that absence on read.
          rentPeriod: { enum: [...RENT_PERIODS, null] },
          fees: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["kind", "amountMinor", "currency"],
              properties: {
                kind: { enum: [...FEE_KINDS] },
                amountMinor: INT,
                // Defaults to the listing's currency but stored, so a fee can
                // disagree with it. See moveInTotalMinor for what happens then.
                currency: STR,
              },
            },
          },
          // At most one entry per kind and de-duplication are normalizeFees's
          // rules, not this schema's; this only pins the shape and FEE_KINDS.
          priceHistory: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["at", "fromMinor", "toMinor", "currency", "byUserId", "byName"],
              properties: {
                at: TS,
                fromMinor: INT,
                toMinor: INT,
                currency: STR,
                // Null for a change made outside a signed-in session. Present
                // either way, never absent, unlike a legacy row's rentPeriod.
                byUserId: NULLABLE_STR,
                // SNAPSHOT of who changed it, as EnquiryMessage.authorName is.
                byName: STR,
              },
            },
          },
          // Capped at PRICE_HISTORY_MAX by the write path; not this schema's job.
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

    /*
     * THE BACKFILL. Five updateMany calls, one per retired status, in the order
     * the design settled on. "for-sale" and "for-rent" map with nothing
     * guessed. "sold", "draft" and "archived" never recorded which kind of deal
     * they were, so listingType defaults to "sale" on those three, and the sum
     * of how many rows that touched is logged below for an operator to check.
     */
    const properties = db.collection(COLLECTIONS.properties);

    await properties.updateMany(
      { status: "for-sale" },
      { $set: { listingType: "sale", status: "live" } },
    );
    await properties.updateMany(
      { status: "for-rent" },
      { $set: { listingType: "rent", status: "live" } },
    );
    const sold = await properties.updateMany(
      { status: "sold" },
      { $set: { listingType: "sale", status: "closed" } },
    );
    const draft = await properties.updateMany(
      { status: "draft" },
      { $set: { listingType: "sale", status: "draft" } },
    );
    const archived = await properties.updateMany(
      { status: "archived" },
      { $set: { listingType: "sale", status: "archived" } },
    );

    const defaulted = sold.modifiedCount + draft.modifiedCount + archived.modifiedCount;
    const rowWord = defaulted === 1 ? "row" : "rows";
    console.log(
      `listingType defaulted to "sale" on ${defaulted} ${rowWord} (draft, sold or archived). ` +
        `A row that was actually a rental needs changing by hand in the admin.`,
    );

    /*
     * A SECOND index, not a replacement. Touching properties_public's keys
     * would be an IndexKeySpecsConflict, since ensureIndex never drops. This one
     * exists for the admin's type facet alone, so the default public list keeps
     * the exact index it always sorted on.
     */
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { listingType: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1 },
      { name: "properties_public_type" },
    );
  },
};
