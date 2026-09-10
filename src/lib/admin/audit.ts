import type { AuditEntity } from "@avhomes/contracts";
import { dateTime } from "./format";

/**
 * Turns a raw audit entry into the sentence a person reads, and turns its
 * `before`/`requested` payloads into the before-and-after grid an expanded
 * row shows.
 *
 * Lives beside `format.ts` rather than inside it: everything here is specific
 * to the audit trail's two screens, where `format.ts` is shared by the whole
 * console.
 */

/* ─────────────────────────────── vocabulary ────────────────────────────── */

/** Singular noun, in the console's own words rather than the wire's. */
const ENTITY_NOUN: Record<AuditEntity, string> = {
  property: "listing",
  post: "post",
  category: "category",
  image: "image",
  enquiry: "enquiry",
  user: "team member",
  invite: "invite",
  testimonial: "testimonial",
  stat: "stat",
  note: "note",
  settings: "settings",
  session: "session",
  auth: "sign-in",
  unknown: "record",
};

/** The entity filter's options, in the same order as `AUDIT_ENTITIES`. */
export const ENTITY_FILTER_LABEL: Record<AuditEntity, string> = {
  property: "Listings",
  post: "Posts",
  category: "Categories",
  image: "Images",
  enquiry: "Enquiries",
  user: "Team members",
  invite: "Invites",
  testimonial: "Testimonials",
  stat: "Stats",
  note: "Notes",
  settings: "Settings",
  session: "Sessions",
  auth: "Sign-in",
  unknown: "Other",
};

/**
 * Lifecycle and other named operations, as the phrase that follows the
 * actor's name. Takes the TARGET as a parameter rather than being appended
 * after a fixed verb, because several of these read wrongly with the target
 * glued on the end: "marked under offer this listing" is not a sentence,
 * "marked this listing under offer" is.
 */
const OP_PREDICATES: Record<string, (target: string) => string> = {
  publish: (t) => `published ${t}`,
  unpublish: (t) => `unpublished ${t}`,
  markOffer: (t) => `marked ${t} under offer`,
  relist: (t) => `put ${t} back on the market`,
  close: (t) => `marked ${t} closed`,
  archive: (t) => `archived ${t}`,
  unarchive: (t) => `unarchived ${t}`,
  restore: (t) => `restored ${t}`,
  disable: (t) => `disabled ${t}`,
  enable: (t) => `enabled ${t}`,
  // The one op that is a possessive rather than a verb on the target, and the
  // reason this table takes the target instead of appending it.
  role: (t) => `changed ${t}'s role`,
  reply: (t) => `replied to ${t}`,
};

