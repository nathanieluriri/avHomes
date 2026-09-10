/**
 * What an audit payload is allowed to keep.
 *
 * PURE, and it imports nothing at all, including from the rest of this package.
 * A mistake in this file writes a credential into a store with two year
 * retention and no delete path, so it is deliberately small enough to read in
 * one sitting and to exercise without building a request.
 */

export const REDACTED = "[redacted]";

/** A subtree past the depth cap. Not a value anybody typed. */
export const DEEP = "[deep]";

/**
 * Neither the body nor the query string is captured for a path under one of
 * these prefixes. THIS IS THE CONTROL. The key list below is defence in depth
 * behind it, not the thing keeping credentials out of the log.
 *
 * The route that changes a password takes `{ current, next }`. Two innocuous
 * words, both carrying plaintext, and neither one a name any denylist would
 * think to carry: an earlier draft of the design listed `newPassword` and
 * `currentPassword`, names that exist nowhere in this repository, and would
 * have written both passwords into the log while appearing to have handled it.
 * Every route under this prefix exists to receive a credential, so there is
 * nothing here worth recording and no way to know which field is the secret.
 *
 * The query string gets the same exclusion for the same reason: an OAuth-style
 * `?code=` or `?ticket=` on a future auth route is exactly the "innocuous name,
 * real secret" case above, and today's denylist catching `?token=` is luck, not
 * a guarantee, the same luck this list exists to not rely on for the body.
 *
 * Matched against `c.req.path`, which carries the `/api` prefix at runtime.
 */
export const NO_CAPTURE_PREFIXES = ["/api/auth/"];

export const REDACT_KEYS = ["password", "token", "secret", "passwordHash",
                            "threadKey", "sessionId", "apiKey"];

const REDACT_NEEDLES = REDACT_KEYS.map((key) => key.toLowerCase());

/**
 * SUBSTRING, case-insensitive, and the claim is written down here because it is
 * the one thing about this list a reader cannot infer from the list.
 *
 * `confirmPassword`, `resetToken`, `clientSecret` and `X-Api-Key` are all
 * redacted. The case this list exists for is a credential arriving on a route
 * nobody expected to carry one, and a name invented on such a route is far
 * likelier to CONTAIN a listed word than to equal one. The cost is
 * over-redaction: a `tokenCount` loses its number. Losing a number from an
 * audit row is cheaper than keeping a secret in one for two years.
 *
 * `passwordHash` is therefore already covered by `password` and stays on the
 * list anyway, because the list is also documentation of what we know leaks.
 */
function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_NEEDLES.some((needle) => lower.includes(needle));
}

/**
 * Past this, a subtree is replaced rather than walked, so a cyclic or absurdly
 * nested payload cannot hang a request. Twelve clears every body this API
 * accepts with room to spare; the deepest real one is about four.
 */
const MAX_DEPTH = 12;

/** A string longer than this is replaced by its length. */
export const MAX_STRING = 512;

/** An array longer than this is replaced by its count. */
export const MAX_ARRAY = 20;

/** Last resort, in BYTES, after per-field trimming has already run. */
export const MAX_BYTES = 64 * 1024;

/**
 * Replaces every value whose KEY looks like a credential, at any depth, through
 * objects and arrays alike.
 *
 * Arrays matter as much as objects: a body can carry
 * `{ users: [{ password: "..." }] }`, and a walk that only recursed into plain
 * objects would store every one of them.
 *
 * Applied to `requested` AND to `before`. `before` carries whole stored
 * documents, so it is the field with the most to leak. It is safe on the users
 * path today only because `AUTH_PROJECTION` happens to exclude `passwordHash`,
 * and that is luck rather than a guarantee.
 *
 * TODO(test): every name in `REDACT_KEYS` is replaced, at the top level and
 *   nested, in upper case and in mixed case.
 * TODO(test): a password field inside an ARRAY of objects is replaced.
 *   `{ users: [{ password }] }` is the shape an object-only walk misses.
 * TODO(test): the substring claim above. `confirmPassword` and `resetToken` are
 *   redacted; `describes` is not. The claim is the thing being pinned, so the
 *   test and this comment move together or neither is true.
 * TODO(test): a `passwordHash` reaching `before` is redacted, driven through a
 *   route that hands over an unprojected user document.
 */
export function redact(value: unknown): unknown {
  return walk(value, 0);
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return DEEP;
  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
  if (value === null || typeof value !== "object") return value;
  // A Date is the one object worth keeping whole. Walking its own properties
  // yields `{}`, which loses the timestamp without redacting anything.
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSecretKey(key) ? REDACTED : walk(item, depth + 1);
  }
  return out;
}

/**
 * Shortens a payload FIELD BY FIELD, never all or nothing.
 *
 * An earlier draft replaced any payload over 16KB with `{ _truncated: true }`,
 * which destroys the record this whole feature exists for: the property editor
 * sends the entire patch on every save and `PatchBody` permits a 20,000
 * character description, so one long description pushed `priceMinor` over the
 * cliff with it and "who dropped the price" had no answer. The values that
 * settle arguments are small. Keeping every scalar and dropping the prose is
 * what makes an entry answer the question it was written for.
 *
 * Run AFTER `redact`, so a 20,000 character password is already `[redacted]`
 * rather than a marker that reports its length.
 *
 * TODO(test): a 20,000 character description beside a `priceMinor` keeps the
 *   price. This is the case the all-or-nothing version got wrong, and the whole
 *   reason the trimming is per field.
 * TODO(test): 512 characters survive and 513 become the marker; 20 entries
 *   survive and 21 become the count.
 * TODO(test): a payload still over 64KB after per-field trimming becomes
 *   `{ _truncated: true }`, measured in BYTES rather than characters.
 */
export function trim(value: unknown): unknown {
  const shortened = shorten(value, 0);
  return withinLimit(shortened) ? shortened : { _truncated: true };
}

function shorten(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return DEEP;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `[long: ${value.length} chars]` : value;
  }
  if (Array.isArray(value)) {
    // The COUNT, not the first twenty. Twenty image URLs answer nothing that
    // "there were forty" does not, and they cost forty times as much to keep.
    if (value.length > MAX_ARRAY) return [`[list: ${value.length} items]`];
    return value.map((item) => shorten(item, depth + 1));
  }
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = shorten(item, depth + 1);
  return out;
}

/**
 * BYTES, not characters. A 40,000 character body in a script that encodes to
 * three bytes a character is 120KB on the wire, and a character count would
 * wave it through the one limit standing between this collection and a row
 * Mongo refuses.
 */
function withinLimit(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") <= MAX_BYTES;
  } catch {
    // A value JSON cannot render (a BigInt, a `toJSON` that throws) cannot be
    // stored either, so it takes the last-resort marker. Cycles are already
    // gone: the depth cap above turns one into `[deep]` on the way through.
    return false;
  }
}
