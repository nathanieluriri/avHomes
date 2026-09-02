import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const INT = { bsonType: ["long", "int", "double"] };

export const migration0002: Migration = {
  tag: "0002_visits",
  why: `The dashboard's "Sessions" and "Live visitors" tiles were invented numbers, and
an invented number on an operator's first screen is worse than an empty one: it
gets believed and then acted on. This is the collection that makes them real,
one document per visit session, carrying no IP address and no path because the
tiles need counts and a page-view log tied to a person is a far heavier thing to
hold than counts justify. The TTL is part of that argument rather than
housekeeping: a visit is aggregate fuel with an expiry date, not a record the
business keeps.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.visits, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "day", "firstSeen", "lastSeen", "views"],
        properties: {
          // The client-minted session id. Bounded and character-restricted by
          // the route's schema before it ever reaches here.
          _id: STR,
          // UTC YYYY-MM-DD, fixed at first sight so a session that crosses
          // midnight counts once, on the day it started.
          day: STR,
          firstSeen: TS,
          lastSeen: TS,
          views: INT,
          expiresAtDate: { bsonType: "date" },
        },
      },
    });
    // The daily series groups on this, one bucket per point in the sparkline.
    await ensureIndex(db, COLLECTIONS.visits, { day: 1 }, { name: "visits_day" });
    // "Live visitors" is a range query on this and nothing else.
    await ensureIndex(db, COLLECTIONS.visits, { lastSeen: -1 }, { name: "visits_last_seen" });
    /*
     * 90 days, which is two full 30-day comparison windows plus slack, so "up
     * 40% on the previous 30 days" always has a previous 30 days to compare
     * against. Same idiom as the session sweep: a TTL index needs a real BSON
     * date and every other timestamp here is an epoch-ms number, so
     * `expiresAtDate` exists only for the index and is never read.
     */
    await ensureIndex(
      db,
      COLLECTIONS.visits,
      { expiresAtDate: 1 },
      { expireAfterSeconds: 0, name: "visits_ttl" },
    );
  },
};
