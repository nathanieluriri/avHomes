import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureIndex, type Migration } from "../migrate";

export const migration0013: Migration = {
  tag: "0013_ledger_reversal",
  why: `One earn line can be reversed once, and the database is what says so.

A clawback is written when a deal is cancelled after the marketer was already
paid. \`cancelDeal\` now claims the deal row before it touches the ledger, so two
callers cannot both do the work, and it checks for an existing clawback before
writing one. Both of those are application rules, and application rules are the
kind that a future caller forgets.

This index makes a second clawback against the same line impossible at the
level that cannot forget: a duplicate insert fails rather than quietly docking a
marketer twice for one commission. Partial, because every other line in the
collection carries \`reversesId: null\` and a plain unique index would allow
exactly one of them to exist.`,

  async up(db: Db): Promise<void> {
    await ensureIndex(
      db,
      COLLECTIONS.marketingLedger,
      { reversesId: 1 },
      {
        name: "marketing_ledger_one_reversal",
        unique: true,
        partialFilterExpression: { reversesId: { $type: "string" } },
      },
    );
  },
};
