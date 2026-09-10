/**
 * @avhomes/audit
 *
 * Who did what, when, and what it looked like first.
 *
 * Three pieces and one direction: a middleware that records every authenticated
 * mutating request that reaches an admin router, a repository over the `audit`
 * collection, and two read routes. Nothing writes an entry over HTTP.
 *
 * It imports `contracts`, `core` and `db` and no other feature package, and no
 * feature package imports it. The middleware is injected at the composition
 * root, which is the only place allowed to know both halves of a seam.
 */

export { auditTrail, derive } from "./middleware";
export { auditRoutes } from "./routes";

export {
  AUDIT_RETENTION_MS,
  AUDIT_SORT,
  AUDIT_SORT_NAME,
  assertAuditCursor,
  insertEntry,
  listEntityHistory,
  listEntries,
  toAuditEntry,
  type AuditEntryDoc,
  type AuditQuery,
  type HistoryLine,
} from "./repo";

export {
  DEEP,
  MAX_ARRAY,
  MAX_BYTES,
  MAX_STRING,
  NO_BODY_PREFIXES,
  REDACTED,
  REDACT_KEYS,
  redact,
  trim,
} from "./redact";
