import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { NotFoundError, StaleWriteError } from "@avhomes/core";
import type {
  Partner,
  PartnerAccount,
  PartnerInvite,
  PartnerLimitOverrides,
  PartnerRole,
  PartnerStatus,
} from "@avhomes/contracts";
import type { InviteDoc, PartnerDoc, SessionDoc, UserDoc } from "../schema";

function partners(db: Db) {
  return collection<PartnerDoc>(db, COLLECTIONS.partners);
}

export function toPartner(doc: PartnerDoc): Partner {
  return {
    id: doc._id,
    name: doc.name,
    contactName: doc.contactName ?? "",
    contactEmail: doc.contactEmail ?? "",
    contactPhone: doc.contactPhone ?? "",
    status: doc.status,
    statusReason: doc.statusReason ?? "",
    limits: {
      review: doc.limits?.review ?? null,
      live: doc.limits?.live ?? null,
      staff: doc.limits?.staff ?? null,
    },
    mainUserId: doc.mainUserId ?? null,
    applicationId: doc.applicationId ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.revision,
  };
}

/** One application, one company: the id is the application's, re-prefixed. */
export function partnerIdForApplication(applicationId: string): string {
  return `ptnr_${applicationId.slice(applicationId.indexOf("_") + 1)}`;
}

export interface PartnerSeed {
  applicationId: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/**
 * The company an approved application stands for, made once.
 *
 * An upsert on an id derived from the application, so an approval retried
 * after a failure finds the company it already made instead of a second one.
 */
export async function upsertPartnerForApplication(db: Db, seed: PartnerSeed): Promise<Partner> {
  const now = Date.now();
  const id = partnerIdForApplication(seed.applicationId);
  await partners(db).updateOne(
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
  const doc = await partners(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`partner ${id}`);
  return toPartner(doc);
}

export async function findPartner(db: Db, id: string): Promise<Partner | null> {
  const doc = await partners(db).findOne({ _id: id });
  return doc ? toPartner(doc) : null;
}

/**
 * Every company, by name. Unpaged, like the team list: each one exists because
 * somebody approved an application, so the count grows by hand.
 */
export async function listPartners(db: Db): Promise<Partner[]> {
  const docs = await partners(db).find({}, { sort: { name: 1 }, limit: 500 }).toArray();
  return docs.map(toPartner);
}

export async function setPartnerMain(db: Db, partnerId: string, userId: string): Promise<void> {
  await partners(db).updateOne(
    { _id: partnerId },
    { $set: { mainUserId: userId, updatedAt: Date.now() }, $inc: { revision: 1 } },
  );
}

export interface PartnerPatch {
  name?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  limits?: PartnerLimitOverrides;
}

/** Named fields only, against the revision the caller read. A lost race is a 409. */
export async function updatePartner(
  db: Db,
  id: string,
  patch: PartnerPatch,
  baseRevision: number,
): Promise<Partner> {
  const set: Partial<PartnerDoc> = { updatedAt: Date.now() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.contactName !== undefined) set.contactName = patch.contactName;
  if (patch.contactEmail !== undefined) set.contactEmail = patch.contactEmail;
  if (patch.contactPhone !== undefined) set.contactPhone = patch.contactPhone;
  if (patch.limits !== undefined) set.limits = patch.limits;
  const after = await partners(db).findOneAndUpdate(
    { _id: id, revision: baseRevision },
    { $set: set, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (after) return toPartner(after);
  const current = await partners(db).findOne({ _id: id });
  if (!current) throw new NotFoundError(`partner ${id}`);
  throw new StaleWriteError("partner", baseRevision, current.revision, toPartner(current));
}

/**
 * Suspends or reinstates, with no revision check: stopping a company must not
 * fail because somebody edited its phone number a second earlier.
 */
export async function setPartnerStatus(
  db: Db,
  id: string,
  status: PartnerStatus,
  reason: string,
): Promise<Partner | null> {
  const after = await partners(db).findOneAndUpdate(
    { _id: id },
    { $set: { status, statusReason: reason, updatedAt: Date.now() }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  return after ? toPartner(after) : null;
}

export async function isSuspendedPartner(db: Db, partnerId: string | null): Promise<boolean> {
  if (!partnerId) return false;
  const doc = await partners(db).findOne({ _id: partnerId, status: "suspended" }, { projection: { _id: 1 } });
  return doc !== null;
}

/** Every account in a company, main first, each with when it was last active. */
export async function partnerAccounts(db: Db, partnerId: string): Promise<PartnerAccount[]> {
  const docs = await collection<UserDoc>(db, COLLECTIONS.users)
    .find(
      { partnerId },
      { projection: { _id: 1, email: 1, displayName: 1, partnerRole: 1, disabledAt: 1, createdAt: 1 } },
    )
    .toArray();
  const seen = await collection<SessionDoc>(db, COLLECTIONS.sessions)
    .aggregate<{ _id: string; last: number }>([
      { $match: { userId: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: "$userId", last: { $max: "$lastSeenAt" } } },
    ])
    .toArray();
  const last = new Map(seen.map((row) => [row._id, row.last]));
  const rank = (role: PartnerRole | null | undefined) => (role === "main" ? 0 : 1);
  return docs
    .map((doc) => ({
      id: doc._id,
      email: doc.email,
      displayName: doc.displayName,
      partnerRole: (doc.partnerRole ?? "staff") as PartnerRole,
      disabledAt: doc.disabledAt ?? null,
      lastActiveAt: last.get(doc._id) ?? null,
      createdAt: doc.createdAt,
    }))
    .sort((a, b) => rank(a.partnerRole) - rank(b.partnerRole) || a.createdAt - b.createdAt);
}

/** Every account id in a company, disabled ones included, for ending sessions. */
export async function partnerUserIds(db: Db, partnerId: string): Promise<string[]> {
  const docs = await collection<UserDoc>(db, COLLECTIONS.users)
    .find({ partnerId }, { projection: { _id: 1 } })
    .toArray();
  return docs.map((doc) => doc._id);
}

export async function openPartnerInvites(db: Db, partnerId: string): Promise<PartnerInvite[]> {
  const docs = await collection<InviteDoc>(db, COLLECTIONS.invites)
    .find({ partnerId, acceptedAt: null, expiresAt: { $gt: Date.now() } }, { sort: { createdAt: -1 } })
    .toArray();
  return docs.map((doc) => ({ id: doc._id, email: doc.email, createdAt: doc.createdAt, expiresAt: doc.expiresAt }));
}

/**
 * Staff seats in use: staff accounts not disabled, plus staff invites still
 * open. The main account never takes a seat. `exceptUserId` leaves one account
 * out, for re-enabling it.
 */
export async function countStaffSeats(db: Db, partnerId: string, exceptUserId?: string): Promise<number> {
  const [accounts, open] = await Promise.all([
    collection<UserDoc>(db, COLLECTIONS.users).countDocuments({
      partnerId,
      partnerRole: "staff",
      disabledAt: null,
      ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
    }),
    collection<InviteDoc>(db, COLLECTIONS.invites).countDocuments({
      partnerId,
      partnerRole: "staff",
      acceptedAt: null,
      expiresAt: { $gt: Date.now() },
    }),
  ]);
  return accounts + open;
}

// TODO(test): countStaffSeats leaves out the main account, disabled staff and
// expired invites, and counts open staff invites.
