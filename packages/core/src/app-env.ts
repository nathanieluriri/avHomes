import type { Context } from "hono";
import type { Db } from "@avhomes/db";
import type { AuthUser } from "@avhomes/contracts";
import { UnauthenticatedError } from "./errors";

/**
 * The Hono context typing every router in the application shares.
 *
 * `dbFactory` rather than `db`, and the difference is measurable: a request that
 * never touches the database (an unrouted path, an anonymous 401) never builds
 * a client, so its answer cannot be turned into a 500 by an environment it did
 * not need.
 */
export interface AppVariables {
  requestId: string;
  dbFactory: () => Promise<Db>;
  /** Resolved by sessionMiddleware. `undefined` above it, `null` when anonymous. */
  user: AuthUser | null;
  /** The session id, so a caller can see which of its own sessions is current. */
  sessionId: string | null;
}

export type AppEnv = { Variables: AppVariables };

/** Resolves the handle on first use and memoises it for the rest of the request. */
export function currentDb(c: Context<AppEnv>): Promise<Db> {
  const factory = c.get("dbFactory");
  if (!factory) {
    // A router mounted above the db middleware asking for a handle is a wiring
    // bug, and it must not read as a database outage.
    throw new Error("currentDb called from a router mounted above the database middleware");
  }
  return factory();
}

/**
 * The signed-in user, or a 401.
 *
 * Separate from `c.get('user')` so a route that merely wants to KNOW whether
 * someone is signed in does not have to catch an exception to find out.
 */
export function currentUser(c: Context<AppEnv>): AuthUser {
  const user = c.get("user");
  if (!user) throw new UnauthenticatedError("route requires a session");
  return user;
}

export function requestId(c: Context<AppEnv>): string {
  return c.get("requestId") ?? "";
}

/**
 * The caller's IP, for rate limiting.
 *
 * Vercel sets `x-forwarded-for` and its leftmost entry is the client. It is
 * spoofable in general, which is why this is used only to BUCKET a limiter and
 * never to authorise anything.
 */
export function clientIp(c: Context<AppEnv>): string {
  const forwarded = c.req.header("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || c.req.header("x-real-ip") || "unknown";
}
