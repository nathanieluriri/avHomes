import { NotImplementedError } from "./errors";

/**
 * The environment, parsed once and memoised.
 *
 * NOTHING HERE THROWS AT IMPORT TIME, and nothing throws at construction. Every
 * value defaults to an empty string and is checked at the point of use, so:
 *
 *  - `next build` runs with no secrets at all, which is the release gate;
 *  - a deployment with no mail, no Clerk and no blob store still boots and still
 *    serves the public read routes;
 *  - the feature that needs a missing value fails with a 501 that NAMES the
 *    variable, instead of a 500 that names nothing.
 */

export interface Env {
  MONGODB_URI: string;
  MONGODB_DB: string;
  SESSION_SECRET: string;
  /** Comma-separated EXACT origins. Never a suffix match. */
  APP_ORIGINS: string;
  /** The canonical public origin, used for canonical URLs and invite links. */
  SITE_ORIGIN: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  BLOB_READ_WRITE_TOKEN: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  /** Where a new enquiry is announced. Empty means "do not send". */
  ENQUIRY_NOTIFY_TO: string;
  NODE_ENV: string;
}

let cached: Env | null = null;

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export function getEnv(): Env {
  if (cached) return cached;
  cached = {
    MONGODB_URI: read("MONGODB_URI"),
    MONGODB_DB: read("MONGODB_DB", "avhomes"),
    SESSION_SECRET: read("SESSION_SECRET"),
    APP_ORIGINS: read("APP_ORIGINS"),
    SITE_ORIGIN: read("SITE_ORIGIN", read("NEXT_PUBLIC_SITE_ORIGIN", "http://localhost:3000")),
    CLERK_SECRET_KEY: read("CLERK_SECRET_KEY"),
    CLERK_PUBLISHABLE_KEY: read("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    BLOB_READ_WRITE_TOKEN: read("BLOB_READ_WRITE_TOKEN"),
    RESEND_API_KEY: read("RESEND_API_KEY"),
    MAIL_FROM: read("MAIL_FROM"),
    ENQUIRY_NOTIFY_TO: read("ENQUIRY_NOTIFY_TO"),
    NODE_ENV: read("NODE_ENV", "development"),
  };
  return cached;
}

/** For tests and scripts that mutate process.env after this module loaded. */
export function resetEnv(): void {
  cached = null;
}

/**
 * The database config, or a 501 naming exactly what to set.
 *
 * A deployment missing MONGODB_URI is a configuration mistake, not a bug, and
 * the operator needs the variable name rather than a driver stack trace.
 */
export function databaseConfig(): { uri: string; dbName: string } {
  const env = getEnv();
  if (env.MONGODB_URI === "") {
    throw new NotImplementedError("database", "set MONGODB_URI to your Atlas connection string");
  }
  return { uri: env.MONGODB_URI, dbName: env.MONGODB_DB };
}

/**
 * The session signing key.
 *
 * 32 bytes minimum, refused rather than padded. A short secret makes the stored
 * session HMAC cheap to attack offline, and the whole reason the raw token is
 * never stored is to make that attack expensive.
 */
export function sessionSecret(): string {
  const secret = getEnv().SESSION_SECRET;
  if (secret.length < 32) {
    throw new NotImplementedError(
      "sessions",
      "set SESSION_SECRET to at least 32 characters (openssl rand -base64 32)",
    );
  }
  return secret;
}

/**
 * The exact-match origin allow-list.
 *
 * SITE_ORIGIN is appended unconditionally whether or not anyone remembered to
 * put it in APP_ORIGINS, because leaving it out is not a policy decision, it is
 * a value somebody forgot to update, and the failure is silent.
 */
export function configuredOrigins(): readonly string[] {
  const env = getEnv();
  const listed = env.APP_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  const all = new Set(listed);
  if (env.SITE_ORIGIN !== "") all.add(env.SITE_ORIGIN.replace(/\/+$/, ""));
  if (env.NODE_ENV !== "production") {
    all.add("http://localhost:3000");
    all.add("http://127.0.0.1:3000");
  }
  return [...all];
}

/** The origin invite links and canonical URLs are built from. Never the Host header. */
export function siteOrigin(): string {
  return getEnv().SITE_ORIGIN.replace(/\/+$/, "");
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
