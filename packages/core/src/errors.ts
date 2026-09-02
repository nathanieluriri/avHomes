import { InvalidDocumentError } from "@avhomes/contracts";

/**
 * THE error table. One implementation, every route answers through it.
 *
 * Two rules decide every row:
 *
 * (a) A 5xx is TRANSIENT by the client's retry policy. So every input that can
 *     never be accepted must be a 4xx, or a client spends thirty seconds
 *     re-asking a question with one permanent answer. Anything that falls
 *     through to 500 is a bug in this table, not in the caller.
 *
 * (b) Nothing outside the table is described to the caller in production. The
 *     detail goes to the log beside the same requestId. When AVHOMES_DEBUG_ERRORS
 *     is on (or NODE_ENV is not production) the response also carries a `debug`
 *     block, because a preview deployment nobody can read the logs of is worse
 *     than a leaked stack trace nobody can reach.
 */

export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "gone"
  | "bad_request"
  | "invalid_document"
  | "stale_write"
  | "precondition_failed"
  | "duplicate"
  | "rate_limited"
  | "not_implemented"
  | "upstream_failed"
  | "internal";

/** Base class so a handler can `catch (e) { if (e instanceof ApiError) ... }`. */
export abstract class ApiError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  /** Extra fields merged into the response body. Must never carry a secret. */
  body(): Record<string, unknown> {
    return {};
  }
}

export class UnauthenticatedError extends ApiError {
  override readonly name = "UnauthenticatedError";
  readonly status = 401;
  readonly code = "unauthenticated" as const;
  constructor(detail = "no session") {
    super(`unauthenticated: ${detail}`);
  }
}

export class ForbiddenError extends ApiError {
  override readonly name = "ForbiddenError";
  readonly status = 403;
  readonly code = "forbidden" as const;
  /** Only set when the refusal turns on the caller's own state, never on ours. */
  readonly reason: string | undefined;
  constructor(reason?: string) {
    super(`forbidden${reason ? `: ${reason}` : ""}`);
    this.reason = reason;
  }
  override body() {
    return this.reason ? { reason: this.reason } : {};
  }
}

export class NotFoundError extends ApiError {
  override readonly name = "NotFoundError";
  readonly status = 404;
  readonly code = "gone" as const;
  /** For the log only. The 404 body is `{ error: 'gone' }` and nothing else. */
  readonly what: string;
  constructor(what: string) {
    super(`gone: ${what}`);
    this.what = what;
  }
}

export class BadRequestError extends ApiError {
  override readonly name = "BadRequestError";
  readonly status = 400;
  readonly code = "bad_request" as const;
  /** Names the field or parameter at fault, never its value. */
  readonly detail: string;
  /** Per-field issues from a schema failure: paths only, never the input. */
  readonly issues: readonly { path: string; message: string }[] | undefined;
  constructor(detail: string, issues?: readonly { path: string; message: string }[]) {
    super(`bad_request: ${detail}`);
    this.detail = detail;
    this.issues = issues;
  }
  override body() {
    return this.issues?.length ? { detail: this.detail, issues: this.issues } : { detail: this.detail };
  }
}

/**
 * A CAS write lost its race.
 *
 * Carries the FULL current entity from a single re-read, so a client offering
 * "load theirs" needs no second request.
 */
export class StaleWriteError<T> extends ApiError {
  override readonly name = "StaleWriteError";
  readonly status = 409;
  readonly code = "stale_write" as const;
  constructor(
    readonly entityName: string,
    readonly expected: number,
    readonly actual: number,
    readonly entity: T,
  ) {
    super(`stale_write: ${entityName} expected revision ${expected}, found ${actual}`);
  }
  override body() {
    return {
      entity: this.entityName,
      expected: this.expected,
      actual: this.actual,
      [this.entityName]: this.entity,
    };
  }
}

