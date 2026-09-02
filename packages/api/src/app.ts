import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  NotFoundError,
  databaseConfig,
  getEnv,
  resendMailer,
  toResponse,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import { getDb, type Db } from "@avhomes/db";
import {
  authRoutes,
  clerkRoutes,
  originGuard,
  passwordRoutes,
  rolePermissions,
  sessionMiddleware,
  teamRoutes,
} from "@avhomes/identity";
import { listingsAdminRoutes, listingsPublicRoutes } from "@avhomes/listings";
import { contentAdminRoutes, contentPublicRoutes } from "@avhomes/content";
import {
  localFileStorage,
  mediaPublicRoutes,
  mediaRoutes,
  vercelBlobStorage,
  type StoragePort,
} from "@avhomes/media";
import { enquiriesAdminRoutes, enquiriesPublicRoutes } from "@avhomes/enquiries";
import { analyticsPublicRoutes } from "@avhomes/analytics";
import { dashboardRoutes } from "./dashboard";

/**
 * The composition root.
 *
 * A FACTORY, not a module-scope singleton with baked-in dependencies. Two things
 * force it: the rate limiter must bound the DEPLOYMENT rather than one instance,
 * and the only honest way to test that is to build two apps over one database;
 * and a suite has to be able to supply its own handle without an environment
 * variable per file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READING THIS FILE TOP TO BOTTOM IS READING THE THREAT MODEL.
 *
 * The ORDER of the `use` and `route` calls below IS the security model. A router
 * mounted above `sessionMiddleware` is STRUCTURALLY incapable of reading a
 * cookie, because the middleware that would set one has not run and cannot be
 * reached from inside it. That is a guarantee; "we remembered not to read the
 * session" is a convention.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface AppDeps {
  /**
   * The handle, or a factory. Defaulted to the cached Atlas client.
   *
   * NEVER CALLED AT CONSTRUCTION, and not eagerly per request either: it is
   * invoked by the first `currentDb(c)` of a request and memoised for the rest.
   * So importing this module demands no MONGODB_URI, and a request with no
   * reason to touch the database never builds a client.
   */
  db?: Db | (() => Promise<Db>);
  /** Exact-match allow-list. Defaults to APP_ORIGINS plus SITE_ORIGIN. */
  origins?: readonly string[];
  /**
   * One transport for the whole deployment, so a suite injecting a recorder for
   * invites gets enquiry mail through the same recorder rather than a second,
   * invisible one. The default reads nothing at construction.
   */
  mailer?: Mailer;
  storage?: StoragePort;
}

/**
 * Every router registers WITH this prefix.
 *
 * The Next.js catch-all at `src/app/api/[[...route]]/route.ts` passes the path
 * through unmodified, so a route mounted at `/posts` would be unreachable in
 * production while every in-process test asking for `/api/posts` still passed.
 */
export const API_PREFIX = "/api";

