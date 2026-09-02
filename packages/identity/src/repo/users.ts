import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { DuplicateError, newId } from "@avhomes/core";
import type { AuthUser, Role, TeamUser } from "@avhomes/contracts";
import type { UserDoc } from "../schema";

/**
 * No `find({})` without a projection on this collection.
 *
 * `passwordHash` lives here. An enumerated projection means a column added later
 * cannot arrive in a response by default, which is the whole rule.
 */
const AUTH_PROJECTION = { _id: 1, email: 1, displayName: 1, role: 1, disabledAt: 1 } as const;
const TEAM_PROJECTION = {
  _id: 1,
  email: 1,
  displayName: 1,
  role: 1,
  createdAt: 1,
  disabledAt: 1,
} as const;

function users(db: Db) {
  return collection<UserDoc>(db, COLLECTIONS.users);
}

export function toAuthUser(doc: Pick<UserDoc, "_id" | "email" | "displayName" | "role">): AuthUser {
  return { id: doc._id, email: doc.email, displayName: doc.displayName, role: doc.role };
}

export interface FoundUser {
  user: AuthUser;
  disabledAt: number | null;
}

export async function findUserByEmail(db: Db, email: string): Promise<FoundUser | null> {
  const doc = await users(db).findOne(
    { email: email.trim().toLowerCase() },
    { projection: AUTH_PROJECTION },
  );
  return doc ? { user: toAuthUser(doc), disabledAt: doc.disabledAt ?? null } : null;
}

export async function findUserById(db: Db, id: string): Promise<FoundUser | null> {
  const doc = await users(db).findOne({ _id: id }, { projection: AUTH_PROJECTION });
  return doc ? { user: toAuthUser(doc), disabledAt: doc.disabledAt ?? null } : null;
}

/** The one read that returns the hash. Nothing else may select it. */
export async function findCredentialByEmail(
  db: Db,
  email: string,
): Promise<{ user: AuthUser; passwordHash: string | null; disabledAt: number | null } | null> {
  const doc = await users(db).findOne(
    { email: email.trim().toLowerCase() },
    { projection: { ...AUTH_PROJECTION, passwordHash: 1 } },
  );
  if (!doc) return null;
  return {
    user: toAuthUser(doc),
    passwordHash: doc.passwordHash ?? null,
    disabledAt: doc.disabledAt ?? null,
  };
}

export interface CreateUserArgs {
  email: string;
  displayName: string;
  role: Role;
  passwordHash?: string | null;
}

export async function createUser(db: Db, args: CreateUserArgs): Promise<AuthUser> {
  const now = Date.now();
  const email = args.email.trim().toLowerCase();
  const displayName = args.displayName.trim();
  if (displayName === "") {
    // Refused rather than defaulted here, because the caller knows a better
    // fallback than this layer does (the local part of the address).
    throw new Error("createUser requires a non-empty displayName");
  }
  const doc: UserDoc = {
    _id: newId("usr", now),
    email,
    displayName,
    role: args.role,
    passwordHash: args.passwordHash ?? null,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
  };
  try {
    await users(db).insertOne(doc);
  } catch (err) {
    // The unique index is the authority on "is this address taken", not a read
    // beforehand, which races.
    if (isDuplicateKey(err)) throw new DuplicateError("email", email);
    throw err;
  }
  return toAuthUser(doc);
}

export async function setPasswordHash(db: Db, userId: string, hash: string): Promise<void> {
  await users(db).updateOne(
    { _id: userId },
    { $set: { passwordHash: hash, updatedAt: Date.now() } },
  );
}

export async function setDisplayName(db: Db, userId: string, displayName: string): Promise<AuthUser | null> {
  const after = await users(db).findOneAndUpdate(
    { _id: userId },
    { $set: { displayName, updatedAt: Date.now() } },
    { returnDocument: "after", projection: AUTH_PROJECTION },
  );
  return after ? toAuthUser(after) : null;
}

/**
 * Refuses in the SQL, not only in the route.
 *
 * `role: { $ne: "owner" }` in the filter and an owner never in `next` means the
 * owner's role is immutable in BOTH directions as a property of the statement,
 * rather than a rule two route handlers each remember.
 */
export async function setUserRole(db: Db, userId: string, role: Role): Promise<TeamUser | null> {
  if (role === "owner") return null;
  const after = await users(db).findOneAndUpdate(
    { _id: userId, role: { $ne: "owner" } },
    { $set: { role, updatedAt: Date.now() } },
    { returnDocument: "after", projection: TEAM_PROJECTION },
  );
  return after ? { ...toAuthUser(after), createdAt: after.createdAt, disabledAt: after.disabledAt ?? null, listingCount: 0, postCount: 0 } : null;
}

/** Idempotent: disabling an already-disabled user keeps the original timestamp. */
export async function disableUser(db: Db, userId: string): Promise<void> {
  const now = Date.now();
  await users(db).updateOne(
    { _id: userId, disabledAt: null },
    { $set: { disabledAt: now, updatedAt: now } },
  );
}

export async function enableUser(db: Db, userId: string): Promise<void> {
  await users(db).updateOne(
    { _id: userId },
    { $set: { disabledAt: null, updatedAt: Date.now() } },
  );
}

/** Keeps the last active owner enableable, phrased as an invariant not an identity check. */
export async function countActiveOwners(db: Db): Promise<number> {
  return users(db).countDocuments({ role: "owner", disabledAt: null });
}

/**
 * Unpaginated by design. Accounts exist only by invite, one at a time. An
 * instance with enough of them to page is one where something has gone wrong.
 */
export async function listUsers(db: Db): Promise<Omit<TeamUser, "listingCount" | "postCount">[]> {
  const docs = await users(db)
    .find({}, { projection: TEAM_PROJECTION, sort: { createdAt: 1 } })
    .toArray();
  return docs.map((doc) => ({
    ...toAuthUser(doc),
    createdAt: doc.createdAt,
    disabledAt: doc.disabledAt ?? null,
  }));
}

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
