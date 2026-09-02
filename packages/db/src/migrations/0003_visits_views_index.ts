import { COLLECTIONS } from "../collections";
import { ensureIndex, type Migration } from "../migrate";

export const migration0003: Migration = {
  tag: "0003_visits_views_index",
  why: `The dashboard's 30 day aggregate groups on \`day\` and sums \`views\`, and
\`visits_day\` covers only the first of those. Summing a field the index does not
carry forces every matching visit document to be fetched from disk on every
dashboard load, which is the one read an operator does on arrival and repeats all
day. A compound index over both fields answers the whole pipeline from the index
and never touches a document. It also replaces \`visits_day\` rather than joining
it: a compound index with \`day\` as its prefix serves every query the single
field one did.`,

  async up(db) {
    await ensureIndex(
      db,
      COLLECTIONS.visits,
      { day: 1, views: 1 },
      { name: "visits_day_views" },
    );
    /*
     * Dropped because it is now a strict prefix of the index above, so Mongo can
     * never choose it and it costs a write on every beacon for nothing. Guarded,
     * because a deployment that has not run 0002 has no index to drop and this
     * migration must not be the thing that fails there.
     */
    try {
      await db.collection(COLLECTIONS.visits).dropIndex("visits_day");
    } catch {
      // Already absent. Nothing to undo.
    }
  },
};
