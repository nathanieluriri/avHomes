import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { RateLimitedError } from "@avhomes/core";
import type { AuthAttemptDoc } from "../schema";

/**
 * Database-backed on purpose.
 *
 * An in-memory counter bounds ONE warm instance. Fluid Compute runs many, and a
 * limiter that resets when the platform scales out is a limiter an attacker gets
 * to reset by making more requests.
 *
 * The counter is one document per (key, window). `$inc` with an upsert is atomic,
 * so concurrent requests cannot both read 4 and both write 5.
 */
export async function limit(
  db: Db,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): Promise<void> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const id = `${key}:${windowStart}`;

  const after = await collection<AuthAttemptDoc>(db, COLLECTIONS.authAttempts).findOneAndUpdate(
    { _id: id },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        key,
        windowStart,
        // Swept by a TTL index rather than by a cleanup route. Two windows of
        // slack so a clock skew cannot delete a live counter.
        expiresAtDate: new Date(windowStart + windowMs * 2),
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const count = after?.count ?? 1;
  if (count > max) {
    // Seconds until the window rolls, not a fixed backoff: a client that obeys
    // Retry-After should come back exactly when it can succeed.
    const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    throw new RateLimitedError(retryAfter);
  }
}

/** Clears a bucket after a success, so one good login forgives the near misses. */
export async function clearLimit(
  db: Db,
  key: string,
  windowMs: number,
  now: number = Date.now(),
): Promise<void> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  await collection<AuthAttemptDoc>(db, COLLECTIONS.authAttempts).deleteOne({
    _id: `${key}:${windowStart}`,
  });
}
