import type { Context, MiddlewareHandler } from "hono";
import type { AuditEntity, AuthUser } from "@avhomes/contracts";
import {
  currentDb,
  logLine,
  newId,
  requestId,
  type AppEnv,
  type AuditHandle,
} from "@avhomes/core";
import { NO_CAPTURE_PREFIXES, redact, trim } from "./redact";
import { AUDIT_RETENTION_MS, insertEntry, type AuditEntryDoc } from "./repo";

/**
 * One middleware at the composition root, not forty calls in forty routes.
 *
 * Instrumenting forty mutating routes one at a time produces a system that is
 * correct on the day it ships and wrong on the day somebody adds route
 * forty-one. Mounted below `sessionMiddleware` and `rolePermissions`, this sees
 * every authenticated, authorised, mutating request that reaches any admin
 * router, including routers that do not exist yet.
 *
 * Below the domain gate on purpose: a request the gate refused never happened
 * as far as the data is concerned, and recording correctly rejected attempts
 * would fill the log with noise that looks like activity.
 *
 * TODO(test): `before` is null when a route never calls `setBefore`, and carries
 *   the document when it does.
 * TODO(test): a multipart upload stores `requested: null` rather than image
 *   bytes.
 * TODO(test): an insert that throws is logged at error level with the request's
 *   own requestId, and the response is unchanged and still 2xx.
 * TODO(test): the same holds for a throw while BUILDING the document, not only
 *   while inserting it. Drive `setBefore` an object with a throwing getter: the
 *   route's 2xx survives. This is the case the narrow `try` turned into a 500.
 * TODO(test): `expiresAtDate` lands two years ahead of `at` and is a real Date,
 *   so `audit_ttl` can sweep it.
 * TODO(test): the four fields the validator does not require are written
 *   explicitly as null, so a read never produces `undefined` where the wire
 *   type promises `null`.
 */

/* ─────────────────────────── derivation ───────────────────────────────── */

const ENTITY_BY_SEGMENT: Record<string, AuditEntity> = {
  properties: "property",
  posts: "post",
  // The revision is the row being restored; the POST is what actually changed.
  revisions: "post",
  categories: "category",
  images: "image",
  enquiries: "enquiry",
  users: "user",
  invites: "invite",
  testimonials: "testimonial",
  stats: "stat",
  notes: "note",
  settings: "settings",
};

/**
 * The literal id that means "there is not one yet".
 *
 * `PUT /admin/testimonials/new`, `/stats/new` and `/categories/new` all resolve
 * `id === "new" ? null : id` and mint an id in the handler. Recording the
 * segment verbatim would file every create in the system under one colliding
 * id, and `audit_entity` would then answer nothing for any of them.
 */
const NEW_SENTINEL = "new";

interface Derived {
  entity: AuditEntity;
  entityId: string | null;
  action: string;
}

/**
 * `c.req.path` carries the `/api` prefix at runtime, so it reads
 * `/api/admin/properties/abc`. Strip it before splitting or every segment index
 * is off by one.
 */
function segmentsOf(path: string): string[] {
  const stripped = path.startsWith("/api/") ? path.slice("/api/".length) : path;
  return stripped.split("/").filter((segment) => segment !== "");
}

function actionForMethod(method: string): string {
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  if (method === "DELETE") return "delete";
  return `op:${method.toLowerCase()}`;
}

/**
 * The auth surface has no entity noun in its paths, so it gets its own table.
 *
 * A path under `/auth/` that is not on it is still the auth surface rather than
 * a mystery, so it keeps the `auth` entity and takes its action from the
 * method. `unknown` is for a route whose noun nothing recognises.
 */
function deriveAuth(segments: string[], method: string): Derived {
  const rest = segments.slice(1).join("/");
  if (rest === "logout") return { entity: "session", entityId: null, action: "op:logout" };
  if (segments[1] === "sessions") {
    return { entity: "session", entityId: segments[2] ?? null, action: "delete" };
  }
  if (rest === "me") return { entity: "user", entityId: null, action: "update" };
  if (rest === "clerk/exchange") return { entity: "auth", entityId: null, action: "op:login" };
  if (rest === "password/login") return { entity: "auth", entityId: null, action: "op:login" };
  if (rest === "password/claim") return { entity: "auth", entityId: null, action: "op:claim" };
  if (rest === "password/change") {
    return { entity: "auth", entityId: null, action: "op:password-change" };
  }
  return { entity: "auth", entityId: null, action: actionForMethod(method) };
}

