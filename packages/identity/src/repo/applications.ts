/**
 * Somebody outside AV Homes asking to list property.
 *
 * A collection of its own rather than an invite with a flag, because an invite
 * records a DECISION already made and this records a REQUEST that has not been
 * decided. Squeezing the two together would mean every invite query had to
 * remember to exclude the ones nobody has said yes to yet.
 *
 * Approving one creates an ordinary invite at role `partner`, so the account is
 * minted by the machinery that already mints every other account. There is no
 * second door.
 */

import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import { DuplicateError, NotFoundError, newId } from "@avhomes/core";

export const APPLICATION_STATUSES = ["open", "approved", "refused"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface PartnerApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  /** What they have to list, in their own words. */
  about: string;
  /** Roughly how many. A range, not a promise. */
  portfolio: string;
  status: ApplicationStatus;
  reason: string;
  decidedByName: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ApplicationDoc {
  _id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  about: string;
  portfolio: string;
  status: ApplicationStatus;
  reason: string;
  decidedByName: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

function rows(db: Db) {
  return collection<ApplicationDoc>(db, COLLECTIONS.partnerApplications);
}

function toApplication(doc: ApplicationDoc): PartnerApplication {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    phone: doc.phone ?? "",
    company: doc.company ?? "",
    about: doc.about ?? "",
    portfolio: doc.portfolio ?? "",
    status: doc.status,
    reason: doc.reason ?? "",
    decidedByName: doc.decidedByName ?? "",
    decidedAt: doc.decidedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

export interface ApplicationInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  about: string;
  portfolio: string;
}

/**
 * File an application.
 *
 * The partial unique index refuses a second OPEN one from the same address, which
 * is reported as a duplicate rather than silently accepted: two approvals of one
 * person would mint two accounts. Applying again after a refusal is allowed, and is
 * a normal thing to want.
 */
export async function createApplication(
  db: Db,
  input: ApplicationInput,
): Promise<PartnerApplication> {
  const now = Date.now();
  const doc: ApplicationDoc = {
    _id: newId("appl", now),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    company: input.company.trim(),
    about: input.about.trim(),
    portfolio: input.portfolio.trim(),
    status: "open",
    reason: "",
    decidedByName: "",
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await rows(db).insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new DuplicateError("email", doc.email);
    throw err;
  }
  return toApplication(doc);
}

/** Undecided first, then newest. The queue somebody actually works. */
export async function listApplications(
  db: Db,
  input: { status?: ApplicationStatus; limit: number },
): Promise<PartnerApplication[]> {
  const filter = input.status ? { status: input.status } : {};
  const found = await rows(db)
    .find(filter, { sort: { createdAt: -1 }, limit: input.limit })
    .toArray();
  const rank = (status: ApplicationStatus) => (status === "open" ? 0 : 1);
  return found
    .map(toApplication)
    .sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt - a.createdAt);
}

export async function getApplication(db: Db, id: string): Promise<PartnerApplication | null> {
  const doc = await rows(db).findOne({ _id: id });
  return doc ? toApplication(doc) : null;
}

/**
 * Decide one.
 *
 * A CAS on `status: "open"`, so two admins deciding at once cannot both act and the
 * loser is told rather than silently overwriting the winner. The caller creates the
 * invite only after this claims the row, which is the order that cannot mint an
 * account for an application somebody else refused a moment earlier.
 */
export async function decideApplication(
  db: Db,
  id: string,
  input: { approve: boolean; reason: string; byName: string },
): Promise<PartnerApplication> {
  const now = Date.now();
  const after = await rows(db).findOneAndUpdate(
    { _id: id, status: "open" },
    {
      $set: {
        status: input.approve ? "approved" : "refused",
        reason: input.reason,
        decidedByName: input.byName,
        decidedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!after) {
    const current = await rows(db).findOne({ _id: id });
    if (!current) throw new NotFoundError(`application ${id}`);
    // Already decided. The caller reports it rather than deciding it twice.
    return toApplication(current);
  }
  return toApplication(after);
}

/**
 * Puts an approval back to open when the company or invite it needed could not be made.
 *
 * A compare-and-set on the decision this call wrote, so it never undoes somebody
 * else's. A newer open application from the same address wins the unique index,
 * and this one then stays approved.
 */
export async function reopenApplication(db: Db, id: string, decidedAt: number): Promise<boolean> {
  try {
    const result = await rows(db).updateOne(
      { _id: id, status: "approved", decidedAt },
      { $set: { status: "open", reason: "", decidedByName: "", decidedAt: null, updatedAt: Date.now() } },
    );
    return result.modifiedCount === 1;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

/** How many are waiting, for the nav badge. A queue nobody sees is a queue nobody works. */
export async function openApplicationCount(db: Db): Promise<number> {
  return rows(db).countDocuments({ status: "open" });
}

// TODO(test): a second open application from one address is a 409.
// TODO(test): applying again after a refusal is accepted.
// TODO(test): deciding an already-decided application returns it unchanged.