/**
 * A lifecycle or policy refusal with no race behind it.
 *
 * `operation` is a NAMED CODE, not prose. A screen has to say "you cannot
 * disable yourself" or "twelve listings still use this", and a client telling
 * them apart by parsing a sentence gets it wrong the first time the sentence
 * changes.
 */
export class PreconditionFailedError extends ApiError {
  override readonly name = "PreconditionFailedError";
  readonly status = 409;
  readonly code = "precondition_failed" as const;
  constructor(
    readonly operation: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(`precondition_failed: ${operation}`);
  }
  override body() {
    return { operation: this.operation, ...this.extra };
  }
}

/** A conflict with existing state, which is a different answer from a malformed field. */
export class DuplicateError extends ApiError {
  override readonly name = "DuplicateError";
  readonly status = 409;
  readonly code = "duplicate" as const;
  constructor(
    readonly field: string,
    readonly value?: string,
  ) {
    super(`duplicate: ${field}`);
  }
  override body() {
    return this.value === undefined ? { field: this.field } : { field: this.field, value: this.value };
  }
}

export class RateLimitedError extends ApiError {
  override readonly name = "RateLimitedError";
  readonly status = 429;
  readonly code = "rate_limited" as const;
  constructor(readonly retryAfterSeconds: number) {
    super(`rate_limited: retry after ${retryAfterSeconds}s`);
  }
  override body() {
    return { retryAfter: this.retryAfterSeconds };
  }
}

/**
 * A capability the deployment has not configured.
 *
 * `hint` names the environment variable to set. This is the difference between
 * an operator fixing a deployment in a minute and reading source for an hour.
 */
export class NotImplementedError extends ApiError {
  override readonly name = "NotImplementedError";
  readonly status = 501;
  readonly code = "not_implemented" as const;
  constructor(
    readonly feature: string,
    readonly hint: string,
  ) {
    super(`not_implemented: ${feature} (${hint})`);
  }
  override body() {
    return { feature: this.feature, hint: this.hint };
  }
}

/** A dependency we do not own answered badly. Distinct from our own 500. */
export class UpstreamError extends ApiError {
  override readonly name = "UpstreamError";
  readonly status = 502;
  readonly code = "upstream_failed" as const;
  constructor(
    readonly service: string,
    readonly detail: string,
  ) {
    super(`upstream_failed: ${service}: ${detail}`);
  }
  override body() {
    return { service: this.service };
  }
}

/* ─────────────────────── driver error translation ──────────────────────── */

interface MongoLikeError {
  name?: string;
  code?: number | string;
  codeName?: string;
  message?: string;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  errInfo?: Record<string, unknown>;
}

/**
 * Turns the MongoDB driver's own errors into rows of the table above.
 *
 * Without this, a duplicate slug is a 500 the client retries five times, and a
 * schema-validator rejection is a 500 whose actual cause ("status was not in the
 * enum") is only visible in a log nobody is reading. Both are permanent answers
 * and both must be 4xx.
 */
function fromDriver(err: MongoLikeError): ApiError | null {
  const code = typeof err.code === "string" ? Number(err.code) : err.code;

  // 11000/11001: duplicate key. keyPattern names the index that refused.
  if (code === 11000 || code === 11001) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "unique field";
    const raw = err.keyValue?.[field];
    return new DuplicateError(field, typeof raw === "string" ? raw : undefined);
  }

  // 121: document failed the collection's $jsonSchema validator. errInfo carries
  // the failing rule, which is the whole diagnostic value of this branch.
  if (code === 121) {
    return new BadRequestError("document", describeValidationFailure(err.errInfo));
  }

  // 50: operation exceeded its time limit. Genuinely transient, so 502 rather
  // than a 4xx, and named so the log says which side gave up.
  if (code === 50 || err.codeName === "MaxTimeMSExpired") {
    return new UpstreamError("mongodb", "operation exceeded its time limit");
  }

  if (err.name === "MongoServerSelectionError" || err.name === "MongoNetworkError") {
    return new UpstreamError("mongodb", err.message ?? "could not reach the database");
  }
  return null;
}

