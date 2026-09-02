import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import type { AuthUser, SessionSummary } from "@avhomes/contracts";
import {
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_SLIDE_THRESHOLD_MS,
  SESSION_TTL_MS,
  type SessionDoc,
  type UserDoc,
} from "../schema";
import { mintSessionToken, tokenId } from "../crypto";
import { toAuthUser } from "./users";

function sessions(db: Db) {
  return collection<SessionDoc>(db, COLLECTIONS.sessions);
}

export interface MintedSession {
  token: string;
  expiresAt: number;
}

export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | null,
): Promise<MintedSession> {
  const now = Date.now();
  const token = mintSessionToken();
  const expiresAt = now + SESSION_TTL_MS;
  const absoluteExpiresAt = now + SESSION_ABSOLUTE_MAX_MS;
  await sessions(db).insertOne({
    _id: tokenId(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    absoluteExpiresAt,
    expiresAtDate: new Date(absoluteExpiresAt),
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export interface ResolvedSession {
  user: AuthUser;
  sessionId: string;
}

/**
 * Resolves a token to a user, slides the expiry, and records last-seen.
 *
 * One aggregation rather than a find-then-find, because a session read happens
 * on every authenticated request and a second round trip to Atlas is the most
 * expensive line in this file.
 *
 * A DISABLED USER RESOLVES TO NULL. Disabling destroys sessions, but a session
 * created in the same millisecond as the disable would otherwise survive it.
 */
export async function resolveSession(db: Db, token: string): Promise<ResolvedSession | null> {
  const now = Date.now();
  const id = tokenId(token);

  const rows = await sessions(db)
    .aggregate<{ session: SessionDoc; user: UserDoc | undefined }>([
      { $match: { _id: id, expiresAt: { $gt: now }, absoluteExpiresAt: { $gt: now } } },
      {
        $lookup: {
          from: COLLECTIONS.users,
          localField: "userId",
          foreignField: "_id",
          as: "users",
        },
      },
      {
        $project: {
          _id: 0,
          session: "$$ROOT",
          user: { $arrayElemAt: ["$users", 0] },
        },
      },
    ])
    .toArray();

  const row = rows[0];
  if (!row?.user || row.user.disabledAt != null) return null;

  const session = row.session;
  const slid = Math.min(now + SESSION_TTL_MS, session.absoluteExpiresAt);

  // Write only when the slide is worth a round trip, but ALWAYS record last-seen
  // so the sessions screen's "last used" column can be trusted.
  const update: Partial<SessionDoc> =
    slid - session.expiresAt > SESSION_SLIDE_THRESHOLD_MS
      ? { lastSeenAt: now, expiresAt: slid }
      : { lastSeenAt: now };

  await sessions(db).updateOne({ _id: id }, { $set: update });

  return { user: toAuthUser(row.user), sessionId: id };
}

/** Ends one session. Scoped by user so an id belonging to someone else is a no-op. */
export async function revokeSession(db: Db, userId: string, sessionId: string): Promise<boolean> {
  const result = await sessions(db).deleteOne({ _id: sessionId, userId });
  return result.deletedCount === 1;
}

export async function revokeSessionByToken(db: Db, token: string): Promise<void> {
  await sessions(db).deleteOne({ _id: tokenId(token) });
}

/**
 * Destroys every session for a user. Returns how many, because the caller cannot
 * compute it: those rows are gone. "Signed out 3 devices" is the only feedback
 * that distinguishes revoking a live account from tidying a dormant one.
 */
export async function endAllSessions(db: Db, userId: string): Promise<number> {
  const result = await sessions(db).deleteMany({ userId });
  return result.deletedCount ?? 0;
}

/** A caller's OWN sessions. There is deliberately no owner override. */
export async function listSessions(
  db: Db,
  userId: string,
  currentSessionId: string | null,
): Promise<SessionSummary[]> {
  const now = Date.now();
  const docs = await sessions(db)
    .find(
      { userId, expiresAt: { $gt: now } },
      {
        projection: { _id: 1, createdAt: 1, lastSeenAt: 1, expiresAt: 1, userAgent: 1 },
        sort: { lastSeenAt: -1 },
      },
    )
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    createdAt: doc.createdAt,
    lastSeenAt: doc.lastSeenAt,
    expiresAt: doc.expiresAt,
    userAgent: doc.userAgent,
    current: doc._id === currentSessionId,
  }));
}
