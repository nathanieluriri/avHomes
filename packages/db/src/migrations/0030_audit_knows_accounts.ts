import type { Db } from "mongodb";
import { AUDIT_ENTITIES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, type Migration } from "../migrate";
import { auditValidator } from "./0008_audit";

export const migration0030: Migration = {
  tag: "0030_audit_knows_accounts",
  why: `Downloading the balance sheet is written to the audit trail, under its own
record type. The audit validator freezes the list it was built from, so it is
re-applied from the current one. Safe to run whether or not 0029 already has.`,

  async up(db: Db): Promise<void> {
    await ensureCollection(db, COLLECTIONS.audit, auditValidator());
    console.log(`audit accepts every record type: ${AUDIT_ENTITIES.join(", ")}.`);
  },
};
