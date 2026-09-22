import { Hono } from "hono";
import { z } from "zod";
import { AUDIT_ENTITIES, isScopedRole } from "@avhomes/contracts";
import {
  NotFoundError,
  clampLimit,
  currentDb,
  currentUser,
  pathParam,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import type { Db } from "@avhomes/db";
import { requireAuth } from "@avhomes/identity";
import { assertAuditCursor, listEntityHistory, listEntries } from "./repo";

/**
 * Reading the trail. There is no write verb here and there must never be one:
 * entries are produced by the middleware, never by a caller.
 *
 * TODO(test): an ANONYMOUS `GET /api/admin/audit` is 401, driven through the
 *   real app. `rolePermissions` does not authenticate, so without the guard
 *   below this endpoint serves the whole log to anyone without a cookie, and
 *   nothing else in the stack would have caught it.
 * TODO(test): a signed-in agent is 403 on `/api/admin/audit` (the `danger`
 *   catch-all) and 200 on `/api/admin/properties/:id/history` (the `listings`
 *   domain). That split is the reason there are two endpoints.
 * TODO(test): the history response carries exactly `at`, `actorName` and
 *   `action`, asserted by walking the serialised body rather than by reading
 *   the projection constant.
 */

const ListQuery = z
  .object({
    entity: z.enum(AUDIT_ENTITIES).optional(),
    entityId: str().max(320).optional(),
    actorId: str().max(320).optional(),
    /** Epoch ms, inclusive, like every other timestamp here. */
    from: z.coerce.number().int().min(0).optional(),
    to: z.coerce.number().int().min(0).optional(),
    limit: str().optional(),
    cursor: str().max(600).optional(),
  })
  .strict();

const HistoryQuery = z.object({ limit: str().optional() }).strict();

/**
 * May this caller read this listing? A port, because whether a listing is
 * somebody's is a listings question and this package may not import that one.
 */
export type ListingReadCheck = (
  db: Db,
  user: ReturnType<typeof currentUser>,
  listingId: string,
) => Promise<boolean>;

export function auditRoutes(deps: { canReadListing?: ListingReadCheck } = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /**
   * `requireAuth()` IS LOAD-BEARING HERE, not belt and braces.
   *
   * `rolePermissions` says so in its own header: it acts only when an admin
   * session resolved, so an anonymous request falls through to each route's own
   * guards. Without this line an anonymous GET would be served the entire log,
   * which the design describes as a second store of buyer emails, phone numbers
   * and message text. The two controls compose: this establishes that there is
   * a session at all, and the domain gate then finds `danger` for the path from
   * the `/api/admin/` catch-all and refuses every role but owner and developer.
   */
  routes.get("/admin/audit", requireAuth(), async (c) => {
    const q = readQuery(c, ListQuery);
    // Free, and before any database work: a request that can never be answered
    // must not build a client to find that out.
    assertAuditCursor(q.cursor);

    const page = await listEntries(await currentDb(c), {
      entity: q.entity,
      entityId: q.entityId,
      actorId: q.actorId,
      from: q.from,
      to: q.to,
      limit: clampLimit(q.limit),
      cursor: q.cursor,
    });
    return c.json(page);
  });

  /**
   * The property editor's History panel, and a SECOND endpoint rather than a
   * filter on the first.
   *
   * Agents are the primary users of that editor and they hold `listings`, not
   * `danger`, so the reader above 403s for exactly the role the panel is for.
   * This path resolves to the `listings` domain instead, and it carries three
   * fields: no `requested`, no `before`, no `path`. "Tobi marked this under
   * offer two days ago" is the whole question asked on that screen.
   *
   * NEVER WIDEN IT. Serving whole entries on a `/admin/properties/` path would
   * hand every agent the buyer data in `before`.
   */
  routes.get("/admin/properties/:id/history", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const q = readQuery(c, HistoryQuery);
    const db = await currentDb(c);
    /* The `listings` domain lets a partner lister in, and without this they could
       read who changed what on any listing whose id they had. Not found rather
       than forbidden, so an id somebody does not own says nothing about itself.
       With no check wired a scoped caller is refused outright: failing closed. */
    const user = currentUser(c);
    if (isScopedRole(user.role)) {
      const allowed = deps.canReadListing ? await deps.canReadListing(db, user, id) : false;
      if (!allowed) throw new NotFoundError(`property ${id}`);
    }
    // One bounded page, newest first. A panel beside an editor is not a place
    // anybody scrolls two years back, so there is no cursor to get wrong.
    const items = await listEntityHistory(db, "property", id, clampLimit(q.limit));
    // An envelope, not a bare array, like every other list response here.
    return c.json({ items });
  });

  return routes;
}
