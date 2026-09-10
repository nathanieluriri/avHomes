/**
 * Identifiers: a type prefix, then a lexicographically sortable body.
 *
 * The body is Crockford base32 over a 48-bit millisecond timestamp plus 80 bits
 * of randomness, which is ULID's layout. Two properties earn it:
 *
 *  - **Sorting by id sorts by creation time.** That makes `_id` a legitimate
 *    keyset tiebreaker and gives every index a monotonic-ish leading edge.
 *  - **It is a string everywhere.** An ObjectId serialises differently depending
 *    on the path it takes to JSON, so the id in a URL stops being the id in the
 *    document. This one is the same bytes in Mongo, in a response and in a link.
 *
 * The prefix is not decoration: a stray `prop_...` in a post's author field is
 * visible at a glance, where two bare hex strings are not.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

export const ID_PREFIXES = {
  user: "usr",
  session: "ses",
  invite: "inv",
  property: "prop",
  testimonial: "tst",
  stat: "stat",
  post: "post",
  revision: "rev",
  category: "cat",
  image: "img",
  enquiry: "enq",
  message: "msg",
  note: "note",
  attempt: "att",
  subscriber: "sub",
  audit: "aud",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

function digit(index: number): string {
  return ALPHABET.charAt(index);
}

function encodeTime(now: number): string {
  let out = "";
  let value = now;
  for (let i = TIME_CHARS - 1; i >= 0; i--) {
    out = digit(value % 32) + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_CHARS);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += digit(byte % 32);
  return out;
}

export function newId(prefix: IdPrefix, now: number = Date.now()): string {
  return `${prefix}_${encodeTime(now)}${encodeRandom()}`;
}

const ID_SHAPE = /^([a-z]{3,4})_([0-9A-HJKMNP-TV-Z]{26})$/;

/**
 * Shape check only. It proves the string is one of ours before it reaches a
 * query, so a 404 for a malformed id costs no database round trip.
 */
export function isId(value: string, prefix?: IdPrefix): boolean {
  const match = ID_SHAPE.exec(value);
  if (!match) return false;
  return prefix === undefined || match[1] === prefix;
}

/** The millisecond the id was minted, or null if it is not one of ours. */
export function idTime(value: string): number | null {
  if (!isId(value)) return null;
  const start = value.indexOf("_") + 1;
  let out = 0;
  for (const char of value.slice(start, start + TIME_CHARS)) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    out = out * 32 + index;
  }
  return out;
}

/**
 * Combining marks, as an escape string rather than a regex literal, so this file
 * stays plain ASCII. NFKD splits an accented letter into base plus mark; this
 * strips the marks so "Lekki Phase 1" and an accented spelling slug the same.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * A URL-safe slug from a title.
 *
 * Returns null rather than an empty string when nothing survives, because "this
 * listing has no slug yet" and "this listing's slug is empty" are different
 * states, and only the first is storable under a unique index.
 */
export function slugify(input: string): string | null {
  const slug = input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
  return slug === "" ? null : slug;
}

/**
 * Appends a short discriminator to a slug that collided.
 *
 * Callers retry with this rather than looping over `-2`, `-3`, because a scan
 * for the next free integer is a read per attempt against a unique index that
 * will answer the question anyway.
 */
export function disambiguateSlug(slug: string): string {
  const suffix = encodeRandom().slice(0, 4).toLowerCase();
  return `${slug.slice(0, 155)}-${suffix}`;
}
