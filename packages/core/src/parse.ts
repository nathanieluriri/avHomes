import { z } from "zod";
import type { Context } from "hono";
import { BadRequestError } from "./errors";

/**
 * Request parsing. Five helpers, used by every route.
 *
 * The rule they exist to enforce: an input that can never be accepted is a 400,
 * not a 500. A 5xx is transient by the client's retry policy, so a permanent
 * refusal dressed as one costs thirty seconds and answers the same thing.
 */

const NUL = String.fromCharCode(0);

/**
 * Built from an escape string rather than written as a regex literal, so the
 * source stays plain ASCII and survives every editor and diff tool.
 *
 * Tab (09), newline (0A) and carriage return (0D) are deliberately OUTSIDE the
 * range, so a multi-line textarea still passes.
 */
const CONTROL_CLASS = "\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F";
const CONTROL = new RegExp(`[${CONTROL_CLASS}]`, "u");
const NO_CONTROL = new RegExp(`^[^${CONTROL_CLASS}]*$`, "u");

/**
 * `str()`, never a bare `z.string()`.
 *
 * In the Postgres original this guards SQLSTATE 22021, which BSON does not have.
 * It stays because control characters still poison text indexes and log output,
 * and because having one spelling for "a caller-supplied string" is what lets a
 * later reader grep for the routes that got it wrong.
 *
 * `.regex()` and not `.refine()` deliberately: a regex stays a ZodString, so
 * `str().min(1).max(300)` still type-checks.
 */
export function str(): z.ZodString {
  return z.string().regex(NO_CONTROL, "control-character");
}

/** A trimmed, lowercased address. Format is checked; deliverability is not. */
export function email(): z.ZodString {
  return str().trim().toLowerCase().min(3).max(320);
}

/** Lowercase, digits, single hyphens. Never derived from user input blindly. */
export function slugString(): z.ZodString {
  return str()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "slug");
}

/**
 * Zod's issue PATHS, never its messages.
 *
 * Zod quotes the offending input in `message`, and one of these bodies carries a
 * password. The path plus the issue code tells a client which field to mark
 * without echoing what was typed into it.
 */
export function zodDetail(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join(".") || "<body>",
    message: issue.code,
  }));
}

/**
 * Rejects keys that reach a MongoDB operator or a prototype.
 *
 * This is the Mongo-shaped equivalent of SQL injection. A body value of
 * `{"$ne": null}` spread into a filter matches every document; a `__proto__` key
 * survives JSON.parse as an own data property that Zod's unknown-key check does
 * not see. Neither is ever a legitimate request, so both are refused at the
 * boundary rather than being a rule every repository has to remember.
 */
function assertSafeKeys(value: unknown, path: string, depth = 0): void {
  if (depth > 32) throw new BadRequestError("body", [{ path: path || "<body>", message: "too-deep" }]);
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertSafeKeys(item, `${path}[${i}]`, depth + 1));
    return;
  }
  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const here = path ? `${path}.${key}` : key;
    if (key.startsWith("$")) {
      throw new BadRequestError("body", [{ path: here, message: "operator-key" }]);
    }
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new BadRequestError("body", [{ path: here, message: "reserved-key" }]);
    }
    assertSafeKeys(record[key], here, depth + 1);
  }
}

function assertJsonContentType(c: Context): void {
  const type = c.req.header("content-type") ?? "";
  const base = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base !== "application/json" && !base.endsWith("+json")) {
    throw new BadRequestError("content-type", [
      { path: "content-type", message: `expected application/json, got ${base || "nothing"}` },
    ]);
  }
}

/**
 * Reads and validates a JSON body.
 *
 * Every schema passed here must be `.strict()`. An unknown key is a 400, not a
 * silently ignored field: server-authoritative fields like `slug` and `status`
 * are absent from patch schemas ON PURPOSE, and accepting-then-discarding one
 * leaves the caller believing it set something it did not.
 */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  assertJsonContentType(c);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new BadRequestError("body", [{ path: "<body>", message: "not-json" }]);
  }
  assertSafeKeys(raw, "");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError("body", zodDetail(parsed.error));
  return parsed.data;
}

/** The same, with an absent body meaning `{}`. For POSTs whose body is optional. */
export async function readJsonOrEmpty<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.infer<S>> {
  const length = c.req.header("content-length");
  if (!c.req.header("content-type") || length === "0") {
    const parsed = schema.safeParse({});
    if (!parsed.success) throw new BadRequestError("body", zodDetail(parsed.error));
    return parsed.data;
  }
  return readJson(c, schema);
}

/**
 * Reads the query string.
 *
 * Strict too: `?statuss=draft` returning every listing including drafts looks
 * like a bug in the dashboard rather than a typo in the URL. The consequence for
 * clients is that `?cb=12345` cache-busting is a 400. Send a `Cache-Control:
 * no-cache` header instead.
 */
export function readQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw new BadRequestError("query", zodDetail(parsed.error));
  return parsed.data;
}

/**
 * Reads a path parameter, with the same boundary Zod never sees.
 *
 * `c.req.param` used directly is how a control character in a URL segment
 * reaches a query untouched.
 */
export function pathParam(c: Context, name: string): string {
  const raw = c.req.param(name);
  if (typeof raw !== "string" || raw === "") {
    throw new BadRequestError(name, [{ path: name, message: "missing" }]);
  }
  if (raw.includes(NUL) || CONTROL.test(raw)) {
    throw new BadRequestError(name, [{ path: name, message: "control-character" }]);
  }
  if (raw.length > 320) {
    throw new BadRequestError(name, [{ path: name, message: "too-long" }]);
  }
  return raw;
}
