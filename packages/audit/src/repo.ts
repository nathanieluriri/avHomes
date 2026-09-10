import type { Filter } from "mongodb";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  assertCursorSort,
  keysetFilter,
  keysetSort,
  takePage,
  type SortSpec,
} from "@avhomes/core";
import type { AuditEntity, AuditEntry, Page, Role } from "@avhomes/contracts";

/**
 * The stored shape, beside the repository that reads it, the way `PropertyDoc`
 * sits beside `Property`.
 *
 * Almost the wire shape: `_id` versus `id`, and nothing else. An audit entry is
 * a fact about something that already happened, so there is no derived column
 * to hide and no revision to carry.
 */
export interface AuditEntryDoc {
  _id: string;
  at: number;
  /** SNAPSHOT of the actor, not a join. Renaming a user must not rewrite who
   *  did a thing last year. */
  actorId: string;
  actorName: string;
  actorRole: Role;
  entity: AuditEntity;
  entityId: string | null;
  action: string;
  requested: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  method: string;
  path: string;
  query: Record<string, string> | null;
  status: number;
  requestId: string;
  /** Read by nothing but the `audit_ttl` index. See migration 0008. */
  expiresAtDate: Date;
}

/**
 * 730 days. Leap years are ignored because nobody measures a retention ceiling
 * to the day, and a real calendar step would make the same row expire at two
 * different times depending on when it was written.
 */
export const AUDIT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;

function audit(db: Db) {
  return collection<AuditEntryDoc>(db, COLLECTIONS.audit);
}

/**
 * `?? null` on the four fields migration 0008 leaves out of `required`.
 *
 * The wire type declares all four present, so a row written without one would
 * otherwise read back as `undefined` where the contract promises `null`. The
 * writer below always spells them out; this is the half that stays correct for
 * a row something else wrote.
 *
 * `expiresAtDate` stays on the doc and stops here. It exists solely so
 * `audit_ttl` can sweep the row and `c.json` would serialise a `Date` to a
 * string, which is not what the wire type promises, so the UI never sees it.
 */
export function toAuditEntry(doc: AuditEntryDoc): AuditEntry {
  return {
    id: doc._id,
    at: doc.at,
    actorId: doc.actorId,
    actorName: doc.actorName,
    actorRole: doc.actorRole,
    entity: doc.entity,
    entityId: doc.entityId ?? null,
    action: doc.action,
    requested: doc.requested ?? null,
    before: doc.before ?? null,
    method: doc.method,
    path: doc.path,
    query: doc.query ?? null,
    status: doc.status,
    requestId: doc.requestId,
  };
}

/**
 * ONE sort, `at` descending, matching the `audit_recent` and `audit_entity`
 * indexes. There is no sort dropdown on this screen and there must not be one:
 * a second sort is a second cursor shape, and spending a cursor under the wrong
 * one returns a wrong page in MongoDB rather than an error.
 */
export const AUDIT_SORT: SortSpec = { field: "at", direction: -1 };
export const AUDIT_SORT_NAME = "recent";

export interface AuditQuery {
  entity?: AuditEntity | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  /** Epoch ms, inclusive. */
  from?: number | undefined;
  /** Epoch ms, inclusive. */
  to?: number | undefined;
  limit: number;
  cursor?: string | undefined;
}

/** The only writer. Nothing writes an entry over HTTP. */
export async function insertEntry(db: Db, doc: AuditEntryDoc): Promise<void> {
  await audit(db).insertOne(doc);
}

export async function listEntries(db: Db, query: AuditQuery): Promise<Page<AuditEntry>> {
  const and: Filter<AuditEntryDoc>[] = [];
  if (query.entity) and.push({ entity: query.entity });
  if (query.entityId) and.push({ entityId: query.entityId });
  if (query.actorId) and.push({ actorId: query.actorId });

  if (query.from !== undefined || query.to !== undefined) {
    const range: Record<string, number> = {};
    if (query.from !== undefined) range.$gte = query.from;
    if (query.to !== undefined) range.$lte = query.to;
    and.push({ at: range } as Filter<AuditEntryDoc>);
  }

  const keyset = keysetFilter<AuditEntryDoc>(AUDIT_SORT, query.cursor, AUDIT_SORT_NAME);
  if (Object.keys(keyset).length > 0) and.push(keyset);

  const docs = await audit(db)
    .find(and.length === 0 ? {} : { $and: and }, {
      sort: keysetSort(AUDIT_SORT),
      // One extra, to answer "is there another page" without a count.
      limit: query.limit + 1,
    })
    .toArray();

  const { items, nextCursor } = takePage(docs, query.limit, AUDIT_SORT, AUDIT_SORT_NAME);
  return { items: items.map(toAuditEntry), nextCursor };
}

/** One line of history, for a reader who is not allowed the whole entry. */
export interface HistoryLine {
  at: number;
  actorName: string;
  action: string;
}

/**
 * The property editor's panel, and deliberately not a projection of the reader
 * above.
 *
 * Three fields, resolved by the `audit_entity` index. It is served on a
 * `/admin/properties/` path, which the domain gate resolves to `listings`, so
 * every agent can read it. Widening it to whole entries would hand them the
 * buyer data in `before`.
 */
export async function listEntityHistory(
  db: Db,
  entity: AuditEntity,
  entityId: string,
  limit: number,
): Promise<HistoryLine[]> {
  const docs = await audit(db)
    .find(
      { entity, entityId },
      {
        sort: keysetSort(AUDIT_SORT),
        limit,
        // The projection is the guarantee, not the mapper below it. A field
        // added to the document later cannot reach this response by accident.
        projection: { at: 1, actorName: 1, action: 1 },
      },
    )
    .toArray();

  return docs.map((doc) => ({ at: doc.at, actorName: doc.actorName, action: doc.action }));
}

/** Re-exported so a route can refuse a mismatched cursor before any db work. */
export function assertAuditCursor(cursor: string | undefined): void {
  assertCursorSort(cursor, AUDIT_SORT_NAME);
}