export function createApp(deps: AppDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const resolveDb: () => Promise<Db> =
    typeof deps.db === "function"
      ? deps.db
      : deps.db
        ? async () => deps.db as Db
        : async () => getDb(databaseConfig());

  const mailer = deps.mailer ?? resendMailer();

  /*
   * The image store, chosen by configuration rather than by which token happens
   * to be set. Guessing from a token's presence makes a missing token look like
   * a deliberate choice, and the failure is uploads silently going somewhere
   * nobody expects.
   *
   * `local` writes to a directory and serves it back through the public route
   * below. It is a DEVELOPMENT store: a serverless filesystem is read only
   * apart from a per-instance /tmp, so anything deployed needs `blob`.
   *
   * Resolved once at construction, not per request, so the whole application
   * cannot disagree with itself about where an image went.
   */
  const env = getEnv();
  const storage =
    deps.storage ??
    (env.IMAGE_STORAGE === "local"
      ? localFileStorage(env.IMAGE_LOCAL_DIR, `${API_PREFIX}/public/images`)
      : vercelBlobStorage());

  /* ═════════════════ 1. request id, before everything ═════════════════ */

  /*
   * Minted here and NEVER read from the request. Echoing a caller-supplied
   * X-Request-Id would let anyone write arbitrary ids into the log and collide
   * them with somebody else's incident.
   */
  app.use("*", async (c, next) => {
    const id = randomUUID();
    c.set("requestId", id);
    await next();
    c.res.headers.set("x-request-id", id);
  });

  /* ═════════════════ 2. the one error table ═══════════════════════════ */

  app.onError((err, c) =>
    toResponse(err, { requestId: c.get("requestId") ?? "", method: c.req.method, path: c.req.path }),
  );

  /*
   * An unrouted path answers with the same shape as everything else, and the
   * client's retry policy stops on a 404 either way, so a typo'd URL fails
   * immediately instead of being retried as a transient error.
   */
  app.notFound((c) =>
    toResponse(new NotFoundError(c.req.path), {
      requestId: c.get("requestId") ?? "",
      method: c.req.method,
      path: c.req.path,
    }),
  );

  /* ═════════════════ 3. health, ABOVE the database ════════════════════ */

  /*
   * A liveness probe that cannot answer without MONGODB_URI reports the
   * environment, not the process.
   */
  app.get(`${API_PREFIX}/health`, (c) => c.json({ ok: true }));

  /* ═════════════════ 4. the lazy database factory ═════════════════════ */

  /*
   * Publishes a CLOSURE. Nothing is dialled here, so this middleware cannot
   * fail, and a request that never touches the database (an unrouted path, an
   * anonymous 401, a forged-origin 403) never builds a client. Its answer
   * therefore cannot be turned into a 500 by an environment it did not need.
   */
  app.use(`${API_PREFIX}/*`, async (c, next) => {
    let handle: Promise<Db> | null = null;
    c.set("dbFactory", () => (handle ??= resolveDb()));
    await next();
  });

  /* ═════════════════ 5. machine callbacks, ABOVE originGuard ══════════ */

  /*
   * THE SLOT IS EMPTY, AND THAT IS THE CURRENT DESIGN.
   *
   * A route belongs here only if it is a server-to-server POST with no Origin
   * header AND carries its own cryptographic authority AND reads no cookie. The
   * one candidate is a client-side blob upload completion callback, which the
   * media package deliberately does not use: uploads go through the server, so
   * no origin-guard exemption has to be bought.
   *
   * If a route is ever added here, all three properties are the price of
   * admission. Reading a cookie is the single thing that would make the
   * exemption unsafe, because CSRF borrows a victim's AMBIENT authority and a
   * route that reads no cookie has none to borrow.
   */

  /* ═════════════════ 6. public reads, ABOVE sessionMiddleware ═════════ */

  /*
   * Every response under these routers carries `Cache-Control: public`, so a
   * shared cache may store one and hand it to a different reader. A cacheable
   * response that is ABLE to vary by cookie is one edit away from serving one
   * visitor's view to another.
   *
   * Mounted here, `c.get('user')` is undefined on every request that reaches
   * them: the middleware that would resolve a session has not run and cannot be
   * reached from inside. Cookieless BY CONSTRUCTION.
   *
   * They are also above originGuard, which is irrelevant either way: every route
   * in them is a GET, and the guard returns for safe methods before it looks at
   * anything.
   */
  app.route(API_PREFIX, listingsPublicRoutes());
  app.route(API_PREFIX, contentPublicRoutes());

  /*
   * Image bytes, when the active store keeps them somewhere only this process
   * can see. Mounted here for the same reason as its neighbours: a public image
   * must not be able to vary by who is asking, and above the session middleware
   * it structurally cannot.
   *
   * Registered unconditionally. The route itself answers 404 when the store has
   * no read path, which keeps the mount list the same on every deployment
   * rather than making the route table depend on an environment variable.
   */
  app.route(API_PREFIX, mediaPublicRoutes({ storage }));

  /* ═════════════════ 7. the origin guard ══════════════════════════════ */

  app.use(`${API_PREFIX}/*`, originGuard(deps.origins));

  /* ═════════════════ 8. the public mutations, BELOW the guard ═════════ */

  /*
   * The contact form. A public write, so it is NOT in the cacheable router
   * above: putting a mutation there would put "may be stored by a shared cache"
   * and "creates a document" in one file.
   *
   * Below originGuard, so a cross-origin form post cannot drive it, and above
   * sessionMiddleware is not needed because it reads no session either way.
   */
  app.route(API_PREFIX, enquiriesPublicRoutes({ mailer }));

  /*
   * The visit beacon, in the same slot and for the same two reasons. It is a
   * public mutation, so it must be BELOW originGuard or any page on the web
   * could drive the site's own numbers; and it reads no cookie, so it must stay
   * ABOVE sessionMiddleware, where being cookieless is structural rather than a
   * thing the handler remembered.
   */
  app.route(API_PREFIX, analyticsPublicRoutes());

  /* ═════════════════ 9. session, then the domain gate ═════════════════ */

  app.use(`${API_PREFIX}/*`, sessionMiddleware());
  app.use(`${API_PREFIX}/*`, rolePermissions());

  /* ═════════════════ 10. the authenticated surface ════════════════════ */

  app.route(API_PREFIX, authRoutes());

  /*
   * BOTH doors are mounted, and each refuses with a 501 when it is not the
   * active one. Mounting only the active door would make `activeDoor()` a
   * construction-time decision, so a deployment that gained Clerk keys would
   * keep serving the password door until something rebuilt the app object.
   */
  app.route(API_PREFIX, clerkRoutes());
  app.route(API_PREFIX, passwordRoutes());

  app.route(API_PREFIX, teamRoutes({ mailer }));
  app.route(API_PREFIX, listingsAdminRoutes());
  app.route(API_PREFIX, contentAdminRoutes());
  app.route(API_PREFIX, mediaRoutes({ storage }));
  app.route(API_PREFIX, enquiriesAdminRoutes());

  /*
   * LAST, and the position is not arbitrary. Hono resolves two routers claiming
   * one path by registration order, so this sits under the same `/admin` prefix
   * the feature routers already use, registered after all of them, where a
   * collision would be THIS router losing rather than this router shadowing an
   * existing route.
   */
  app.route(API_PREFIX, dashboardRoutes());

  return app;
}

/** The real thing, for the Next.js entrypoint and for scripts. */
export const app = createApp();