/** Splits `someOp` into `some op`, for an operation this file has no name for. */
function humaniseOp(op: string): string {
  return op
    .replace(/[-_]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function targetPhrase(entity: AuditEntity, entityId: string | null): string {
  // A singleton, so it takes the definite article rather than "a settings"
  // or "this settings".
  if (entity === "settings") return "the settings";
  const noun = ENTITY_NOUN[entity];
  return entityId ? `this ${noun}` : `a ${noun}`;
}

/**
 * Auth and session actions read as a complete sentence on their own: the
 * actor IS the subject and the object, so appending a target would name the
 * same person twice ("Adaeze signed in to a sign-in").
 */
function authPredicate(action: string): string | null {
  if (action === "op:logout") return "signed out";
  if (action === "op:login") return "signed in";
  if (action === "op:claim") return "claimed their account";
  if (action === "op:password-change") return "changed their password";
  if (action === "delete") return "ended a session";
  return null;
}

function predicateFor(entity: AuditEntity, action: string, entityId: string | null): string {
  // `PATCH /auth/me`: entity "user", no id, always a self-edit. Left to the
  // generic branch below this reads as "updated a team member", which names
  // the wrong person on the one row where the actor and the target are the
  // same.
  if (entity === "user" && action === "update" && entityId === null) return "updated their profile";

  if (entity === "auth" || entity === "session") {
    const phrase = authPredicate(action);
    if (phrase) return phrase;
  }

  const target = targetPhrase(entity, entityId);

  if (action === "create") return `created ${target}`;
  if (action === "update") return `updated ${target}`;
  if (action === "delete") {
    // Neither listings nor posts have a permanent delete. Calling this
    // "deleted" would claim something the product does not do.
    if (entity === "property" || entity === "post") return `moved ${target} to the trash`;
    if (entity === "invite") return `revoked ${target}`;
    return `deleted ${target}`;
  }
  if (action.startsWith("op:")) {
    const op = action.slice(3);
    const build = OP_PREDICATES[op];
    return build ? build(target) : `ran "${humaniseOp(op)}" on ${target}`;
  }
  return `changed ${target}`;
}

/** The full sentence for a row on `/admin/audit`. */
export function auditSentence(entry: {
  actorName: string;
  entity: AuditEntity;
  action: string;
  entityId: string | null;
}): string {
  return `${entry.actorName} ${predicateFor(entry.entity, entry.action, entry.entityId)}.`;
}

/**
 * The property editor's History panel line. The entity is always "property"
 * and the record is always the one on screen, so the sentence drops both:
 * "marked this under offer", not "marked this listing under offer" repeated
 * down a panel that is already titled with the listing's own name.
 */
export function historySentence(actorName: string, action: string): string {
  return `${actorName} ${historyPredicate(action)}.`;
}

function historyPredicate(action: string): string {
  if (action === "create") return "created this";
  if (action === "update") return "updated this";
  if (action === "delete") return "moved this to the trash";
  if (action.startsWith("op:")) {
    const op = action.slice(3);
    const build = OP_PREDICATES[op];
    return build ? build("this") : `ran "${humaniseOp(op)}" on this`;
  }
  return "changed this";
}

/* ────────────────────────────── the target ─────────────────────────────── */

/** The three kinds with a page of their own, by the collection that page sits under. */
const OWN_PAGE: Partial<Record<AuditEntity, string>> = {
  property: "/admin/properties",
  post: "/admin/posts",
  enquiry: "/admin/enquiries",
};

/**
 * Where the rest are managed, for the kinds the console shows somewhere.
 *
 * A screen holding all of them is still the right destination: an image lives
 * in the library and a role lives on the team screen, and sending a reader
 * there beats sending them nowhere. The kinds absent from this table have no
 * screen at all, so their rows name the record and stop.
 */
const ENTITY_SCREEN: Partial<Record<AuditEntity, { href: string; label: string }>> = {
  property: { href: "/admin/properties", label: "the listings" },
  post: { href: "/admin/posts", label: "the journal" },
  enquiry: { href: "/admin/enquiries", label: "the inbox" },
  user: { href: "/admin/team", label: "the team screen" },
  // The team screen's "Open invites" panel is where an invite is read and
  // revoked, so it is a destination even though an invite has no page.
  invite: { href: "/admin/team", label: "the team screen" },
  image: { href: "/admin/images", label: "the image library" },
  note: { href: "/admin/customize", label: "the customize studio" },
  stat: { href: "/admin", label: "the dashboard" },
  settings: { href: "/admin/settings", label: "the settings screen" },
};

/** Where the console shows this record, and what the link should call it. */
function destinationFor(
  entity: AuditEntity,
  entityId: string | null,
): { href: string; label: string } | null {
  const own = OWN_PAGE[entity];
  if (own && entityId) return { href: `${own}/${entityId}`, label: `this ${ENTITY_NOUN[entity]}` };
  return ENTITY_SCREEN[entity] ?? null;
}

/**
 * What the entry acted on, for a reader who needs to tell one row from the
 * next.
 *
 * Every kind gets a name here, not only the three with a page. Three role
 * changes on three different people carry three different ids and read
 * identically without one.
 */
export interface EntityTarget {
  /** "Listing", "Team member". Always present. */
  label: string;
  /** The record's own name where the entry carries one, else its id, else null. */
  name: string | null;
  href: string | null;
  /** "Open the team screen". Empty when there is nowhere to send the reader. */
  linkText: string;
}

/** The keys a stored document puts its own name under, best first. */
const NAME_KEYS = ["displayName", "title", "name", "email", "slug"];

/** The name the before-image goes by, so a row names a person rather than an id. */
function recordName(before: Record<string, unknown> | null): string | null {
  const flat = beforePayload(before);
  if (!flat) return null;
  for (const key of NAME_KEYS) {
    const value = flat[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export function entityTarget(entry: {
  entity: AuditEntity;
  entityId: string | null;
  before: Record<string, unknown> | null;
}): EntityTarget {
  const noun = ENTITY_NOUN[entry.entity];
  const destination = destinationFor(entry.entity, entry.entityId);
  return {
    label: noun.charAt(0).toUpperCase() + noun.slice(1),
    name: recordName(entry.before) ?? entry.entityId,
    href: destination?.href ?? null,
    linkText: destination ? `Open ${destination.label}` : "",
  };
}

/* ───────────────────────────────── diffing ──────────────────────────────── */

export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
}

/**
 * The listings and posts editors both send `{ patch: {...}, baseRevision }`.
 * `before` is the flat stored document, so comparing it against the envelope
 * itself would report every field as changed, including the ones nobody
 * touched. Unwrapped here rather than in the writer: see the design's "no
 * diffing in the writer" rule, which leaves this exactly the kind of read-time
 * adjustment that must not require a migration.
 */
function afterPayload(requested: Record<string, unknown> | null): Record<string, unknown> | null {
  if (requested && typeof requested === "object") {
    const patch = requested.patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      return patch as Record<string, unknown>;
    }
  }
  return requested;
}

/**
 * The mirror of `afterPayload` on the other side.
 *
 * `auditBefore` on the team routes hands over what `findUserById` returns,
 * `{ user, disabledAt }`, so a role change stores the old role at
 * `before.user.role` while the patch that changed it is a flat `{ role }`.
 * Lifting the nested user to the top is what lets the two line up; without it
 * the one row that answers "who made them an owner" reads "Not set".
 */
function beforePayload(before: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!before) return null;
  const user = before.user;
  if (user && typeof user === "object" && !Array.isArray(user)) {
    const { user: nested, ...rest } = before;
    return { ...(nested as Record<string, unknown>), ...rest };
  }
  return before;
}

/** `trim`'s last resort replaces the whole payload, so it is a note, not a row. */
function isTruncated(payload: Record<string, unknown> | null): boolean {
  return payload !== null && payload._truncated === true && Object.keys(payload).length === 1;
}

/**
 * The keys of `after`, looked up in `before`. NEVER the union of the two.
 *
 * `after` is a PATCH and `before` is the whole stored document, so a union
 * reports every field the patch did not mention as changed to nothing: a price
 * edit rendered thirty-one rows of which twenty-seven were invented, including
 * "Status: draft to Not set" and the agent's own email address. A field the
 * patch did not send was not changed and does not belong on this screen.
 *
 * A field submitted with the value it already held is dropped too. The editors
 * send the whole patch on every save, so most keys in a save are resubmitted
 * unchanged, and listing them buries the one that moved. A save where every
 * field matched is reported as such by the caller rather than as an empty
 * table, so "nothing changed" and "nothing recorded" never look alike.
 */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const key of Object.keys(after).sort()) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    rows.push({ key, before: before[key], after: after[key] });
  }
  return rows;
}

