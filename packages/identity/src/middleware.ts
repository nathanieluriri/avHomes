import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hasDomain, isAdminRole, type Domain } from "@avhomes/contracts";
import {
  ForbiddenError,
  UnauthenticatedError,
  currentDb,
  currentUser,
  isProduction,
  type AppEnv,
} from "@avhomes/core";
import { resolveSession } from "./repo/sessions";
import { SESSION_COOKIE_INSECURE, SESSION_COOKIE_SECURE } from "./schema";

/* ─────────────────────────────── cookies ──────────────────────────────── */

/**
 * `__Host-` requires HTTPS, so local http development cannot use it. Deciding
 * here, once, is what stops half the code reading one name and half the other.
 */
export function sessionCookieName(): string {
  return isProduction() ? SESSION_COOKIE_SECURE : SESSION_COOKIE_INSECURE;
}

export function setSessionCookie(
  c: Context<AppEnv>,
  token: string,
  expiresAt: number,
): void {
  setCookie(c, sessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    // Lax, not Strict. Strict means a link from an email lands the operator on a
    // logged-out app, which is how people conclude that login is broken.
    //
    // SINCE THE ORIGIN ALLOW-LIST WAS REMOVED THIS IS THE WHOLE CSRF STORY, so
    // it is worth stating what it does: a browser withholds a Lax cookie on
    // every cross-site request that is not a top-level GET navigation, which
    // covers form posts, fetch and XHR from another site. What it does not
    // cover is a browser that ignores SameSite entirely.
    sameSite: "Lax",
    path: "/",
    // Derived from the session's own expiry, not fixed at 30 days, so a session
    // capped by the absolute ceiling gets a cookie that dies with it rather than
    // one that outlives it and produces a silent 401 on the next write.
    maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, sessionCookieName(), { path: "/" });
}

/* ──────────────────────────── session resolve ─────────────────────────── */

/**
 * Resolve is not require.
 *
 * Separating "who is this" from "must there be someone" is what lets
 * `GET /auth/me` answer 401 through the same code path that lets
 * `POST /auth/logout` succeed for an already-expired session. A logout that
 * 401s leaves the cookie in the browser, which is the one thing logout exists
 * to prevent.
 */
export function sessionMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, sessionCookieName());
    if (!token) {
      // An anonymous request never builds a database client just to be told it
      // is anonymous.
      c.set("user", null);
      c.set("sessionId", null);
      return next();
    }
    const resolved = await resolveSession(await currentDb(c), token);
    c.set("user", resolved?.user ?? null);
    c.set("sessionId", resolved?.sessionId ?? null);
    await next();
  };
}

/* ───────────────────────────── domain gate ────────────────────────────── */

interface Rule {
  readonly prefix: string;
  /**
   * `null` means this path gates ITSELF and the table must not gate it.
   *
   * Reserved for a route that answers every role a DIFFERENT thing rather than
   * answering some roles nothing. There is exactly one, and the bar for a
   * second is that its handler already filters its own output per role: a null
   * here opts a path out of the catch-all below, so anything that merely wants
   * to be reachable by several roles wants a domain, not this.
   */
  readonly domain: Domain | null;
}

/**
 * First match wins, specific before general, and the admin catch-all is
 * `danger`.
 *
 * An unmatched `/api/admin/...` route added next month is owner and developer
 * only until somebody classifies it. A new route has to be OPENED to a role on
 * purpose, which is the opposite of inheriting whatever domain happened to sit
 * last in the list.
 *
 * Paths, not routers. Hono flattens mounted routers, so the mounted path is the
 * one stable contract.
 */
const RULES: readonly Rule[] = [
  { prefix: "/api/admin/properties", domain: "listings" },
  { prefix: "/api/admin/testimonials", domain: "listings" },
  { prefix: "/api/admin/stats", domain: "listings" },
  { prefix: "/api/admin/posts", domain: "content" },
  { prefix: "/api/admin/revisions", domain: "content" },
  { prefix: "/api/admin/categories", domain: "content" },
  { prefix: "/api/admin/images", domain: "media" },
  { prefix: "/api/admin/enquiries", domain: "enquiries" },
  { prefix: "/api/admin/dashboard", domain: "analytics" },
  /*
   * SELF-GATING, and it has to be, because no single domain describes it.
   *
   * The health read returns the alerts the caller could act on and nothing
   * else: `visibleAlerts` filters each one by its own domain, so an editor is
   * handed their empty journal and an agent their listings with no photographs,
   * out of the same request. Classifying the ROUTE therefore misclassifies
   * somebody whichever domain is chosen. `analytics` is the closest fit and
   * still locks out `editor`, who holds only content and media, and the empty
   * journal is theirs to fix.
   *
   * Falling to the catch-all resolved it to `danger`, which is owner and
   * developer only, so the screen was unreachable for all three roles it was
   * written for while its nav row was still shown to them. The route keeps
   * `requireAuth()`, so this is not open: it is signed-in, then filtered.
   */
  { prefix: "/api/admin/health", domain: null },
  { prefix: "/api/admin/users", domain: "team" },
  { prefix: "/api/admin/invites", domain: "team" },
  { prefix: "/api/admin/", domain: "danger" },
];

export function domainFor(path: string): Domain | null {
  for (const rule of RULES) {
    if (path.startsWith(rule.prefix)) return rule.domain;
  }
  return null;
}

/**
 * Strictly tightening.
 *
 * It acts ONLY when an admin session resolved, so an anonymous request falls
 * through to each route's own guards exactly as it did before this file existed.
 * It can 403 a signed-in editor where they used to slip through; it can never
 * widen anything.
 */
export function rolePermissions(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (user) {
      const domain = domainFor(c.req.path);
      if (domain && !hasDomain(user.role, domain)) {
        throw new ForbiddenError(`role ${user.role} does not hold the ${domain} domain`);
      }
    }
    await next();
  };
}

/* ─────────────────────────── per-route guards ─────────────────────────── */

/**
 * Attached PER ROUTE, never `routes.use('*', ...)`.
 *
 * Hono flattens a mounted sub-router into its parent, so a blanket `use` becomes
 * `use('/api/*')` and answers 401 for paths the file has never heard of. An
 * unrouted `/api/nothing-here` becoming a 401 instead of a 404 tells a caller
 * that a route exists and they are not allowed to see it.
 */
export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.get("user")) throw new UnauthenticatedError("route requires a session");
    await next();
  };
}

/**
 * A role check, deliberately NOT `hasDomain(role, 'danger')`.
 *
 * It marks routes where the ACTOR must be one of the two trusted tiers, however
 * the domain matrix evolves. Routing it through the matrix would let a future
 * grant quietly widen destructive operations.
 *
 * 401 before 403, always: an anonymous caller learns nothing they could not
 * learn from the source, and a signed-in one gets the accurate answer.
 */
export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = currentUser(c);
    if (!isAdminRole(user.role)) {
      throw new ForbiddenError(`role ${user.role} is not owner or developer`);
    }
    await next();
  };
}

export function requireOwner(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = currentUser(c);
    if (user.role !== "owner") throw new ForbiddenError(`role ${user.role} is not owner`);
    await next();
  };
}
