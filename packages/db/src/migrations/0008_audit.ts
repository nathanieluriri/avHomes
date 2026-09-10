import { ALL_ROLES, AUDIT_ENTITIES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_OBJ = { bsonType: ["object", "null"] };
/*
 * NOT 0007's wide `["long", "int", "double"]`. That set exists because a naira
 * price in kobo crosses 2^31 and the driver then serialises it as a double.
 * `status` is an HTTP status code, always under 600, so it is exactly the kind
 * of small counter 0005's narrower `INT` was written for: it never leaves the
 * driver's plain int32 encoding, so there is nothing here for `double` to catch.
 */
const INT = { bsonType: ["int", "long"] };
/*
 * A real BSON Date, not an epoch-millisecond number. The README's one named
 * exception to that convention, kept solely so `audit_ttl` below has a native
 * Mongo date to sweep on; nothing in the application ever reads this field back.
 */
const DATE = { bsonType: "date" };

export const migration0008: Migration = {
  tag: "0008_audit",
  why: `Nothing today records who changed a price, who marked a listing sold, or
who deleted the flat a buyer says they saw last week. This migration is the
collection and the three indexes an audit entry needs to exist, ahead of the
middleware (a later change) that will actually write rows into it.

A SEPARATE collection, not more fields on properties, posts, users and every
other record this trail can name. An audit entry is a fact about an action, and
an action's actor, target and request do not all live on one document even when
a target exists: AUDIT_ENTITIES includes "auth" and "session", and a sign-in has
no property or post to carry a field on in the first place. Where a target does
exist, tying its history to its own document lifetime is still the wrong
coupling. 0007 already added \`priceHistory\` to properties, an embedded array
carrying \`at\`, \`fromMinor\`/\`toMinor\` and \`byUserId\`/\`byName\`, a real actor and
a real before-value living on the record today, so that is the best case
fields-on-the-record has to offer, and it is still one field on one entity.
\`auth\` and \`session\` have no record at all to carry such a field on, so the
pattern cannot reach every entity this trail names, and reaching the rest would
mean a separately capped array per entity rather than the one collection and
one shared index a log spanning all of them needs. Embedding a real history
would also reopen
0005's \`messages\` problem in a worse shape. \`messages\` is capped at
CHAT_MAX_MESSAGES because an uncapped array on a document anyone can grow is the
16MB limit with a countdown on it; an audit trail has no such cap available,
because \`PatchBody\` alone permits a 20,000 character description per save and a
well-run listing collects edits for years rather than weeks. And "the log,
newest first" and "everything Adaeze touched today" are one-collection,
one-index questions today. Spread across every entity this trail names, they
would be a scatter-gather over a dozen collections with no shared index to
drive it and nothing to sort the merged result by.

A TWO YEAR TTL, not forever. The design records full values rather than a
redacted summary, \`requested\` carries the request body as sent apart from the
\`/api/auth/\` prefix and the denylist that catches a stray credential elsewhere,
because "who dropped the price" needs the real before and after numbers, not a
diff that already threw them away. That choice has a cost, and this collection
is where it lands: an enquiry reply's message text, an invite's email address,
a contact update's phone number, all now live a second time here, in full,
outside whatever handling the record they came from gets. Kept forever, that
turns an operational log into an ever-growing store of personal data with no
ceiling on it at all. Two years bounds it without gutting the reason the trail
exists: long enough to settle a dispute over who did what on the timescale an
agency actually has them, short enough that the collection stops growing
forever just because the business keeps running. \`expiresAtDate\` is how that
ceiling gets enforced. It is written once, at insert, from \`at\` plus two years,
and read by nothing but \`audit_ttl\`, which is why it is a real Date rather than
this repository's usual epoch-millisecond integer: \`expireAfterSeconds: 0\`
against a per-document date is Mongo's idiom for "expire at the time named on
this row," and a plain number field cannot carry that meaning to the index.

The actor fields sit in \`required\` rather than being nullable with a fallback.
An entry that could not resolve who did something is not a thin audit entry,
it is a missing one, and the validator should refuse it rather than let a row
with nobody attached pass as a record of what happened. \`entityId\`, \`requested\`,
\`before\` and \`query\` stay out of \`required\`, and \`requested\`/\`before\`/\`query\`
carry no inner schema beyond "object or null": every one of them mirrors
whatever the audited route already accepts, and shaping them here would turn
every new field any admin route adds to its own body into a migration in this
package too, exactly the cross-package coupling the feature-package import
rule (audit may depend on contracts, core and db, and nothing else) exists to
keep out.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.audit, {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "_id",
          "at",
          "actorId",
          "actorName",
          "actorRole",
          "entity",
          "action",
          "method",
          "path",
          "status",
          "requestId",
          "expiresAtDate",
        ],
        properties: {
          _id: STR,
          at: TS,
          // SNAPSHOT of the actor, not a join. Renaming or deleting a user must
          // never rewrite who did something a year ago.
          actorId: STR,
          actorName: STR,
          actorRole: { enum: [...ALL_ROLES] },
          entity: { enum: [...AUDIT_ENTITIES] },
          // The record's id, or null where an action names no single record
          // ("auth", a sign-in). Not required: absence IS the fact for those.
          entityId: NULLABLE_STR,
          action: STR,
          // The caller's request body, redacted. Null on the `/api/auth/`
          // prefix and on any non-JSON body; see the `why` above.
          requested: NULLABLE_OBJ,
          // What the record looked like first. Only where a route supplies it.
          before: NULLABLE_OBJ,
          method: STR,
          path: STR,
          // Parsed query params, redacted like any other payload. Null when
          // there were none.
          query: NULLABLE_OBJ,
          // HTTP status code. Always small; see the INT comment above.
          status: INT,
          requestId: STR,
          expiresAtDate: DATE,
        },
      },
    });

    /*
     * expireAfterSeconds: 0 against a per-document date sweeps a row at the
     * moment named ON it, rather than N seconds after some fixed point, which
     * is exactly what a per-row two year expiry needs. See the `why` above.
     */
    await ensureIndex(
      db,
      COLLECTIONS.audit,
      { expiresAtDate: 1 },
      { name: "audit_ttl", expireAfterSeconds: 0 },
    );

    // The log, newest first. `_id` breaks ties within the same millisecond,
    // the same tiebreaker every keyset page in this repository already uses.
    await ensureIndex(db, COLLECTIONS.audit, { at: -1, _id: -1 }, { name: "audit_recent" });

    // This record's history: the admin log's entity filter and the property
    // editor's History panel both resolve to a scan of this index.
    await ensureIndex(
      db,
      COLLECTIONS.audit,
      { entity: 1, entityId: 1, at: -1, _id: -1 },
      { name: "audit_entity" },
    );
  },
};
