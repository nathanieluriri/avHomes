import type { Db, Document } from "mongodb";
import {
  AWARD_STATUSES,
  BUILD_STAGES,
  CLOSER_KINDS,
  DEAL_KINDS,
  DEAL_SOURCES,
  DEAL_STATUSES,
  FEE_KINDS,
  FUND_ENTRY_KINDS,
  FUND_KINDS,
  FURNISHINGS,
  LISTING_TYPES,
  OWNERSHIPS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PROTOTYPE_KINDS,
  RENT_PERIODS,
  TITLE_DOCUMENTS,
} from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";
import { usersValidator } from "./0005_enquiry_threads";
import { auditValidator } from "./0008_audit";

const TS = { bsonType: ["long", "int", "double"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const BOOL = { bsonType: "bool" };
const ARR = { bsonType: "array" };
const STR_ARRAY = { bsonType: "array", items: { bsonType: "string" } };
/* 0007's wide set. A price in kobo crosses 2^31 on any real Lagos property, so
   the driver writes a double, and a commission on one is the same size. */
const INT = { bsonType: ["long", "int", "double"] };
const NULLABLE_INT = { bsonType: ["long", "int", "double", "null"] };
const MONEY = { bsonType: ["long", "int", "double"] };
/** A percentage. Signed money needs no minimum; a rate does not need one either. */
const RATE = { bsonType: ["double", "int", "long"] };

/**
 * The properties validator, as a function, which 0009 wrote inline.
 *
 * Lifted here for the reason `usersValidator` and `auditValidator` already exist:
 * a validator is frozen at the moment it is applied, so a status or an ownership
 * added later is refused by every database that ran the older migration. Built
 * from the contracts constants, a fresh database gets every value and an old one
 * gets them the next time a migration re-applies this.
 */
export function propertiesValidator(): Document {
  return {
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
        /* Whose property this is, which is what the commission rate reads. Not
           required: every row that predates it is backfilled below, and a
           moderate validator would otherwise refuse an update to a row the
           backfill has not reached yet. */
        ownership: { enum: [...OWNERSHIPS] },
        ownerLabel: STR,
        /* The deal that closed it. Written only by the one flow that closes a
           listing, so a value here without an approved deal behind it is a bug
           reconcile() will name. */
        closedDealId: NULLABLE_STR,
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
        type: { enum: [...PROPERTY_TYPES] },
        location: STR,
        city: STR,
        address: STR,
        mapUrl: STR,
        bedrooms: INT,
        bathrooms: INT,
        areaSqft: INT,
        parkingSpaces: INT,
        yearBuilt: INT,
        featured: BOOL,
        amenities: STR_ARRAY,
        images: STR_ARRAY,
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
        availableFrom: NULLABLE_TS,
        minStay: NULLABLE_INT,
        seoTitle: STR,
        seoDescription: STR,
        previousSlugs: STR_ARRAY,
        agent: { bsonType: "object" },
        agentUserId: NULLABLE_STR,
        createdAt: TS,
        updatedAt: TS,
        publishedAt: NULLABLE_TS,
        deletedAt: NULLABLE_TS,
        revision: INT,
      },
    },
  };
}

/** The five shares of a deal, as stored on the deal that applied them. */
const SPLIT = {
  bsonType: "object",
  required: ["level1", "level2", "level3", "rewardPool", "foundation"],
  properties: {
    level1: RATE,
    level2: RATE,
    level3: RATE,
    rewardPool: RATE,
    foundation: RATE,
  },
};

/** Visits are aggregate fuel, not records. The same 90 days `visits` keeps. */
const VIEW_TTL_SECONDS = 0;

