import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { newId } from "@avhomes/core";
import type { Role, TeamInvite } from "@avhomes/contracts";
import { INVITE_TTL_MS, type InviteDoc, type UserDoc } from "../schema";

function invites(db: Db) {
  return collection<InviteDoc>(db, COLLECTIONS.invites);
}

export async function createInvite(
  db: Db,
  args: { email: string; role: Role; invitedBy: string },
): Promise<InviteDoc> {
  const now = Date.now();
  const doc: InviteDoc = {
    _id: newId("inv", now),
    email: args.email.trim().toLowerCase(),
    role: args.role,
    invitedBy: args.invitedBy,
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
    acceptedAt: null,
  };
  await invites(db).insertOne(doc);
  return doc;
}

/**
 * Claims the newest open invite for an address, atomically.
 *
 * `acceptedAt: null` inside the FILTER is what makes concurrent claims safe: two
 * exchanges racing for one address, and exactly one findOneAndUpdate matches.
 * There is no transaction here and none is needed, because a single document
 * update is atomic by definition.
 */
export async function claimInvite(db: Db, email: string): Promise<InviteDoc | null> {
  const now = Date.now();
  return invites(db).findOneAndUpdate(
    { email: email.trim().toLowerCase(), acceptedAt: null, expiresAt: { $gt: now } },
    { $set: { acceptedAt: now } },
    { sort: { createdAt: -1 }, returnDocument: "after" },
  );
}

/**
 * Hands a claimed invite back.
 *
 * The compensating half of `claimInvite`, for when creating the user afterwards
 * fails. `acceptedAt: claimedAt` in the filter means it only releases the claim
 * IT made, so a second exchange that legitimately claimed it meanwhile is not
 * trampled. Burning the invite instead would leave the invitee unable to ever
 * get in, with no visible cause.
 */
export async function releaseInvite(db: Db, inviteId: string, claimedAt: number): Promise<void> {
  await invites(db).updateOne({ _id: inviteId, acceptedAt: claimedAt }, { $set: { acceptedAt: null } });
}

export async function revokeInvite(db: Db, inviteId: string): Promise<boolean> {
  const result = await invites(db).deleteOne({ _id: inviteId });
  return result.deletedCount === 1;
}

export async function findOpenInvite(db: Db, email: string): Promise<InviteDoc | null> {
  return invites(db).findOne({
    email: email.trim().toLowerCase(),
    acceptedAt: null,
    expiresAt: { $gt: Date.now() },
  });
}

/**
 * Lists invites with a SERVER-COMPUTED state.
 *
 * `state` is derived from the same `Date.now()` the filter used. A client
 * comparing `expiresAt` against its own clock disagrees with the server on any
 * row within seconds of expiry, and then labels "open" a row the exchange
 * refuses.
 */
export async function listInvites(db: Db, includeHistory: boolean): Promise<TeamInvite[]> {
  const now = Date.now();
  const filter = includeHistory ? {} : { acceptedAt: null, expiresAt: { $gt: now } };

  const rows = await invites(db)
    .aggregate<InviteDoc & { inviter: UserDoc | undefined }>([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $limit: 200 },
      {
        $lookup: {
          from: COLLECTIONS.users,
          localField: "invitedBy",
          foreignField: "_id",
          as: "inviters",
        },
      },
      { $addFields: { inviter: { $arrayElemAt: ["$inviters", 0] } } },
      { $project: { inviters: 0 } },
    ])
    .toArray();

  return rows.map((row) => ({
    id: row._id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    invitedBy: row.invitedBy,
    // An inviter whose account was destroyed still leaves a readable row.
    invitedByName: row.inviter?.displayName ?? "a former teammate",
    state: row.acceptedAt != null ? "accepted" : row.expiresAt <= now ? "expired" : "open",
  }));
}
