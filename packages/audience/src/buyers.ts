import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { newId, trySend, type Mailer } from "@avhomes/core";
import { readTemplate, renderWith } from "@avhomes/settings";
import { unsubscribeLink } from "./admin";

export const AV_CONSTRUCTIONS_URL = "https://www.avconstructionsltd.com/";

interface BuyerRow {
  _id: string;
  email: string;
  source: string | null;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  unsubscribedAt?: number | null;
  /** Set once the congratulations email has gone, so a second sale does not send it again. */
  buyerWelcomedAt?: number;
}

/**
 * A buyer whose sale was approved joins the mailing list and is congratulated
 * once, with an introduction to AV Constructions. Nobody who unsubscribed is
 * signed back up or written to. Never throws: the sale has already happened.
 */
export async function welcomeBuyer(
  db: Db,
  mailer: Mailer | undefined,
  input: { email: string; name: string; property: string; origin: string },
  ctx: { requestId: string; route: string },
): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return false;
  const rows = collection<BuyerRow>(db, COLLECTIONS.subscribers);
  const now = Date.now();
  try {
    try {
      await rows.updateOne(
        { email },
        {
          $setOnInsert: { _id: newId("sub", now), email, source: "buyer", createdAt: now, confirmedAt: null },
          $set: { updatedAt: now },
        },
        { upsert: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    const claimed = await rows.findOneAndUpdate(
      { email, unsubscribedAt: null, buyerWelcomedAt: { $exists: false } },
      { $set: { buyerWelcomedAt: now } },
      { returnDocument: "after" },
    );
    if (!claimed || !mailer) return false;

    const template = await readTemplate(db, "buyer-welcome");
    const first = input.name.trim().split(/\s+/u)[0] || "there";
    const rendered = renderWith(template, {
      text: {
        name: first,
        property: input.property.trim() || "your new property",
        constructionLink: AV_CONSTRUCTIONS_URL,
        unsubscribeLink: unsubscribeLink(input.origin, claimed._id),
      },
      origin: input.origin,
    });
    const sent = await trySend(mailer, { to: email, ...rendered }, ctx);
    // Not sent means not welcomed: the next approved sale for this buyer tries again.
    if (!sent) await rows.updateOne({ _id: claimed._id }, { $unset: { buyerWelcomedAt: "" } });
    return sent;
  } catch (err) {
    console.error("[audience]", JSON.stringify({ ...ctx, buyer: "welcome", message: String(err) }));
    return false;
  }
}
