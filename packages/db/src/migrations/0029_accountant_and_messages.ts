import type { Db } from "mongodb";
import { ALL_ROLES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";
import { usersValidator } from "./0005_enquiry_threads";
import { auditValidator } from "./0008_audit";
import { invitesValidator } from "./0016_invites_know_every_role";

export const migration0029: Migration = {
  tag: "0029_accountant_and_messages",
  why: `Adds the accountant role, and keeps the private emails an admin sends a partner.

A validator freezes the role list it was built from, so the users, invites and
audit validators are re-applied from the current list. Without it an accountant
invite is refused, and so is the account it would create and every audit entry
an accountant writes.

Each private email is kept with who sent it, newest first on the partner's page.`,

  async up(db: Db): Promise<void> {
    await ensureCollection(db, COLLECTIONS.users, usersValidator());
    await ensureCollection(db, COLLECTIONS.invites, invitesValidator());
    await ensureCollection(db, COLLECTIONS.audit, auditValidator());
    console.log(`users, invites and audit accept every role: ${ALL_ROLES.join(", ")}.`);
    await ensureIndex(db, COLLECTIONS.marketerMessages, { marketerId: 1, createdAt: -1 }, { name: "marketer_messages_recent" });
  },
};
