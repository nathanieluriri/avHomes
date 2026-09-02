import { handle } from "hono/vercel";
import { app } from "@avhomes/api";

/**
 * The Vercel entrypoint.
 *
 * `[[...route]]` IS correct here. A well-known trap says otherwise, and it is
 * about a different project shape: Vercel's zero-config `api/` builder (a Vite
 * project, no framework) parses the bracket form as ONE dynamic segment and
 * platform-404s every nested path. This is the Next.js App Router, where the
 * optional catch-all is the framework's own convention and nested paths resolve
 * correctly. Do not "fix" this into a flat file plus a rewrite.
 *
 * The rewrite passes the path through UNMODIFIED, which is why every router in
 * @avhomes/api registers with the `/api` prefix. A request for
 * `/api/public/properties` arrives here as `/api/public/properties`.
 *
 * NODE, NEVER 'edge'. Password hashing is node:crypto scrypt and the MongoDB
 * driver needs node:net and node:tls. The edge runtime has none of them.
 */
export const runtime = "nodejs";

/**
 * Never prerendered, never cached at the framework layer.
 *
 * Individual routes set their own `Cache-Control` (the public readers send a
 * shared-cache directive; everything else sends no-store through the error
 * table). Letting Next decide instead would cache an authenticated response.
 */
export const dynamic = "force-dynamic";

/**
 * EVERY METHOD THE ROUTER SERVES IS EXPORTED.
 *
 * A missing one is a 405 from the platform before any route is consulted, which
 * is invisible to every in-process test because those call `app.fetch` directly
 * and never cross the platform router.
 *
 * One handler object bound to each name rather than one per verb: `handle`
 * returns a method-agnostic `(req) => app.fetch(req)`, so the names are what the
 * launcher dispatches on, not different behaviours.
 */
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