function deriveAdmin(segments: string[], method: string): Derived {
  const entity = ENTITY_BY_SEGMENT[segments[1] ?? ""] ?? "unknown";
  const rest = segments.slice(2);

  // A singleton, such as settings. There is no id to record.
  if (rest.length === 0) return { entity, entityId: null, action: actionForMethod(method) };

  if (rest.length === 1) {
    const id = rest[0] ?? null;
    if (method === "PUT") {
      return id === NEW_SENTINEL
        ? { entity, entityId: null, action: "create" }
        : { entity, entityId: id, action: "update" };
    }
    return { entity, entityId: id, action: actionForMethod(method) };
  }

  /*
   * `[id, op]`, and `[a, b, op]` for `/admin/revisions/:postId/:revisionId/
   * restore`. The record being changed is the post, so the FIRST segment is the
   * id worth indexing and the LAST is the operation, whatever sits between.
   */
  return { entity, entityId: rest[0] ?? null, action: `op:${rest[rest.length - 1]}` };
}

/**
 * TODO(test): the derivation table, every row of it.
 *   `PATCH /admin/properties/abc` is `property` + `update`;
 *   `POST /admin/properties/abc/publish` is `property` + `op:publish`;
 *   `PUT /admin/testimonials/new` is `create` with a NULL entityId;
 *   `POST /admin/revisions/p1/r2/restore` is `post` + `op:restore` + `p1`;
 *   `PATCH /admin/settings` is `settings` + `update` + null.
 * TODO(test): the `/api` prefix is stripped. Drive it through the real app,
 *   where `c.req.path` carries it, not by calling `derive` with a tidy path:
 *   an off-by-one here files everything under `unknown` and nothing errors.
 */
export function derive(path: string, method: string): Derived {
  const segments = segmentsOf(path);
  if (segments[0] === "auth") return deriveAuth(segments, method);
  if (segments[0] === "admin") return deriveAdmin(segments, method);
  return { entity: "unknown", entityId: null, action: actionForMethod(method) };
}

/* ──────────────────────────── payloads ────────────────────────────────── */

/**
 * The body, or null, and null is an ordinary answer rather than a failure.
 *
 * The path exclusion is tested FIRST because it is the control: a prefix that is
 * never read cannot leak a field somebody adds to it next year. The content-type
 * test is second and stops `POST /admin/images` putting image bytes in a
 * database row.
 *
 * Read AFTER `next()`. Hono caches the parsed body, so the route has usually
 * parsed it already and this call is free; reading it first would risk
 * consuming the stream ahead of the route that needs it.
 */
async function readBody(c: Context<AppEnv>): Promise<unknown> {
  if (NO_CAPTURE_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))) return null;

  const header = c.req.header("content-type") ?? "";
  const base = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base !== "application/json" && !base.endsWith("+json")) return null;

  try {
    return await c.req.json();
  } catch {
    // A malformed body already produced its own 400 somewhere. There is nothing
    // here worth turning into a second failure.
    return null;
  }
}

/**
 * `requested` and `before` are declared as objects on the wire and validated as
 * `["object", "null"]` in migration 0008, so a body that is a bare array or a
 * bare string has to be wrapped rather than stored as it arrived. Storing it
 * raw would fail the validator, and a failed insert here is swallowed, which
 * would turn "this route posts an array" into "this route is silently
 * unaudited".
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { _value: value };
}

/** Both payload fields get the same treatment. `before` has the most to leak. */
function clean(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return asRecord(trim(redact(value)));
}

/**
 * The SAME `clean` the other two payload fields get, and the same markers.
 *
 * Query values are strings by construction, since `c.req.query()` returns them
 * that way, so every ordinary value survives the walk as a string. The one
 * exception is `trim`'s last resort, which replaces the whole object with
 * `{ _truncated: true }`. An earlier version ran that result through a
 * stringifying loop to keep the field typed `Record<string, string>`, which
 * stored the marker as the STRING `"true"` while `requested` and `before`
 * stored the boolean, so a reader could not test the three fields the same way.
 *
 * Checked against `NO_CAPTURE_PREFIXES` first, the same guard `readBody` opens
 * with: a `?code=` or `?ticket=` on a future auth route is the query-string
 * shape of the same problem the body exclusion exists for, and matching on the
 * path is the control, not the `token` entry in `REDACT_KEYS`.
 */
