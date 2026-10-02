import type { Db, Document } from "mongodb";
import { COLLECTIONS } from "../collections";
import type { Migration } from "../migrate";

interface MarketerRow extends Document {
  _id: string;
  email: string;
  status: string;
}

/** The marketer's own id re-prefixed, so running this twice finds the same row. */
function derivedId(marketerId: string): string {
  return `sub_${marketerId.slice(marketerId.indexOf("_") + 1)}`;
}

export const migration0021: Migration = {
  tag: "0021_partners_on_the_list",
  why: `A new marketer joins the newsletter list as they sign up, which left out
everybody who signed up before that. This puts every active partner's address
on the list. An address already there is left as it is, so nobody who
unsubscribed is signed back up.`,

  async up(db: Db) {
    const marketers = await db
      .collection<MarketerRow>(COLLECTIONS.marketers)
      .find({ status: "active" }, { projection: { _id: 1, email: 1 } })
      .toArray();
    const now = Date.now();
    let added = 0;
    for (const marketer of marketers) {
      const email = marketer.email.trim().toLowerCase();
      if (email === "") continue;
      const res = await db.collection(COLLECTIONS.subscribers).updateOne(
        { email },
        {
          $setOnInsert: {
            _id: derivedId(marketer._id),
            email,
            source: "partner",
            createdAt: now,
            updatedAt: now,
            confirmedAt: null,
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount > 0) added += 1;
    }
    console.log(`${added} of ${marketers.length} active partners added to the newsletter list.`);
  },
};
