import { ENQUIRY_CHANNELS, ENQUIRY_STATUSES, REPLY_IDENTITIES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const INT = { bsonType: ["int", "long"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };

export const migration0005: Migration = {
  tag: "0005_enquiry_threads",
  why: `"Contact agent" was a \`mailto:\`. It handed the buyer to a mail client they
may not have configured, lost everyone on a shared or work machine, and left the
team with no record of the enquiry until somebody remembered to forward it. It is
now a conversation on the page, which needs three things this migration provides.

FIRST, the enquiry document has to hold a thread. \`messages\` is EMBEDDED rather
than kept in its own collection, because a thread is always read whole, is capped
by CHAT_MAX_MESSAGES, and embedding makes the enquiry's existing \`revision\` a
CAS token over the conversation as well as the status. Two agents answering at
once then cannot interleave into a transcript neither of them wrote. The cap is
not a preference: an unbounded array in a document anyone on the internet can
append to is the 16MB limit with a countdown on it.

SECOND, \`threadKey\`. The buyer has no account, so something has to prove that
this browser opened this thread. It is the HMAC of a bearer token under
SESSION_SECRET, exactly as \`sessions._id\` is, so a database dump yields thread
ids and an id is not a token. The unique index is PARTIAL rather than sparse: a
form enquiry stores null, and a plain unique index over nulls would allow exactly
one of them to exist in the whole collection.

THIRD, the users validator has to admit a profile. A reply now reaches a buyer
with a name and a face on it, so \`avatarUrl\`, \`title\` and \`phone\` stop being
console decoration and become the thing that says a person is answering. They are
optional and absent on every account created before today, which is why every
read in @avhomes/identity coalesces them rather than assuming a value.

The \`settings\` collection carries one decision: whether replies are signed by
the person who wrote them or by one team name. Its single document sits at a
FIXED id, so there is no "which row is live" question to get wrong and no way to
end up with two.

Nothing here backfills. The old enquiry rows have no \`channel\` and no
\`messages\`, and they are correct as they stand: they came from the contact form,
which is what \`channel ?? "form"\` reads them as. A backfill would rewrite a
thousand historical rows to say what their absence already says.`,

  async up(db) {
    /* ─────────────────────────── enquiries ──────────────────────────── */

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
          /*
           * NOT required, and that is the whole compatibility story. Every row
           * written before today has neither key, and the read path resolves
           * that absence to "form" rather than a migration rewriting history.
           */
          channel: { enum: [...ENQUIRY_CHANNELS] },
          messages: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["id", "from", "body", "createdAt"],
              properties: {
                id: STR,
                from: { enum: ["visitor", "agent"] },
                body: STR,
                createdAt: TS,
                // Null on a visitor's message: they have no account.
                authorId: NULLABLE_STR,
                // A SNAPSHOT of the name the buyer was shown, not a join. See
                // replySignature: flipping the site to a team identity must not
                // rewrite the name on messages already read and already emailed.
                authorName: STR,
              },
            },
          },
          // The HMAC of the visitor's bearer token. Null on a form enquiry.
          threadKey: NULLABLE_STR,
          propertyId: NULLABLE_STR,
          propertySlug: NULLABLE_STR,
          // Denormalised so a transcript email and the inbox can name the
          // property without a second read, and so both keep naming it after
          // the listing is renamed or trashed.
          propertyTitle: NULLABLE_STR,
          status: { enum: [...ENQUIRY_STATUSES] },
          createdAt: TS,
          updatedAt: TS,
          lastVisitorAt: NULLABLE_TS,
          lastAgentAt: NULLABLE_TS,
          handledBy: NULLABLE_STR,
          note: NULLABLE_STR,
          // Kept for abuse triage. Never returned on the wire.
          sourceIp: NULLABLE_STR,
          revision: INT,
        },
      },
    });

    /*
     * PARTIAL, not sparse, and the difference matters here.
     *
     * Every form enquiry stores `threadKey: null`. A sparse unique index still
     * indexes an explicit null, so the second form enquiry ever written would
     * collide with the first. `partialFilterExpression` on a string type keeps
     * the nulls out of the index entirely, which is what makes uniqueness a
     * statement about real tokens only.
     */
    await ensureIndex(
      db,
      COLLECTIONS.enquiries,
      { threadKey: 1 },
      {
        unique: true,
        name: "enquiries_thread_key",
        partialFilterExpression: { threadKey: { $type: "string" } },
      },
    );

    /* The inbox's channel tab, so filtering to live chats is an index scan
       rather than a collection scan behind a keyset page. */
    await ensureIndex(
      db,
      COLLECTIONS.enquiries,
      { channel: 1, createdAt: -1, _id: -1 },
      { name: "enquiries_channel" },
    );

    /* ────────────────────────────── users ───────────────────────────── */

    await ensureCollection(db, COLLECTIONS.users, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "displayName", "role", "createdAt"],
        properties: {
          _id: STR,
          email: STR,
          displayName: STR,
          role: { enum: ["owner", "developer", "agent", "editor", "support"] },
          // Null when the deployment runs the Clerk door, or before a claim.
          passwordHash: NULLABLE_STR,
          /*
           * The card a buyer meets. Optional: absent on every account that
           * existed before the chat did, and clearable, because an agent who
           * uploaded the wrong photo must be able to take it down without
           * waiting until they have a replacement.
           */
          avatarUrl: NULLABLE_STR,
          title: NULLABLE_STR,
          phone: NULLABLE_STR,
          createdAt: TS,
          updatedAt: TS,
          disabledAt: NULLABLE_TS,
        },
      },
    });

    /* ──────────────────────────── settings ──────────────────────────── */

    await ensureCollection(db, COLLECTIONS.settings, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id"],
        properties: {
          // Fixed at "site". Settings are not a list.
          _id: STR,
          replyIdentity: { enum: [...REPLY_IDENTITIES] },
          teamName: STR,
          teamAvatarUrl: STR,
          updatedAt: TS,
          revision: INT,
        },
      },
    });
  },
};
