import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const ARR = { bsonType: "array" };
const MONEY = { bsonType: ["long", "int", "double"] };

const STATES = ["new", "contacted", "meeting", "viewed", "offer", "won", "lost"];

export const migration0012: Migration = {
  tag: "0012_leads",
  why: `A marketer can hand AV Homes somebody who might buy, and both sides watch
the same pipeline move it.

Its own collection rather than states bolted onto \`marketing_deals\`, because
the two record different kinds of thing. A deal records an outcome: one
decision, one reason, one reviewer, and its status answers "did this pay". A
lead records a process that moves six or seven times over months, each move by a
different person for a different reason, and the value of the record is the
sequence. Folding that into the deal's single \`reason\` string would mean every
state change destroys the previous one, which is exactly the history the feature
exists to keep.

\`events\` is append only, the same discipline \`marketing_ledger\` keeps for
money, and \`state\` is only the last event's destination, stored flat so the
queue index does not have to reach into the array.

There is no admin-private note, deliberately. The marketer renders this same
array, and the moment a second hidden one exists their copy stops being the
history.

\`dealId\` links a won lead to the deal it minted. It survives a reversal, so a
sale that falls through still reads as one story rather than two.`,

  async up(db: Db): Promise<void> {
    await ensureCollection(db, COLLECTIONS.marketingLeads, {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "_id",
          "buyerName",
          "buyerPhone",
          "reporterId",
          "state",
          "currency",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          _id: STR,
          buyerName: STR,
          buyerPhone: STR,
          // Null when the buyer has no property in mind yet, which is most of them.
          listingId: NULLABLE_STR,
          // Snapshot, so a listing renamed next year cannot rewrite a settled lead.
          listingTitle: STR,
          // Which options inside an estate, snapshotted the same way.
          wantUnits: ARR,
          wantKind: { enum: ["sale", "rent", null] },
          wantArea: STR,
          wantBudgetMinor: MONEY,
          currency: STR,
          brief: STR,
          reporterId: STR,
          reporterName: STR,
          reporterCode: STR,
          state: { enum: STATES },
          // Oldest first. Every entry carries a reason and a note, both required.
          events: ARR,
          dealId: NULLABLE_STR,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    // The console's queue: one state, newest first.
    await ensureIndex(
      db,
      COLLECTIONS.marketingLeads,
      { state: 1, updatedAt: -1, _id: -1 },
      { name: "marketing_leads_queue" },
    );

    // The app's list: this marketer's own, newest first.
    await ensureIndex(
      db,
      COLLECTIONS.marketingLeads,
      { reporterId: 1, updatedAt: -1, _id: -1 },
      { name: "marketing_leads_reporter" },
    );

    // Reached from a deal, when an admin opens the deal a lead minted.
    await ensureIndex(
      db,
      COLLECTIONS.marketingLeads,
      { dealId: 1 },
      { name: "marketing_leads_deal", sparse: true },
    );

    /* Two marketers logging the same phone number is a real collision worth
       seeing, not an error worth refusing: the second one may genuinely know
       them better. Non-unique on purpose, so the console can show both. */
    await ensureIndex(
      db,
      COLLECTIONS.marketingLeads,
      { buyerPhone: 1 },
      { name: "marketing_leads_phone" },
    );
  },
};
