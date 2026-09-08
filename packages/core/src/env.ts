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
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  /** "local" writes to IMAGE_LOCAL_DIR, "blob" uses Vercel Blob, anything else
   *  (and the default) uses Cloudinary. */
  IMAGE_STORAGE: string;
  IMAGE_LOCAL_DIR: string;
  BLOB_READ_WRITE_TOKEN: string;
  /** cloudinary://<api_key>:<api_secret>@<cloud_name>, one string from the
   *  Cloudinary dashboard. */
  CLOUDINARY_URL: string;
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
    CLERK_SECRET_KEY: read("CLERK_SECRET_KEY"),
    CLERK_PUBLISHABLE_KEY: read("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    IMAGE_STORAGE: read("IMAGE_STORAGE", "cloudinary").toLowerCase(),
    IMAGE_LOCAL_DIR: read("IMAGE_LOCAL_DIR", ".uploads"),
    BLOB_READ_WRITE_TOKEN: read("BLOB_READ_WRITE_TOKEN"),
    CLOUDINARY_URL: read("CLOUDINARY_URL"),
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
 * The origin THIS REQUEST arrived on.
 *
 * There is no configured origin any more, and no allow-list. The app answers on
 * whatever host it is reached at, and every absolute URL it writes into an
 * email or a page is built from that same host, so a preview deployment, a
 * `*.vercel.app` alias and a custom domain each hand out links back to
 * themselves with nothing to configure and nothing to keep in sync.
 *
 * The trade is stated plainly because it is real: this value comes from the
 * request, so a caller that reaches the app on a host it does not own can make
 * the app print that host into an invite link. The mitigation is not a
 * configured origin, it is that the link only ever grants what the recipient
 * could already ask for, and that the session cookie is `SameSite=Lax` and
 * `__Host-` prefixed in production, so it is not sent to another site at all.
 */
export function requestOrigin(req: { url: string }): string {
  try {
    return new URL(req.url).origin;
  } catch {
    // A relative or malformed URL cannot happen through Hono, which always
    // hands over an absolute one, but a caller constructing a Request by hand
    // can, and a thrown TypeError here would surface as a 500 on a send.
    return "";
  }
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
