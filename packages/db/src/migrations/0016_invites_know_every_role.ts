import type { Db, Document } from "mongodb";
import { ALL_ROLES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, type Migration } from "../migrate";

const STR = { bsonType: "string" };
const TS = { bsonType: ["long", "int", "double"] };
const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };

/**
 * The invites validator, as a function, for the reason `usersValidator` is one.
 *
 * 0001 wrote it inline, and a validator freezes the enums it was built from, so
 * every role added since was refused on an invite.
 */
export function invitesValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "email", "role", "invitedBy", "createdAt", "expiresAt"],
      properties: {
        _id: STR,
        email: STR,
        role: { enum: [...ALL_ROLES] },
        invitedBy: STR,
        createdAt: TS,
        expiresAt: TS,
        acceptedAt: NULLABLE_TS,
      },
    },
  };
}

interface ApplicationRow {
  _id: string;
  email: string;
}

export const migration0016: Migration = {
  tag: "0016_invites_know_every_role",
  why: `Approving a partner application writes an invite at role \`partner\`, and the
invites validator refused it.

0001 wrote that validator inline, from the roles that existed then. 0011 and 0015
re-applied the users validator for the roles they added but never this one, so a
database migrated before the partner role refuses every partner invite. The
approval claims the application first, so each refusal left an application
marked approved with no invite behind it, which can never be approved again.

This re-applies the validator from the current role list, then puts every
approved application with no account and no invite behind it back to open, so
it can be approved again.`,

  async up(db: Db) {
    await ensureCollection(db, COLLECTIONS.invites, invitesValidator());
    console.log(`invites accept every role: ${ALL_ROLES.join(", ")}.`);

    const applications = db.collection<ApplicationRow & Document>(COLLECTIONS.partnerApplications);
    const approved = await applications
      .find({ status: "approved" }, { projection: { _id: 1, email: 1 } })
      .toArray();

    let reopened = 0;
    for (const row of approved) {
      const [account, invite] = await Promise.all([
        db.collection(COLLECTIONS.users).findOne({ email: row.email }, { projection: { _id: 1 } }),
        db.collection(COLLECTIONS.invites).findOne({ email: row.email, role: "partner" }, { projection: { _id: 1 } }),
      ]);
      if (account || invite) continue;
      try {
        await applications.updateOne(
          { _id: row._id, status: "approved" },
          { $set: { status: "open", reason: "", decidedByName: "", decidedAt: null, updatedAt: Date.now() } },
        );
        reopened += 1;
      } catch (err) {
        // The partial unique index: they applied again meanwhile, and the newer one stands.
        if ((err as { code?: number }).code !== 11000) throw err;
        console.log(`${row.email} has a newer open application, so the old one stays approved.`);
      }
    }
    console.log(
      `${reopened} approved ${reopened === 1 ? "application had" : "applications had"} no invite behind it and went back to open.`,
    );
  },
};

// TODO(test): an approved application with no user and no invite goes back to
// open; one with either stays approved.
