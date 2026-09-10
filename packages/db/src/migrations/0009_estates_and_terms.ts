import {
  BUILD_STAGES,
  FEATURABLE_STATUSES,
  FEE_KINDS,
  FURNISHINGS,
  LISTING_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PROTOTYPE_KINDS,
  RENT_PERIODS,
  TITLE_DOCUMENTS,
} from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const BOOL = { bsonType: "bool" };
const STR_ARRAY = { bsonType: "array", items: { bsonType: "string" } };
// 0007's wide set, for the same reason: a price in kobo crosses 2^31 and the
// driver then writes a double. Reused for the small counters here for symmetry.
const INT = { bsonType: ["long", "int", "double"] };
const NULLABLE_INT = { bsonType: ["long", "int", "double", "null"] };

export const migration0009: Migration = {
  tag: "0009_estates_and_terms",
  why: `@avhomes/contracts now knows three things a listing could not say before:
an "Estate Land" type sold as one listing with several options inside it, the
terms a let actually runs on (furnishing, serviced, available from, minimum
stay), and the title document behind a sale. The validator is what keeps a bug
from writing an estate option with no price or a furnishing nobody defined, so
it has to learn the new shape. It is 0007's validator in full plus the new type
enum and the new fields, not a patch on top of it, because collMod replaces the
validator whole.

No row is rewritten for the new fields. Absence has one honest reading on every
one of them: not an estate, nothing stated. toProperty resolves it on read, the
same idiom 0007 used for \`rentPeriod\`, \`fees\` and \`priceHistory\`.

The one backfill is \`featured\`. The flag now only means something on a live or
under offer listing that is not in the trash, and the lifecycle routes clear it
on the way out. Rows featured before that rule existed would otherwise keep a
sold or trashed house on the home page, so they are cleared once, here, and
counted.`,

  async up(db) {
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
          rentPeriod: { enum: [...RENT_PERIODS, null] },
          fees: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["kind", "amountMinor", "currency"],
              properties: {
                kind: { enum: [...FEE_KINDS] },
                amountMinor: INT,
                currency: STR,
              },
            },
          },
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
                byUserId: NULLABLE_STR,
                byName: STR,
              },
            },
          },
          // Read from PROPERTY_TYPES, so "Estate Land" arrives with the contract.
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
          // Estate Land only. The cap and unique ids are the PATCH route's
          // rules; this pins the shape each option must have.
          prototypes: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: [
                "id",
                "kind",
                "name",
                "bedrooms",
                "bathrooms",
                "sizeSqm",
                "priceMinor",
                "image",
                "available",
              ],
              properties: {
                id: STR,
                kind: { enum: [...PROTOTYPE_KINDS] },
                name: STR,
                bedrooms: INT,
                bathrooms: INT,
                sizeSqm: INT,
                priceMinor: INT,
                image: NULLABLE_STR,
                available: BOOL,
              },
            },
          },
          paymentPlan: {
            bsonType: ["object", "null"],
            required: ["depositPercent", "months", "note"],
            properties: {
              depositPercent: INT,
              months: INT,
              note: STR,
            },
          },
          buildStage: { enum: [...BUILD_STAGES, null] },
          titleDocument: { enum: [...TITLE_DOCUMENTS, null] },
          furnishing: { enum: [...FURNISHINGS, null] },
          serviced: BOOL,
          // Epoch ms at UTC midnight. Null means available now.
          availableFrom: NULLABLE_TS,
          minStay: NULLABLE_INT,
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

    const cleared = await db.collection(COLLECTIONS.properties).updateMany(
      {
        featured: true,
        $or: [{ status: { $nin: [...FEATURABLE_STATUSES] } }, { deletedAt: { $ne: null } }],
      },
      { $set: { featured: false } },
    );
    const rowWord = cleared.modifiedCount === 1 ? "row" : "rows";
    console.log(
      `featured cleared on ${cleared.modifiedCount} ${rowWord} that were not live or under offer, or were in the trash.`,
    );
  },
};
