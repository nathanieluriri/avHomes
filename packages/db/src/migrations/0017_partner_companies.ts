import type { Db, Document } from "mongodb";
import { PARTNER_STATUSES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";
import { usersValidator } from "./0005_enquiry_threads";
import { propertiesValidator } from "./0015_analytics_and_funds";
import { invitesValidator } from "./0016_invites_know_every_role";

const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };
const TS = { bsonType: ["long", "int", "double"] };
const INT = { bsonType: ["long", "int", "double"] };
const NULLABLE_INT = { bsonType: ["long", "int", "double", "null"] };

function partnersValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "status", "limits", "createdAt", "revision"],
      properties: {
        _id: STR,
        name: STR,
        contactName: STR,
        contactEmail: STR,
        contactPhone: STR,
        status: { enum: [...PARTNER_STATUSES] },
        statusReason: STR,
        limits: {
          bsonType: "object",
          properties: { review: NULLABLE_INT, live: NULLABLE_INT, staff: NULLABLE_INT },
        },
        mainUserId: NULLABLE_STR,
        applicationId: NULLABLE_STR,
        createdAt: TS,
        updatedAt: TS,
        revision: INT,
      },
    },
  };
}

interface AccountRow extends Document {
  _id: string;
  email: string;
  displayName: string;
  phone?: string | null;
}

interface ApplicationRow extends Document {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

interface InviteRow extends Document {
  _id: string;
  email: string;
}

/** The same derivation `partnerIdForApplication` uses: the source id, re-prefixed. */
function derivedId(sourceId: string): string {
  return `ptnr_${sourceId.slice(sourceId.indexOf("_") + 1)}`;
}

interface CompanyRow extends Document {
  _id: string;
  mainUserId: string | null;
}

/** The seed an account or an invite takes when its email matches an approved application. */
function seedFromApplication(application: ApplicationRow) {
  return {
    sourceId: application._id,
    applicationId: application._id,
    name: application.company || application.name,
    contactName: application.name,
    contactEmail: application.email,
    contactPhone: application.phone ?? "",
  };
}

async function companyFor(
  db: Db,
  seed: { sourceId: string; applicationId: string | null; name: string; contactName: string; contactEmail: string; contactPhone: string },
  now: number,
): Promise<string> {
  const id = derivedId(seed.sourceId);
  await db.collection<CompanyRow>(COLLECTIONS.partners).updateOne(
    { _id: id },
    {
      $setOnInsert: {
        name: seed.name,
        contactName: seed.contactName,
        contactEmail: seed.contactEmail,
        contactPhone: seed.contactPhone,
        status: "active",
        statusReason: "",
        limits: { review: null, live: null, staff: null },
        mainUserId: null,
        applicationId: seed.applicationId,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
    },
    { upsert: true },
  );
  return id;
}

export const migration0017: Migration = {
  tag: "0017_partner_companies",
  why: `A partner stops being one account and becomes a company its accounts share.

\`partners\` is new: one row per company, its contact details, its status and
its own values for three limits, where null takes the default kept in the
\`partners\` settings row. A company's id is derived from its application's, so
re-running this, or retrying an approval, cannot make a second one.

Users and invites gain \`partnerId\` and \`partnerRole\`, and listings and
images gain \`partnerId\`, because every scoped read now narrows by the company
rather than by the one account that happened to create a row. Listings also
gain \`partnerHold\`, which keeps a suspended company's listings off the public
site without touching their status.

The backfill turns every partner that exists into a company of one: each
partner account becomes the main account of the company its approved
application stands for, its listings and images take that company, and an
open partner invite takes the company of its application. An account or
invite with no application to match gets a company named after it, listed in
the output, so a person decides what it should be called.

The users, invites and properties validators are re-applied with the new
fields.`,

  async up(db: Db) {
    const now = Date.now();

    await ensureCollection(db, COLLECTIONS.partners, partnersValidator());
    await ensureIndex(db, COLLECTIONS.partners, { applicationId: 1 }, { name: "partners_application" });
    await ensureIndex(db, COLLECTIONS.partners, { status: 1, name: 1 }, { name: "partners_status" });

    const users = db.collection<AccountRow>(COLLECTIONS.users);
    const applications = db.collection<ApplicationRow>(COLLECTIONS.partnerApplications);
    const invites = db.collection<InviteRow>(COLLECTIONS.invites);
    const orphans: string[] = [];

    const accounts = await users
      .find({ role: "partner", partnerId: null }, { projection: { _id: 1, email: 1, displayName: 1, phone: 1 } })
      .toArray();
    for (const account of accounts) {
      const application = await applications.findOne(
        { email: account.email, status: "approved" },
        { sort: { decidedAt: -1 } },
      );
      if (!application) orphans.push(account.email);
      const partnerId = await companyFor(
        db,
        application
          ? seedFromApplication(application)
          : {
              sourceId: account._id,
              applicationId: null,
              name: account.displayName,
              contactName: account.displayName,
              contactEmail: account.email,
              contactPhone: account.phone ?? "",
            },
        now,
      );
      await users.updateOne({ _id: account._id }, { $set: { partnerId, partnerRole: "main", updatedAt: now } });
      await db
        .collection<CompanyRow>(COLLECTIONS.partners)
        .updateOne({ _id: partnerId, mainUserId: null }, { $set: { mainUserId: account._id } });
      await db
        .collection(COLLECTIONS.properties)
        .updateMany({ agentUserId: account._id, partnerId: null }, { $set: { partnerId } });
      await db
        .collection(COLLECTIONS.images)
        .updateMany({ uploadedBy: account._id, partnerId: null }, { $set: { partnerId } });
    }

    const open = await invites
      .find({ role: "partner", partnerId: null, acceptedAt: null, expiresAt: { $gt: now } }, { projection: { _id: 1, email: 1 } })
      .toArray();
    for (const invite of open) {
      const application = await applications.findOne(
        { email: invite.email, status: "approved" },
        { sort: { decidedAt: -1 } },
      );
      if (!application) orphans.push(invite.email);
      const partnerId = await companyFor(
        db,
        application
          ? seedFromApplication(application)
          : {
              sourceId: invite._id,
              applicationId: null,
              name: invite.email,
              contactName: "",
              contactEmail: invite.email,
              contactPhone: "",
            },
        now,
      );
      await invites.updateOne({ _id: invite._id }, { $set: { partnerId, partnerRole: "main" } });
    }

    console.log(
      `${accounts.length} partner ${accounts.length === 1 ? "account is" : "accounts are"} now the main account of a company, and ${open.length} open ${open.length === 1 ? "invite has" : "invites have"} a company to join.`,
    );
    if (orphans.length > 0) {
      console.log(`No application matched these, so each company is named after the address: ${orphans.join(", ")}.`);
    }

    await ensureCollection(db, COLLECTIONS.users, usersValidator());
    await ensureIndex(db, COLLECTIONS.users, { partnerId: 1 }, { name: "users_partner" });
    await ensureCollection(db, COLLECTIONS.invites, invitesValidator());
    await ensureIndex(db, COLLECTIONS.invites, { partnerId: 1, acceptedAt: 1 }, { name: "invites_partner" });
    await ensureCollection(db, COLLECTIONS.properties, propertiesValidator());
    await ensureIndex(db, COLLECTIONS.properties, { partnerId: 1, status: 1 }, { name: "properties_partner" });
    await ensureIndex(db, COLLECTIONS.images, { partnerId: 1, createdAt: -1, _id: -1 }, { name: "images_partner" });
  },
};

// TODO(test): a partner account with an approved application becomes main of
// the company derived from it, twice run makes one company, and its listings
// and images take the company.