export const migration0015: Migration = {
  tag: "0015_analytics_and_funds",
  why: `Three things arrive together because they are one thing: a listing now
says whose property it is, a deal records who closed it and what every share of
it was, and two of those shares go to pots that belong to nobody.

WHOSE PROPERTY. AV Homes paid 5/2/1 on every deal whoever owned the house, so
selling third party stock earned a fraction of the revenue and cost the same
commission. \`ownership\` is what makes the rate follow the economics, and it is
backfilled to \`av\` because every listing that exists today is AV Homes' own.
It is deliberately NOT derived from \`agentUserId\`: an agent can list a
partner's property for an owner who holds no account.

THE TWO FUNDS get \`fund_ledger\` rather than rows in \`marketing_ledger\`, and
that separation is the whole reason this collection exists. \`reconcile()\` proves
the marketer ledger balances against what marketers are owed; a row in there with
no person behind it would break the one check the money side must never hide. The
discipline is identical though: append only, signed, a correction is a new
negative row, and a balance is always a sum.

\`reward_awards\` is one document per quarter with the standings SNAPSHOTTED. A
deal recorded next week must not rewrite who won a quarter already settled, and
\`quarter\` is unique because a second award for one quarter would be a second
prize nobody voted for.

DEALS gain eight fields. \`closerKind\` separates who closed a deal from who
filed the report, which used to be the same person by construction because the
console had no way to record one. That is exactly why the backfill can assert
what it does: every existing row was filed in the app by the marketer who closed
it, on an AV Homes property, so \`closerKind: "marketer"\`, \`source: "app"\` and
\`ownership: "av"\` are facts about those rows rather than guesses.

\`split\` is NOT backfilled. An old deal's \`shares\` already record what was
actually paid and at what rate; inventing the cell those rates came from would
assert a table that did not exist when the deal settled. The reader coalesces a
missing \`split\` from the shares instead.

\`listing_views\` counts views per listing per day and HOLDS NO PERSON, matching
the position \`visits\` already takes: the rate limiter keys on an IP in its own
collection where a TTL sweeps it within the hour, and repeating it here would
turn a counter into a page-view log tied to a reader. Same 90 day TTL, same two
comparison windows, then gone.

\`partner_applications\` is somebody outside AV Homes asking to list property. The
unique index is PARTIAL on undecided rows, so one address can apply again after a
refusal but cannot have two open applications racing an approval.

The users and audit validators are re-applied at the end. A validator freezes the
enums it was built from, so a database that migrated before the \`partner\` role
and the three new audit entities existed would refuse every account and every log
line this release writes.`,

  async up(db: Db) {
    /* ─────────────────────────────── properties ─────────────────────────── */

    /*
     * THE BACKFILL BEFORE THE VALIDATOR, deliberately, and 0007 made the same
     * choice for the same reason. A moderate validator checks any update to a
     * document that already satisfies the schema, so applying it first would be
     * harmless, but a row still missing `ownership` would then be validated
     * against a schema naming a field the backfill has not written yet on the
     * very update that writes it. Backfilling first means every row satisfies
     * the schema by the time the schema exists.
     */
    const owned = await db.collection(COLLECTIONS.properties).updateMany(
      { ownership: { $exists: false } },
      { $set: { ownership: "av", ownerLabel: "", closedDealId: null } },
    );
    console.log(
      `ownership set to av on ${owned.modifiedCount} ${plural(owned.modifiedCount, "listing")}.`,
    );

    await ensureCollection(db, COLLECTIONS.properties, propertiesValidator());

    // The analytics split, and the review queue a partner's submission lands in.
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { ownership: 1, status: 1, closedDealId: 1 },
      { name: "properties_ownership" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.properties,
      { status: 1, updatedAt: -1, _id: -1 },
      { name: "properties_review_queue" },
    );

    /* ──────────────────────────────── deals ─────────────────────────────── */

    /*
     * An aggregation pipeline update, because `closerId` copies `reporterId` and
     * a plain `$set` cannot read another field. Filtered on the absence of
     * `closerKind`, so a re-run touches nothing.
     */
    const closed = await db.collection(COLLECTIONS.marketingDeals).updateMany(
      { closerKind: { $exists: false } },
      [
        {
          $set: {
            closerKind: "marketer",
            closerId: "$reporterId",
            closerName: "$reporterName",
            ownership: "av",
            source: "app",
            fundShares: [],
            keptMinor: 0,
          },
        },
      ],
    );
    console.log(
      `closer set on ${closed.modifiedCount} ${plural(closed.modifiedCount, "deal")}, all marketer-closed from the app.`,
    );

    await ensureCollection(db, COLLECTIONS.marketingDeals, {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "_id",
          "listingId",
          "listingType",
          "amountMinor",
          "currency",
          "reporterId",
          "status",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          _id: STR,
          listingId: STR,
          listingTitle: STR,
          listingLocation: STR,
          listingEstate: STR,
          listingType: { enum: [...DEAL_KINDS] },
          unitKey: STR,
          amountMinor: MONEY,
          currency: STR,
          buyerName: STR,
          buyerPhone: STR,
          proof: ARR,
          note: STR,
          // Who FILED it. For a marketer deal this is also the closer.
          reporterId: STR,
          reporterName: STR,
          reporterCode: STR,
          // Who CLOSED it, which is who the money and the leaderboard follow.
          closerKind: { enum: [...CLOSER_KINDS] },
          closerId: STR,
          closerName: STR,
          ownership: { enum: [...OWNERSHIPS] },
          /* Not required: a deal settled before the matrix existed has `shares`
             recording what was paid, and inventing the cell behind them would
             assert a table that did not exist. The reader coalesces it. */
          split: SPLIT,
          fundShares: ARR,
          keptMinor: MONEY,
          source: { enum: [...DEAL_SOURCES] },
          leadId: NULLABLE_STR,
          status: { enum: [...DEAL_STATUSES] },
          reason: STR,
          reviewedBy: STR,
          reviewedByName: STR,
          reviewedAt: NULLABLE_TS,
          closedOn: TS,
          shares: ARR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    // The league table reads by closer, which the reporter index cannot serve:
    // a staff-closed deal has a reporter who is an admin, not the closer.
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { closerKind: 1, closerId: 1, closedOn: -1 },
      { name: "marketing_deals_closer" },
    );
    // Every analytics read over a period, filtered by settled status first.
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { status: 1, closedOn: -1, _id: -1 },
      { name: "marketing_deals_period" },
    );

    /* ───────────────────────────── fund ledger ──────────────────────────── */

    await ensureCollection(db, COLLECTIONS.fundLedger, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "fund", "kind", "amountMinor", "currency", "createdAt"],
        properties: {
          /* Derived from the deal and the fund on an accrual, not minted, which
             is what makes accrueForDeal idempotent: a retry after a crash
             between the ledger write and this one hits a duplicate key rather
             than counting the same sale twice. */
          _id: STR,
          fund: { enum: [...FUND_KINDS] },
          kind: { enum: [...FUND_ENTRY_KINDS] },
          /* SIGNED, and with no minimum on purpose. A payout and a reversal are
             both negative, and the balance is the sum, so a floor here would
             make a correction impossible to record. */
          amountMinor: MONEY,
          currency: STR,
          dealId: NULLABLE_STR,
          rate: RATE,
          awardId: NULLABLE_STR,
          note: STR,
          proof: ARR,
          byName: STR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.fundLedger,
      { fund: 1, createdAt: -1, _id: -1 },
      { name: "fund_ledger_statement" },
    );
    // Reversing one deal's accruals when it falls through.
    await ensureIndex(db, COLLECTIONS.fundLedger, { dealId: 1 }, { name: "fund_ledger_deal" });

    /* ──────────────────────────── reward awards ─────────────────────────── */

    await ensureCollection(db, COLLECTIONS.rewardAwards, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "quarter", "status", "potMinor", "currency", "createdAt"],
        properties: {
          _id: STR,
          quarter: STR,
          status: { enum: [...AWARD_STATUSES] },
          potMinor: MONEY,
          currency: STR,
          // A SNAPSHOT. A later deal must not rewrite a settled quarter.
          standings: ARR,
          winnerKind: { enum: ["marketer", "staff", null] },
          winnerId: NULLABLE_STR,
          winnerName: NULLABLE_STR,
          // A marketer winner's adjust line. Null for staff, who have no ledger.
          ledgerLineId: NULLABLE_STR,
          reference: STR,
          proof: ARR,
          reason: STR,
          decidedByName: STR,
          decidedAt: NULLABLE_TS,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    // One prize per quarter. A second would be a second prize nobody decided on.
    await ensureIndex(
      db,
      COLLECTIONS.rewardAwards,
      { quarter: 1 },
      { name: "reward_awards_quarter", unique: true },
    );

    /* ───────────────────────────── listing views ────────────────────────── */

    await ensureCollection(db, COLLECTIONS.listingViews, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "listingId", "day", "views", "expiresAtDate"],
        properties: {
          /* `<listingId>:<day>`, so a day's counter is one upsert with no read
             and no risk of two beacons racing a find-then-write. */
          _id: STR,
          listingId: STR,
          // UTC, because a day boundary that moves with the reader makes two
          // dashboards disagree. Same rule as `visits`.
          day: STR,
          views: INT,
          sessions: INT,
          // Written only so the TTL index can sweep the row. Never read.
          expiresAtDate: { bsonType: "date" },
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.listingViews,
      { listingId: 1, day: 1 },
      { name: "listing_views_funnel" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.listingViews,
      { day: 1, views: -1 },
      { name: "listing_views_top" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.listingViews,
      { expiresAtDate: 1 },
      { name: "listing_views_ttl", expireAfterSeconds: VIEW_TTL_SECONDS },
    );

    /* ────────────────────────── partner applications ────────────────────── */

    await ensureCollection(db, COLLECTIONS.partnerApplications, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "email", "status", "createdAt"],
        properties: {
          _id: STR,
          name: STR,
          email: STR,
          phone: STR,
          company: STR,
          about: STR,
          portfolio: STR,
          status: { enum: ["open", "approved", "refused"] },
          reason: STR,
          decidedByName: STR,
          decidedAt: NULLABLE_TS,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    /*
     * PARTIAL on undecided rows. One address may apply again after a refusal,
     * which is a normal thing to want; it may not have two open applications,
     * because then two approvals could mint two accounts for one person.
     */
    await ensureIndex(
      db,
      COLLECTIONS.partnerApplications,
      { email: 1 },
      {
        name: "partner_applications_open",
        unique: true,
        partialFilterExpression: { status: "open" },
      },
    );
    await ensureIndex(
      db,
      COLLECTIONS.partnerApplications,
      { status: 1, createdAt: -1, _id: -1 },
      { name: "partner_applications_queue" },
    );

    /* ─────────────────────── the frozen enums, re-applied ────────────────── */

    await ensureCollection(db, COLLECTIONS.users, usersValidator());
    await ensureCollection(db, COLLECTIONS.audit, auditValidator());
  },
};

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
