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

/**
 * The attributes have to MATCH the ones it was set with, and on a `__Host-`
 * cookie that is not a nicety.
 *
 * This passed only `path`, and in production `sessionCookieName()` returns the
 * `__Host-` prefixed name. That prefix requires `Secure`, so Hono refused to
 * write the expiry and threw, and `POST /api/auth/logout` answered 500 on every
 * real build. Nobody could sign out: the 500 left the cookie exactly where it
 * was, which is the one outcome the comment on `sessionMiddleware` says logout
 * exists to prevent.
 *
 * It never showed up in development because the name is not `__Host-` prefixed
 * there, so the same call is legal and the route returns its 200. A bug that is
 * invisible in dev and total in production is worth the four lines it takes to
 * make the two calls symmetrical.
 */
export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, sessionCookieName(), {
    path: "/",
    secure: isProduction(),
    sameSite: "Lax",
    httpOnly: true,
  });
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
   *
   * Matched EXACTLY, unlike a domain rule, which is a prefix. See `domainFor`.
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
    /*
     * A DOMAIN rule is a prefix, which is what lets one entry cover a whole
     * router. A BYPASS rule is exact, and the asymmetry is deliberate.
     *
     * `startsWith` on a bypass would hand the bypass to every path that merely
     * begins with the same letters. A future `/api/admin/health-report` would
     * have inherited `/api/admin/health`'s exemption instead of falling to the
     * `danger` catch-all, and it would have looked gated, because every route
     * around it is. Getting a domain wrong that way costs a 403 somebody
     * notices; getting a bypass wrong that way costs a silent hole.
     *
     * So a bypass has to name its path, and a new subpath under one has to be
     * exempted on purpose rather than by sharing a stem.
     */
    const matched = rule.domain === null ? path === rule.prefix : path.startsWith(rule.prefix);
    if (matched) return rule.domain;
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
