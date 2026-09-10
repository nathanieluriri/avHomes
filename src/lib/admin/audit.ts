import type { AuditEntity } from "@avhomes/contracts";

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

/** A link to the record itself, where the console has a page for one. */
export function entityHref(entity: AuditEntity, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entity === "property") return `/admin/properties/${entityId}`;
  if (entity === "post") return `/admin/posts/${entityId}`;
  if (entity === "enquiry") return `/admin/enquiries/${entityId}`;
  return null;
}

export function entityNoun(entity: AuditEntity): string {
  return ENTITY_NOUN[entity];
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
export function afterPayload(requested: Record<string, unknown> | null): Record<string, unknown> | null {
  if (requested && typeof requested === "object") {
    const patch = requested.patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      return patch as Record<string, unknown>;
    }
  }
  return requested;
}

/**
 * Only a genuine field-level edit is worth diffing. A lifecycle move such as
 * `op:publish` carries the record's full `before` but an empty `requested`,
 * because nothing about the record was submitted: a status flag flipped on
 * the server. Diffing those two would report every field as cleared, which is
 * not what happened.
 */
export function isFieldEdit(action: string): boolean {
  return action === "create" || action === "update" || action === "delete";
}

export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffRow[] {
  if (!before && !after) return [];
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const rows: DiffRow[] = [];
  for (const key of keys) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) rows.push({ key, before: b[key], after: a[key] });
  }
  return rows;
}

/* ─────────────────────────────── rendering ──────────────────────────────── */

/**
 * The literal string `packages/audit/src/redact.ts` writes for a secret
 * field. Duplicated rather than imported: that package pulls in the Mongo
 * driver, and `@avhomes/contracts` is the only package the browser compiles.
 */
const REDACTED_MARKER = "[redacted]";

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

/** Replaces the redaction marker at any depth. See `REDACTED_MARKER` above. */
function hideRedactedMarkers(value: unknown): unknown {
  if (value === REDACTED_MARKER) return "hidden";
  if (Array.isArray(value)) return value.map(hideRedactedMarkers);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hideRedactedMarkers(v)]));
  }
  return value;
}

/** A stored value, as a person reads it. Never the raw `[redacted]` marker. */
export function displayValue(raw: unknown): string {
  const value = hideRedactedMarkers(raw);
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
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