function cleanQuery(path: string, raw: Record<string, string>): Record<string, unknown> | null {
  if (NO_CAPTURE_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  if (Object.keys(raw).length === 0) return null;
  return clean(raw);
}

/* ─────────────────────────── the middleware ───────────────────────────── */

export function auditTrail(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();

    /*
     * Reads produce nothing. A log of who LOOKED at what is a different feature
     * with a different privacy answer, and it would outnumber the writes by two
     * orders of magnitude.
     */
    if (method === "GET" || method === "HEAD") return next();

    /*
     * A holder rather than three `let`s: the setters below run during `next()`,
     * and a property read after a call keeps its declared type where a captured
     * `let` can read as narrowed to its initialiser.
     */
    const captured: {
      before: Record<string, unknown> | null;
      actor: AuthUser | null;
      entityId: string | null;
    } = { before: null, actor: null, entityId: null };

    const handle: AuditHandle = {
      setBefore(doc) {
        captured.before = doc;
      },
      setActor(user) {
        captured.actor = user;
      },
      setEntityId(id) {
        captured.entityId = id;
      },
    };
    // Installed BEFORE `next()`, so a route can call the helpers while it runs.
    c.set("audit", handle);

    await next();

    /*
     * NO ACTOR, NO ENTRY, and this rule is load-bearing rather than tidy.
     * `rolePermissions` does not authenticate, so anonymous requests reach this
     * middleware too. `POST /auth/logout` carries no `requireAuth` and no rate
     * limiter: without this rule a stranger could loop it and write one
     * two-year row per request.
     *
     * Its status is not the thing stopping them, and an earlier version of this
     * comment claimed it was. That version was written while logout answered 500
     * on every production build, because `clearSessionCookie` deleted a
     * `__Host-` cookie without `secure` and Hono refuses that. The status check
     * below dropped the row, but for the wrong reason: a bug in logout standing
     * in for a control.
     *
     * That bug is fixed (f11aa1c), so the route now answers 200 everywhere and
     * THIS RULE IS THE ONLY THING LEFT. The fix removed the accident that was
     * covering it, which makes the rule more load-bearing than when it was
     * written, not less.
     *
     * `setActor` is the other half. `sessionMiddleware` resolves the cookie
     * before the auth routes run, so somebody in the act of signing in is still
     * anonymous when this line is reached, and the door names them instead.
     */
    const actor = c.get("user") ?? captured.actor;
    if (!actor) return;

    /*
     * A 400 changed nothing and a 403 was already refused by the gate above.
     * Hono's compose turns a thrown error into a response before this
     * middleware resumes, so a failure arrives here as a status rather than as
     * an exception.
     */
    const status = c.res.status;
    if (status < 200 || status > 299) return;

    const path = c.req.path;

    /*
     * THE WHOLE BLOCK, not just the insert, and the boundary is the point.
     *
     * Awaited because this deployment can suspend a function once it has
     * answered, so deferring the insert past the response would turn
     * "occasionally misses a row" into systematic loss. The cost is one
     * database round trip on each mutating request.
     *
     * Swallowed because an audit system that can turn a successful save into a
     * 500 is worse than one that occasionally misses a row: the first loses the
     * user's work, the second loses a record of work that succeeded.
     *
     * An earlier version opened the `try` at the insert, which honoured that
     * rule for exactly one of the things it does. Everything that BUILDS the
     * document sat outside: `derive`, `readBody`, and the `clean` calls that run
     * `redact` and `trim` over whatever a route handed `setBefore`. A body with
     * a throwing getter, or any future bug in the walk, discarded a 2xx the
     * route had already produced and answered 500 with no row written. The
     * response was already decided before this line; nothing done on behalf of
     * auditing may change it now.
     *
     * Logged at ERROR beside the same requestId, because a persistently broken
     * writer degrades to an empty log, and an empty log looks exactly like a
     * quiet week.
     */
    try {
      const derived = derive(path, method);
      const now = Date.now();

      const doc: AuditEntryDoc = {
        _id: newId("aud", now),
        at: now,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: actor.role,
        entity: derived.entity,
        // A route that minted an id wins over the path, which carried "new".
        entityId: captured.entityId ?? derived.entityId,
        action: derived.action,
        /*
         * All four spelled out, `null` included. The validator does not require
         * them but the wire type declares them always present, so a row written
         * without one reads back as `undefined` where the contract promised
         * null.
         */
        requested: clean(await readBody(c)),
        before: clean(captured.before),
        method,
        path,
        query: cleanQuery(path, c.req.query()),
        status,
        requestId: requestId(c),
        expiresAtDate: new Date(now + AUDIT_RETENTION_MS),
      };

      await insertEntry(await currentDb(c), doc);
    } catch (error) {
      /*
       * The report gets its own guard for the reason the block above exists: an
       * error whose own `message` getter throws, or a `cause` that will not
       * render, must not become the request's 500 either.
       */
      try {
        console.error(
          "[audit]",
          JSON.stringify(logLine(error, { requestId: requestId(c), method, path })),
        );
      } catch {
        console.error("[audit] entry lost, and the error would not render", method, path);
      }
    }
  };
}
