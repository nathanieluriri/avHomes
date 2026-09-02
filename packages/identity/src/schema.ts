import type { Role } from "@avhomes/contracts";

/** The stored shapes. The wire shapes live in @avhomes/contracts. */

export interface UserDoc {
  _id: string;
  /** Lowercased on write, so the unique index is the whole constraint. */
  email: string;
  displayName: string;
  role: Role;
  /** Null under the Clerk door, and until a password claim under the other. */
  passwordHash: string | null;
  createdAt: number;
  updatedAt: number;
  /** Non-null means revoked. Sessions were destroyed with it. */
  disabledAt: number | null;
}

export interface SessionDoc {
  /** The HMAC of the token under SESSION_SECRET. The raw token is never stored. */
  _id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  /** The sliding window. The authority on whether this session is alive. */
  expiresAt: number;
  /** The hard ceiling a slide can never push past. */
  absoluteExpiresAt: number;
  /** Written only so a TTL index can sweep the row. Never read by the app. */
  expiresAtDate: Date;
  userAgent: string | null;
}

export interface InviteDoc {
  _id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
}

export interface AuthAttemptDoc {
  _id: string;
  key: string;
  windowStart: number;
  count: number;
  expiresAtDate: Date;
}

/** Sliding window, refreshed on use. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** The ceiling. A slide never pushes past this, so a session cannot live forever. */
export const SESSION_ABSOLUTE_MAX_MS = 90 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Only re-write `expiresAt` when it has moved enough to matter. A write on every
 * request would turn every authenticated read into a read plus a write.
 */
export const SESSION_SLIDE_THRESHOLD_MS = 60 * 60 * 1000;

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ENQUIRY_IP_LIMIT = 10;
export const ENQUIRY_WINDOW_MS = 60 * 60 * 1000;
/**
 * TWO ceilings, because rate and growth are different problems.
 *
 * `PULSE_IP_LIMIT` bounds beacons per minute. It has to be generous: a browser
 * beacons on load, on every navigation and once a minute while the tab is
 * visible, and a whole office behind one NAT shares an address. Generous is
 * fine, because a beacon against a session that already exists only moves a
 * timestamp on a document that is already there.
 *
 * `PULSE_NEW_IP_LIMIT` bounds the creation of NEW session documents, and it is
 * the one that actually protects anything. A rate ceiling alone does not: at
 * 120 a minute a loop minting fresh ids writes 172,800 rows a day, sets the
 * Sessions tile to whatever it likes, and fills the collection. So new sessions
 * get their own, far tighter bucket.
 *
 * 60 an hour from one address is a lot for this site and nothing for a script.
 * The honest cost is that a very large carrier NAT can clip against it, and
 * when it does the beacon is refused and the visit goes UNCOUNTED. That
 * direction is deliberate: this figure should undercount under pressure rather
 * than overcount, because an operator can act on a number that is too low and
 * cannot act on one that has been set by a stranger.
 */
export const PULSE_IP_LIMIT = 120;
export const PULSE_WINDOW_MS = 60 * 1000;
export const PULSE_NEW_IP_LIMIT = 60;
export const PULSE_NEW_WINDOW_MS = 60 * 60 * 1000;

/**
 * The cookie name.
 *
 * `__Host-` is not decoration. The browser refuses a cookie with this prefix
 * unless it is Secure, has Path=/ and carries NO Domain attribute. That last one
 * is the point: without it any subdomain, including a preview deployment or
 * anything an attacker gets to host on the registrable domain, can set a cookie
 * the app then treats as a session. That is session fixation with no XSS needed.
 *
 * The prefix also requires HTTPS, so local development over http falls back to a
 * plain name. `secureCookieName()` is the one place that decides.
 */
export const SESSION_COOKIE_SECURE = "__Host-avhomes_session";
export const SESSION_COOKIE_INSECURE = "avhomes_session";