function listRows(payload: Record<string, unknown>): DiffRow[] {
  return Object.keys(payload)
    .sort()
    .map((key) => ({ key, before: undefined, after: payload[key] }));
}

/**
 * What an expanded row shows, and which of six honest things it is saying.
 *
 * `changed`    a before-image and a patch: Field, Before, After.
 * `unchanged`  fields were submitted and every one already held that value.
 * `submitted`  no before-image, so the values are shown without claiming a
 *              prior one. A create is the ordinary case.
 * `snapshot`   a trash, which submits nothing and removes something: the
 *              record as it stood is the answer to "what did I just lose".
 * `truncated`  the payload was past the writer's byte cap. Changes were made
 *              and the values are gone, which is not the same as none.
 * `none`       nothing was submitted and nothing is worth showing.
 */
export type FieldTableMode =
  | "changed"
  | "unchanged"
  | "submitted"
  | "snapshot"
  | "truncated"
  | "none";

export interface FieldTable {
  mode: FieldTableMode;
  rows: DiffRow[];
}

/**
 * Gated on what the entry actually carries, not on its action.
 *
 * An earlier version asked `isFieldEdit(action)` and excluded every `op:*`,
 * which hid the submitted role on `PATCH /admin/users/:id/role`: the old and
 * new role were both in the row and neither reached the screen. The concern
 * that rule existed for was a lifecycle move diffing its full `before` against
 * an empty body, and `diffFields` walking only the submitted keys already
 * answers that: an empty body yields no rows whatever the action was.
 */