/** Flattens Mongo's nested schema-validation report into readable paths. */
function describeValidationFailure(
  errInfo: Record<string, unknown> | undefined,
): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, path);
      return;
    }
    const rec = node as Record<string, unknown>;
    const field = typeof rec.propertyName === "string" ? rec.propertyName : null;
    const next = field ? (path ? `${path}.${field}` : field) : path;
    if (typeof rec.operatorName === "string") {
      const specified = rec.specifiedAs === undefined ? "" : ` (${JSON.stringify(rec.specifiedAs)})`;
      issues.push({ path: next || "<document>", message: `failed ${rec.operatorName}${specified}` });
    }
    for (const value of Object.values(rec)) walk(value, next);
  };

  walk(errInfo?.details ?? errInfo, "");
  return issues.length > 0 ? issues : [{ path: "<document>", message: "failed schema validation" }];
}

/* ────────────────────────────── rendering ──────────────────────────────── */

export interface ErrorContext {
  requestId: string;
  method?: string;
  path?: string;
}

/** Whether a response may carry the `debug` block. */
export function debugErrorsEnabled(): boolean {
  if (process.env.AVHOMES_DEBUG_ERRORS === "1") return true;
  if (process.env.AVHOMES_DEBUG_ERRORS === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * The log line is NAMED FIELDS, never the error object.
 *
 * A driver error carries the failing query and its parameters inside its own
 * message and stack, and one of those parameters is a password hash.
 */
export function logLine(err: unknown, ctx: ErrorContext): Record<string, unknown> {
  const e = err instanceof Error ? err : null;
  return {
    requestId: ctx.requestId,
    method: ctx.method ?? "",
    path: ctx.path ?? "",
    name: e?.name ?? typeof err,
    message: e?.message ?? String(err),
    stack: e?.stack ?? "",
    cause: e?.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : undefined,
  };
}

function toApiError(err: unknown): ApiError | null {
  if (err instanceof ApiError) return err;
  if (err instanceof InvalidDocumentError) return new InvalidDocumentApiError(err);
  if (typeof err === "object" && err !== null) return fromDriver(err as MongoLikeError);
  return null;
}

/** 422, carrying the path and reason validateDoc reported. */
export class InvalidDocumentApiError extends ApiError {
  override readonly name = "InvalidDocumentApiError";
  readonly status = 422;
  readonly code = "invalid_document" as const;
  constructor(readonly source: InvalidDocumentError) {
    super(source.message);
  }
  override body() {
    return { path: this.source.path, reason: this.source.reason };
  }
}

export function toResponse(err: unknown, ctx: ErrorContext): Response {
  const mapped = toApiError(err);

  // Only an unmapped error is an incident. A 404 or a 409 is the table working.
  if (!mapped) console.error("[api]", JSON.stringify(logLine(err, ctx)));

  const status = mapped?.status ?? 500;
  const code: ErrorCode = mapped?.code ?? "internal";
  const extra = mapped?.body() ?? {};

  const body: Record<string, unknown> = { error: code, requestId: ctx.requestId, ...extra };

  if (debugErrorsEnabled()) {
    const e = err instanceof Error ? err : null;
    body.debug = {
      name: e?.name ?? typeof err,
      message: e?.message ?? String(err),
      // A route and method make a log line searchable without the id.
      at: `${ctx.method ?? ""} ${ctx.path ?? ""}`.trim(),
      stack: e?.stack?.split("\n").slice(0, 12) ?? [],
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=UTF-8",
    "x-request-id": ctx.requestId,
    // An error is never a shared-cache candidate, whatever the router it came from.
    "cache-control": "no-store",
  };
  if (mapped instanceof RateLimitedError) {
    headers["retry-after"] = String(mapped.retryAfterSeconds);
  }

  return new Response(JSON.stringify(body), { status, headers });
}
