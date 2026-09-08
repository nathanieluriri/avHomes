import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS_FIELD = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };

export const migration0004: Migration = {
  tag: "0004_subscribers",
  why: `The footer's newsletter form has never had anywhere to put an address: it
posts to nothing, so every reader who filled it in was told nothing and recorded
nowhere. The reading experience now asks a second time, at the end of a post,
which is the moment a reader is most willing to say yes, and asking twice with no
store behind either is worse than not asking.

The unique index on \`email\` is the whole integrity model. A subscriber list is
written by anonymous callers and read by whoever later sends the mail, so
duplicates are not a tidiness problem: they are the same person receiving one
message three times, and the one thing that reliably turns a subscriber into a
spam report. The route upserts against this index rather than checking first,
because a read-then-write cannot survive two tabs pressing Subscribe together.

\`unsubscribedAt\` is a timestamp and not a boolean, and it is on the document
from the first day rather than added when the unsubscribe link is built. A row
deleted on unsubscribe loses the fact that the address ever said no, so the next
import silently signs them back up.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.subscribers, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          // Trimmed and lowercased by `email()` at the boundary, so the unique
          // index below compares the same bytes the reader typed either way.
          email: STR,
          // Where they said yes, kept as the post slug rather than a full URL:
          // it is what an operator groups by when asking which writing earns
          // subscribers, and a URL carries a host that changes per deployment.
          source: NULLABLE_STR,
          createdAt: TS_FIELD,
          updatedAt: TS_FIELD,
          // Null until a double opt-in exists. Present now so adding one later
          // is a route change rather than a migration over a live list.
          confirmedAt: NULLABLE_TS,
          // Non-null means they left. The row stays; see the header.
          unsubscribedAt: NULLABLE_TS,
        },
      },
    });

    /*
     * UNIQUE, and the route depends on it. `email` is already lowercased at the
     * boundary, so a case-insensitive collation would only add a second way for
     * the same address to be stored twice.
     */
    await ensureIndex(
      db,
      COLLECTIONS.subscribers,
      { email: 1 },
      { unique: true, name: "subscribers_email" },
    );
    // The export an operator actually runs: newest first, `_id` breaking ties
    // at a shared millisecond the same way every other listing here does.
    await ensureIndex(
      db,
      COLLECTIONS.subscribers,
      { createdAt: -1, _id: -1 },
      { name: "subscribers_created" },
    );
  },
};
