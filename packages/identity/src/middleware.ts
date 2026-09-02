import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hasDomain, isAdminRole, type Domain } from "@avhomes/contracts";
import {
  ForbiddenError,
  UnauthenticatedError,
  configuredOrigins,
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
    // logged-out app, which is how people conclude that login is broken. Lax
    // still withholds the cookie on every cross-site POST, and originGuard
    // covers the top-level navigation Lax allows.
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

/* ────────────────────────────── origin guard ──────────────────────────── */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF, as an exact-match allow-list on unsafe methods.
 *
 * Three properties worth stating:
 *
 *  - **Matching is equality against a fixed list, never `endsWith`.** Anyone can
 *    deploy to `*.vercel.app`, and `https://evil-avhomes.vercel.app` ends with
 *    `avhomes.vercel.app`. Previews get their own APP_ORIGINS entry.
 *  - **An absent Origin is refused on unsafe methods.** Treating absence as
 *    permission is the hole a SameSite=Lax cookie plus a top-level form POST
 *    walks straight through. The one exemption in this app (the blob upload
 *    callback) is mounted ABOVE this guard and carries its own signed token.
 *  - **GET is allowed from anywhere.** A cross-origin GET cannot read the
 *    response without CORS headers this app does not send.
 */
export function originGuard(origins?: readonly string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const allowed = origins ?? configuredOrigins();
    c.set("origins", allowed);
    if (SAFE_METHODS.has(c.req.method)) return next();

    const origin = c.req.header("Origin");
    if (!origin) {
      throw new ForbiddenError("no Origin header on an unsafe method");
    }
    if (!allowed.includes(origin)) {
      // The reason names the caller's own value, which is theirs already, and
      // never the allow-list, which is ours.
      throw new ForbiddenError(`origin ${origin} is not allowed`);
    }
    await next();
  };
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
  readonly domain: Domain;
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
