import type { Filter, Document, Sort } from "mongodb";
import { BadRequestError } from "./errors";

/**
 * Keyset pagination. Never skip/offset.
 *
 * `skip: 24` re-counts the preceding set on a collection being written to while
 * the reader scrolls. A document inserted above the window pushes one row past
 * the boundary and it is never seen; a delete pulls one up and it is seen twice.
 * Neither shows up as an error.
 */

export const DEFAULT_PAGE_LIMIT = 24;
export const MAX_PAGE_LIMIT = 100;

export type SortDirection = 1 | -1;

export interface SortSpec {
  /** The document field the sort orders on, beside `_id` as the tiebreaker. */
  readonly field: string;
  readonly direction: SortDirection;
}

export type CursorValue = string | number | null;

interface DecodedCursor {
  sort: string;
  value: CursorValue;
  id: string;
}

/**
 * The cursor carries the SORT KEY that minted it, and that is the whole point.
 *
 * Spending a cursor from one sort under another is not a hypothetical. In the
 * Postgres original it raised a type error and became a 500. In MongoDB it does
 * something worse: BSON has a total ordering across types, so comparing a string
 * against a number returns a WRONG PAGE with no error at all. Rejecting the
 * mismatch here is the only thing standing between a sort-dropdown change and
 * silently skipped rows.
 */
export function encodeCursor(sort: string, value: CursorValue, id: string): string {
  const json = JSON.stringify([sort, value, id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Returns null, never throws.
 *
 * A cursor arrives from a query string, so malformed is ordinary rather than
 * exceptional. It is NOT a security boundary: it names a document the caller
 * could already see, and every query consuming one is still scoped by the
 * caller's own filters. Which is exactly why every field is re-validated.
 */
export function decodeCursor(raw: string | undefined): DecodedCursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [sort, value, id] = parsed as [unknown, unknown, unknown];
  if (typeof sort !== "string" || typeof id !== "string") return null;
  if (value !== null && typeof value !== "string" && typeof value !== "number") return null;
  return { sort, value, id };
}

/**
 * Refuses a cursor minted under a different sort, BEFORE any database work.
 *
 * Callable from a route so the refusal costs no round trip: a request that can
 * never be answered must not build a database client to find that out. The same
 * check runs inside `keysetFilter`, which is the one that actually guards the
 * query; this is the early, free copy.
 */
export function assertCursorSort(cursor: string | undefined, sortName: string): void {
  const decoded = decodeCursor(cursor);
  if (decoded && decoded.sort !== sortName) {
    throw new BadRequestError("cursor", [
      { path: "cursor", message: `minted under sort "${decoded.sort}", spent under "${sortName}"` },
    ]);
  }
}

/**
 * The keyset predicate for one page.
 *
 * `$or` of "strictly past the sort value" and "equal to it, past the id", which
 * is what makes the page boundary exact when many documents share a value.
 */
export function keysetFilter<T extends Document>(
  spec: SortSpec,
  cursor: string | undefined,
  sortName: string,
): Filter<T> {
  const decoded = decodeCursor(cursor);
  if (!decoded) return {} as Filter<T>;
  if (decoded.sort !== sortName) {
    throw new BadRequestError("cursor", [
      { path: "cursor", message: `minted under sort "${decoded.sort}", spent under "${sortName}"` },
    ]);
  }
  const op = spec.direction === -1 ? "$lt" : "$gt";
  return {
    $or: [
      { [spec.field]: { [op]: decoded.value } },
      { [spec.field]: decoded.value, _id: { [op]: decoded.id } },
    ],
  } as Filter<T>;
}

/** The sort document, always ending in `_id` so the order is total. */
export function keysetSort(spec: SortSpec): Sort {
  return { [spec.field]: spec.direction, _id: spec.direction };
}

/**
 * Slices one extra document off the end to answer "is there another page"
 * without a second query or a count.
 */
export function takePage<T extends { _id: string }>(
  rows: T[],
  limit: number,
  spec: SortSpec,
  sortName: string,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  if (!hasMore || !last) return { items, nextCursor: null };

  const raw = (last as unknown as Record<string, unknown>)[spec.field];
  const value: CursorValue =
    typeof raw === "string" || typeof raw === "number" ? raw : raw === undefined ? null : null;
  return { items, nextCursor: encodeCursor(sortName, value, last._id) };
}

export function clampLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PAGE_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_LIMIT) {
    throw new BadRequestError("limit", [
      { path: "limit", message: `expected an integer 1..${MAX_PAGE_LIMIT}` },
    ]);
  }
  return value;
}
