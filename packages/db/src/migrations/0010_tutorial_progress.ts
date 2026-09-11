import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };
const STR = { bsonType: "string" };

export const migration0010: Migration = {
  tag: "0010_tutorial_progress",
  why: `The console's Tutorials section records, per member, which videos they
have watched and which walkthroughs they finished, so the page can show a
checklist and the dashboard can stop suggesting it once the work is done.

One row per member and subject, keyed \`<userId>:<subject>\`, so a repeated
write is an upsert on the primary key rather than a read then an insert. The
subject is a tutorial id or \`nudge\`, the dashboard suggestion a member
dismissed; keeping that here rather than on the user document leaves identity's
schema alone for a fact only this feature reads.

The validator bounds the subject as a short string rather than listing today's
tutorials. The allowlist is \`TUTORIAL_IDS\`, enforced by the route, so adding a
tutorial is a code change and not a \`collMod\` on every existing database.

Every timestamp is set once and never moved, which is what "when did they first
watch it" needs. The index on \`userId\` serves the only read, a member's own
rows.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.tutorialProgress, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "subject", "createdAt", "updatedAt"],
        properties: {
          _id: STR,
          userId: STR,
          subject: { bsonType: "string", minLength: 1, maxLength: 64 },
          watchedAt: NULLABLE_TS,
          completedAt: NULLABLE_TS,
          dismissedAt: NULLABLE_TS,
          createdAt: TS,
          updatedAt: TS,
        },
      },
    });

    await ensureIndex(db, COLLECTIONS.tutorialProgress, { userId: 1 }, { name: "tutorial_progress_user" });
  },
};
