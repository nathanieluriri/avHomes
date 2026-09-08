import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import {
  NotFoundError,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  str,
  type AppEnv,
} from "@avhomes/core";
import { doorStatus } from "../door";
import { clearSessionCookie, requireAuth, sessionCookieName } from "../middleware";
import { listSessions, revokeSession, revokeSessionByToken } from "../repo/sessions";
import { updateProfile } from "../repo/users";

/**
 * Everything on the card a buyer meets, in one patch.
 *
 * `.partial()` on all four, so a screen that only wants to attach a photo does
 * not have to send the name back and race a rename it never saw. An avatar is
 * clearable, which is why it accepts "" rather than requiring a URL: an agent
 * who uploaded the wrong picture must be able to take it down without waiting
 * for a replacement.
 */
const ProfileBody = z
  .object({
    displayName: str().min(1).max(120).trim(),
    avatarUrl: str().max(600).trim(),
    title: str().max(120).trim(),
    phone: str().max(60).trim(),
  })
  .partial()
  .strict();

/**
 * The account's own surface.
 *
 * `GET /auth/door` is deliberately unauthenticated: it tells a sign-in screen
 * which form to render, and nothing it returns is a secret. The publishable key
 * is published by definition.
 */
export function authRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/auth/door", (c) => {
    const status = doorStatus(c.req);
    return c.json({
      door: status.door,
      clerkPublishableKey: status.clerkPublishableKey,
      // Only useful to an operator, and it names an environment variable rather
      // than describing internal state.
      clerkUnavailableReason: status.clerkUnavailableReason,
    });
  });

  /**
   * NOT behind requireAuth.
   *
   * A logout that answers 401 leaves the cookie in the browser, which is the one
   * thing logout exists to prevent. An expired session and a live one both end
   * with the cookie gone and a 200.
   */
  routes.post("/auth/logout", async (c) => {
    const token = getCookie(c, sessionCookieName());
    if (token) await revokeSessionByToken(await currentDb(c), token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  routes.get("/auth/me", requireAuth(), (c) => c.json({ user: currentUser(c) }));

  routes.patch("/auth/me", requireAuth(), async (c) => {
    const body = await readJson(c, ProfileBody);
    const user = currentUser(c);
    // An empty patch is a no-op 200, not a 400. The caller asked for the state
    // it already has and it got it.
    if (Object.keys(body).length === 0) return c.json({ user });
    const updated = await updateProfile(await currentDb(c), user.id, body);
    if (!updated) throw new NotFoundError(user.id);
    return c.json({ user: updated });
  });

  /** YOUR OWN sessions. There is deliberately no owner override. */
  routes.get("/auth/sessions", requireAuth(), async (c) => {
    const items = await listSessions(await currentDb(c), currentUser(c).id, c.get("sessionId"));
    return c.json({ items });
  });

  /**
   * Including the current one, which is how "sign out everywhere else" is built
   * client-side without a second route.
   *
   * Somebody else's session id and an id that never existed are the same 404:
   * the delete is scoped by user, so both produce zero rows, which is also what
   * stops this route being a probe.
   */
  routes.delete("/auth/sessions/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const removed = await revokeSession(await currentDb(c), currentUser(c).id, id);
    if (!removed) throw new NotFoundError(id);
    if (id === c.get("sessionId")) clearSessionCookie(c);
    return c.json({ ok: true });
  });

  return routes;
}
