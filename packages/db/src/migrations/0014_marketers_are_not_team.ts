import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";
import type { Migration } from "../migrate";

interface MarketerRow {
  userId: string;
  isAdmin?: boolean;
}

export const migration0014: Migration = {
  tag: "0014_marketers_are_not_team",
  why: `The team screen listed marketers, and a role picker on those rows could
turn one into an agent.

Marketers are users rows like anybody else, so \`listUsers\` returned them, and
the picker beside each row offered the four console roles. A marketer's role is
not one privilege among several: it is the whole of their access, and replacing
it hands them a console they cannot use while taking away the app they work in.
Their profile, code, downline and unpaid ledger go on existing under an account
that is no longer a marketer, which is why nothing broke loudly enough to
notice. The route now refuses it and the list no longer offers them.

This is the repair. An account holding a marketer profile that was NOT made for
an admin (\`isAdmin: false\`, which is how the join route writes one) has signed
up through the marketer app and has never been anything else, so a console role
on it can only have arrived through that picker. Those are put back to
\`marketer\`.

An admin's own profile is left alone: \`isAdmin: true\` marks the one
\`currentMarketer\` mints on the spot so that a colleague can open the app, and
their console role is the real one. Sessions are untouched. The role is read
from the users row on each request, so the next one already sees the restored
value, and the marketer app is where the console shell sends them.`,

  async up(db: Db): Promise<void> {
    const profiles = await db
      .collection<MarketerRow>(COLLECTIONS.marketers)
      .find({ isAdmin: { $ne: true } }, { projection: { userId: 1 } })
      .toArray();
    const ids = profiles.map((row) => row.userId).filter((id): id is string => typeof id === "string");
    if (ids.length === 0) {
      console.log("no marketer profiles, so no roles to restore.");
      return;
    }

    const restored = await db
      .collection<{ _id: string; role: string }>(COLLECTIONS.users)
      .updateMany(
        { _id: { $in: ids }, role: { $ne: "marketer" } },
        { $set: { role: "marketer", updatedAt: Date.now() } },
      );
    const word = restored.modifiedCount === 1 ? "account" : "accounts";
    console.log(
      `${restored.modifiedCount} ${word} signed up in the marketer app held a console role. Put back to marketer.`,
    );
  },
};
