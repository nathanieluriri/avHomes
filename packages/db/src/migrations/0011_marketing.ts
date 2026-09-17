import type { Db } from "mongodb";
import { marketerCode } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";
import { usersValidator } from "./0005_enquiry_threads";
import { auditValidator } from "./0008_audit";

const TS = { bsonType: ["long", "int", "double"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_OBJ = { bsonType: ["object", "null"] };
const BOOL = { bsonType: "bool" };
const ARR = { bsonType: "array" };
/* Wide, like 0007's price: a commission on a naira listing is kobo, and kobo
   crosses 2^31 on any real Lagos property, so the driver sends a double. */
const MONEY = { bsonType: ["long", "int", "double"] };

export const migration0011: Migration = {
  tag: "0011_marketing",
  why: `Marketers sell listings, invite other marketers and earn a share of what
they close. Five collections carry that, and each one is here rather than being
created implicitly on first write because every one of them holds money.

\`marketers\` is the tree. The chain above a marketer is stored on the row as
\`upline\`, nearest first, rather than walked at read time, because the tree is
capped at three levels: "who gets paid" becomes one read, and banning somebody
rewrites a bounded number of rows instead of an unbounded subtree. \`code\` is
unique because it is what a marketer gives out, and \`userId\` is unique because
one account is one marketer.

\`marketing_deals\` holds a claim on a listing plus the proof for it. The partial
unique index on (listingId, unitKey) over approved deals is the rule that two
people cannot both be paid for selling the same house; a second claim can still
be filed, so an admin sees both and decides, but only one can be settled.

\`marketing_ledger\` is append only. A line is written when a deal is approved
and never edited afterwards: a deal that falls through is a new negative line
pointing at the one it reverses, which is why \`amountMinor\` has no minimum
here. Balances are always the sum of these lines, never a stored number, so a
lost write can never silently make somebody richer.

\`marketing_pay_runs\` is one document per month carrying each person's total and
a COPY of their bank details as they stood when the run was made. A marketer who
edits their account number the day before pay day must not redirect a payment
that was already prepared. \`marketing_issues\` is the thread that opens when
somebody says the transfer never arrived.

\`marketing_updates\` holds the cards an admin writes for the app's Updates
carousel. It holds no money, and it is still created here with a validator,
because every row is shown on every marketer's phone: a \`linkHref\` or a status
nobody checked is a broken button in front of the whole team at once. Only
what an admin wrote is stored. The cards for new listings are made by the feed
at read time, so a listing taken down disappears from the carousel on the next
read instead of waiting for somebody to delete a copy. The feed index leads
with \`status\` because the app only ever reads live cards, then sorts pinned
first and newest start next.

The users and audit trail validators are re-applied at the end. A validator
freezes the enums it was built from. Migration 0005 wrote the five console roles
out by hand, so every database that ran it refuses the account the join route
makes for a new marketer; and a database that migrated before the \`marketer\`
role and the four new audit entities existed would refuse to log anything a
marketer route does.

Duplicate marketers are set aside before the two unique indexes are built. A
build of the app before this migration made a profile per request, and the app's
first screen fires several requests at once, so one person could end up as
several identical rows with the same code; a unique index cannot be built over
that. For each person the row something already points at is kept (a deal, a
ledger line, somebody they invited), otherwise the earliest, and every other copy
is moved to \`marketers_set_aside\` rather than deleted, so nothing is lost if
the choice was wrong. Two different people who took the same number are kept
and the later one is given the next free code.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.marketers, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "code", "status", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          userId: STR,
          code: { bsonType: "string", minLength: 3, maxLength: 24 },
          displayName: STR,
          email: STR,
          phone: STR,
          state: STR,
          status: { enum: ["active", "paused", "banned"] },
          statusReason: STR,
          statusAt: NULLABLE_TS,
          parentId: NULLABLE_STR,
          // Nearest first, at most two entries. See the `why` above.
          upline: ARR,
          bank: NULLABLE_OBJ,
          isAdmin: BOOL,
          // The number behind `code`, so the next one is a single read.
          seq: { bsonType: ["int", "long"] },
          joinedAt: TS,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    // Before the unique indexes, which cannot be built over duplicates. See the `why` above.
    await setAsideDuplicateMarketers(db);

    await ensureIndex(db, COLLECTIONS.marketers, { code: 1 }, { unique: true, name: "marketers_code" });
    await ensureIndex(db, COLLECTIONS.marketers, { userId: 1 }, { unique: true, name: "marketers_user" });
    await ensureIndex(db, COLLECTIONS.marketers, { parentId: 1 }, { name: "marketers_parent" });
    await ensureIndex(db, COLLECTIONS.marketers, { upline: 1 }, { name: "marketers_upline" });
    await ensureIndex(db, COLLECTIONS.marketers, { seq: -1 }, { name: "marketers_seq" });
    await ensureIndex(
      db,
      COLLECTIONS.marketers,
      { createdAt: -1, _id: -1 },
      { name: "marketers_created" },
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
          // Snapshots. A listing renamed later must not rewrite a settled deal.
          listingTitle: STR,
          listingLocation: STR,
          listingEstate: STR,
          listingType: { enum: ["sale", "rent"] },
          unitKey: STR,
          amountMinor: MONEY,
          currency: STR,
          buyerName: STR,
          buyerPhone: STR,
          proof: ARR,
          note: STR,
          reporterId: STR,
          reporterName: STR,
          reporterCode: STR,
          status: { enum: ["pending", "approved", "rejected", "info", "cancelled"] },
          reason: STR,
          reviewedBy: STR,
          reviewedByName: STR,
          reviewedAt: NULLABLE_TS,
          closedOn: TS,
          // Who earns what, with the rates used, frozen at approval.
          shares: ARR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    // One settled deal per listing and unit. A second claim may be filed and
    // refused; it may not be paid.
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { listingId: 1, unitKey: 1 },
      {
        name: "marketing_deals_settled",
        unique: true,
        partialFilterExpression: { status: "approved" },
      },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { status: 1, createdAt: -1, _id: -1 },
      { name: "marketing_deals_queue" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { reporterId: 1, createdAt: -1, _id: -1 },
      { name: "marketing_deals_reporter" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingDeals,
      { "shares.marketerId": 1, createdAt: -1 },
      { name: "marketing_deals_shares" },
    );

    await ensureCollection(db, COLLECTIONS.marketingLedger, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "marketerId", "kind", "amountMinor", "currency", "status", "createdAt"],
        properties: {
          _id: STR,
          marketerId: STR,
          dealId: NULLABLE_STR,
          level: { bsonType: ["int", "long"] },
          kind: { enum: ["earn", "clawback", "adjust"] },
          // Signed, and deliberately unbounded below: a clawback is negative.
          amountMinor: MONEY,
          currency: STR,
          status: { enum: ["earned", "scheduled", "paid", "void"] },
          payRunId: NULLABLE_STR,
          reversesId: NULLABLE_STR,
          note: STR,
          dealTitle: STR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.marketingLedger,
      { marketerId: 1, createdAt: -1, _id: -1 },
      { name: "marketing_ledger_marketer" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingLedger,
      { status: 1, marketerId: 1 },
      { name: "marketing_ledger_status" },
    );
    await ensureIndex(db, COLLECTIONS.marketingLedger, { dealId: 1 }, { name: "marketing_ledger_deal" });
    await ensureIndex(
      db,
      COLLECTIONS.marketingLedger,
      { payRunId: 1 },
      { name: "marketing_ledger_payrun" },
    );

    await ensureCollection(db, COLLECTIONS.marketingPayRuns, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "month", "status", "currency", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          // `2026-09`. One run per month.
          month: { bsonType: "string", minLength: 7, maxLength: 7 },
          status: { enum: ["draft", "paying", "closed"] },
          currency: STR,
          totalMinor: MONEY,
          paidMinor: MONEY,
          items: ARR,
          createdByName: STR,
          createdAt: TS,
          updatedAt: TS,
          closedAt: NULLABLE_TS,
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.marketingPayRuns,
      { month: 1 },
      { unique: true, name: "marketing_pay_runs_month" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingPayRuns,
      { createdAt: -1, _id: -1 },
      { name: "marketing_pay_runs_created" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingPayRuns,
      { "items.marketerId": 1 },
      { name: "marketing_pay_runs_member" },
    );

    await ensureCollection(db, COLLECTIONS.marketingIssues, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "payRunId", "marketerId", "status", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          payRunId: STR,
          month: STR,
          marketerId: STR,
          marketerName: STR,
          code: STR,
          amountMinor: MONEY,
          currency: STR,
          status: { enum: ["open", "resolved"] },
          messages: ARR,
          createdAt: TS,
          updatedAt: TS,
          resolvedAt: NULLABLE_TS,
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.marketingIssues,
      { status: 1, createdAt: -1, _id: -1 },
      { name: "marketing_issues_open" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingIssues,
      { marketerId: 1, createdAt: -1 },
      { name: "marketing_issues_marketer" },
    );

    await ensureCollection(db, COLLECTIONS.marketingUpdates, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "title", "tone", "status", "startsAt", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          title: { bsonType: "string", minLength: 1, maxLength: 80 },
          body: { bsonType: "string", maxLength: 280 },
          // Empty for a card with no picture.
          imageUrl: STR,
          linkLabel: { bsonType: "string", maxLength: 24 },
          linkHref: { bsonType: "string", maxLength: 500 },
          tone: { enum: ["wine", "gold", "plum"] },
          pinned: BOOL,
          status: { enum: ["draft", "live"] },
          startsAt: TS,
          // Exclusive, and null for a card that runs until it is taken down.
          endsAt: NULLABLE_TS,
          createdBy: STR,
          createdByName: STR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    await ensureIndex(
      db,
      COLLECTIONS.marketingUpdates,
      { status: 1, pinned: -1, startsAt: -1, _id: -1 },
      { name: "marketing_updates_feed" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.marketingUpdates,
      { createdAt: -1, _id: -1 },
      { name: "marketing_updates_created" },
    );

    // Re-applied, not re-created: the enums grew. See the `why` above.
    await ensureCollection(db, COLLECTIONS.users, usersValidator());
    await ensureCollection(db, COLLECTIONS.audit, auditValidator());
  },
};

/** Where set aside duplicates go. Outside the registry: nothing in the app reads it. */
const SET_ASIDE = "marketers_set_aside";

/** Only the fields this step reads. Ids here are strings, never ObjectIds. */
interface MarketerRow {
  _id: string;
  userId: string;
  code: string;
  seq?: number;
  [field: string]: unknown;
}

/**
 * One row per person and one person per code, without deleting anything.
 * Safe to run twice: a copy already set aside is replaced, not duplicated.
 */
async function setAsideDuplicateMarketers(db: Db): Promise<void> {
  const rows = db.collection<MarketerRow>(COLLECTIONS.marketers);

  const people = await rows
    .aggregate<{ _id: string; ids: string[] }>([
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: "$userId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const person of people) {
    let keep = person.ids[0];
    for (const id of person.ids) {
      const referenced =
        (await rows.countDocuments({ parentId: id })) +
        (await db.collection(COLLECTIONS.marketingDeals).countDocuments({ reporterId: id })) +
        (await db.collection(COLLECTIONS.marketingLedger).countDocuments({ marketerId: id }));
      if (referenced > 0) {
        keep = id;
        break;
      }
    }
    const extras = person.ids.filter((id) => id !== keep);
    const copies = await rows.find({ _id: { $in: extras } }).toArray();
    for (const copy of copies) {
      await db
        .collection<MarketerRow>(SET_ASIDE)
        .replaceOne(
          { _id: copy._id },
          { ...copy, setAsideAt: Date.now(), keptId: keep },
          { upsert: true },
        );
    }
    await rows.deleteMany({ _id: { $in: extras } });
  }

  const clashes = await rows
    .aggregate<{ _id: string; ids: string[] }>([
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: "$code", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const clash of clashes) {
    for (const id of clash.ids.slice(1)) {
      const top = await rows.find({}, { projection: { seq: 1 } }).sort({ seq: -1 }).limit(1).next();
      const seq = (typeof top?.seq === "number" ? top.seq : 0) + 1;
      await rows.updateOne({ _id: id }, { $set: { seq, code: marketerCode(seq), updatedAt: Date.now() } });
    }
  }
}
