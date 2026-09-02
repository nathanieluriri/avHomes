import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sessionSecret } from "@avhomes/core";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * The session token, and the id derived from it.
 *
 * The RAW TOKEN IS NEVER STORED. `sessions._id` is a keyed HMAC of it, so a
 * stolen database dump cannot be attacked offline the way a plain hash of a
 * high-entropy token could not be anyway, but more importantly cannot be
 * REPLAYED: the attacker holds ids, and an id is not a token.
 */
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenId(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

/**
 * Password hashing: scrypt from node:crypto.
 *
 * This is why the API function pins the Node runtime and never edge. The stored
 * form carries its own parameters so a later cost increase can be rolled out
 * without invalidating every existing hash.
 */
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

/**
 * Constant-time comparison, and a `false` for every malformed stored value.
 *
 * A user row with a null or corrupt hash must verify as "no" rather than throw,
 * because the caller is an unauthenticated login route and an exception there is
 * a 500 that distinguishes a real account from an absent one by timing alone.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    const derived = await scrypt(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * A dummy verify, run when no user matched.
 *
 * Without it, a login against an unknown address returns in microseconds while a
 * known one pays for scrypt, and the difference enumerates the user table.
 */
const DUMMY_HASH_PROMISE = hashPassword(randomBytes(32).toString("hex"));

export async function burnPasswordTime(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_HASH_PROMISE);
}