export function fieldTable(entry: {
  action: string;
  before: Record<string, unknown> | null;
  requested: Record<string, unknown> | null;
}): FieldTable {
  const after = afterPayload(entry.requested);
  if (isTruncated(after)) return { mode: "truncated", rows: [] };

  const before = isTruncated(entry.before) ? null : beforePayload(entry.before);

  if (after && Object.keys(after).length > 0) {
    if (!before) return { mode: "submitted", rows: listRows(after) };
    const rows = diffFields(before, after);
    return rows.length > 0 ? { mode: "changed", rows } : { mode: "unchanged", rows: [] };
  }

  if (entry.action === "delete" && before) return { mode: "snapshot", rows: listRows(before) };
  return { mode: "none", rows: [] };
}

/* ─────────────────────────────── rendering ──────────────────────────────── */

/**
 * Every literal `packages/audit/src/redact.ts` can write in place of a value.
 * Duplicated rather than imported: that package pulls in the Mongo driver, and
 * `@avhomes/contracts` is the only package the browser compiles.
 *
 * All six are here because all six reach this screen. Only `[redacted]` was
 * translated before, so a deep payload showed a reader the string `[deep]` and
 * left them to guess whether it was a value somebody typed.
 */
const MARKER_TEXT: Record<string, string> = {
  "[redacted]": "hidden",
  "[deep]": "nested too deeply to record",
  "[cycle]": "the same value again from higher up",
  "[budget]": "too large to record",
};

/** `[long: 20000 chars]` and `[list: 40 items]`, which carry a count. */
const LONG_STRING = /^\[long: (\d+) chars\]$/;
const LONG_LIST = /^\[list: (\d+) items\]$/;

function count(digits: string): string {
  return Number(digits).toLocaleString("en-GB");
}

/** Overrides for the keys whose humanised form reads worse than a chosen one. */
const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  priceMinor: "Price",
  amountMinor: "Amount",
  areaSqft: "Area (sqft)",
  parkingSpaces: "Parking",
  images: "Photos",
  displayName: "Name",
  disabledAt: "Disabled",
  publishedAt: "Published",
  deletedAt: "Deleted",
  baseRevision: "Revision",
};

/** A field's key, as a person reads it. */
export function fieldLabel(key: string): string {
  const override = FIELD_LABEL_OVERRIDES[key];
  if (override) return override;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Replaces every writer marker at any depth. See `MARKER_TEXT` above. */
function humaniseMarkers(value: unknown): unknown {
  if (typeof value === "string") {
    const named = MARKER_TEXT[value];
    if (named) return named;
    const long = LONG_STRING.exec(value);
    if (long) return `${count(long[1]!)} characters, too long to record`;
    const list = LONG_LIST.exec(value);
    if (list) return `${count(list[1]!)} items, too many to record`;
    return value;
  }
  if (Array.isArray(value)) return value.map(humaniseMarkers);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    // The whole-payload marker, met here when it sits inside a value rather
    // than at the top, where `fieldTable` catches it first.
    if (entries.length === 1 && entries[0]![0] === "_truncated" && entries[0]![1] === true) {
      return "too large to record";
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, humaniseMarkers(v)]));
  }
  return value;
}

/**
 * Epoch milliseconds, which is every timestamp this API stores. The naming
 * convention is the whole test: see the README's data conventions.
 */
function isTimestampKey(key: string): boolean {
  return key === "at" || key.endsWith("At");
}

/**
 * A stored value, as a person reads it. Never a raw writer marker, and never a
 * raw epoch for a field whose name says it is a time.
 *
 * `key` is optional because the same function renders a whole query object,
 * which has no field of its own.
 */
export function displayValue(raw: unknown, key?: string): string {
  const value = humaniseMarkers(raw);
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // A zero or a negative is not a time anybody recorded, so it stays a number
    // rather than becoming 1 Jan 1970.
    if (key !== undefined && isTimestampKey(key) && Number.isFinite(value) && value > 0) {
      return dateTime(value);
    }
    return String(value);
  }
  if (typeof value === "string") return value === "" ? "Empty" : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.every((item) => item === null || typeof item !== "object")
      ? value.map((item) => displayValue(item)).join(", ")
      : JSON.stringify(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
