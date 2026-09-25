import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  NotImplementedError,
  PreconditionFailedError,
  UnauthenticatedError,
  UpstreamError,
  auditActor,
  clientIp,
  currentDb,
  email,
  getEnv,
  readJson,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import type { Db } from "@avhomes/db";
import { admit, completeOwnerInvite, ownerInviteStands, refusalBody, type Identity } from "../admit";
import { activeDoor } from "../door";
import { setSessionCookie } from "../middleware";
import { createSession } from "../repo/sessions";
import { INVITE_CODE_RESEND_MS, INVITE_CODE_TTL_MS, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS } from "../schema";
import { clearLimit, limit } from "../repo/ratelimit";
import { burnPasswordTime, hashPassword, verifyPassword } from "../crypto";
import {
  claimInviteWithCode,
  issueMailedInviteCode,
  newestOpenInvite,
  releaseInvite,
} from "../repo/invites";
import { isSuspendedPartner, setPartnerMain } from "../repo/partners";
import { createUser, findCredentialByEmail, findUserByEmail, setPartnerRole, setPasswordHash } from "../repo/users";

/**
 * A verified identity, or null. The suite injects a fake and drives the real
 * route, so the wiring under test is never the thing being faked.
 */
export interface ClerkVerifier {
  verify(token: string): Promise<Identity | null>;
}

let registeredVerifier: ClerkVerifier | null = null;

/** For suites. Fill-only-absent is not needed here: a test sets it explicitly. */
export function registerClerkVerifier(verifier: ClerkVerifier | null): void {
  registeredVerifier = verifier;
}

function realVerifier(): ClerkVerifier {
  return {
    async verify(token) {
      const secretKey = getEnv().CLERK_SECRET_KEY;
      if (secretKey === "") return null;
      let payload: { sub?: string };
      try {
        // Imported lazily so a deployment without Clerk never loads the package,
        // and so importing this module demands no Clerk configuration.
        const { verifyToken, createClerkClient } = await import("@clerk/backend");
        payload = await verifyToken(token, { secretKey });
        if (!payload.sub) return null;
        const clerk = createClerkClient({ secretKey });
        const user = await clerk.users.getUser(payload.sub);
        const primary = user.emailAddresses.find((a) => a.id === user.primaryEmailAddressId);
        const address = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
        if (!address) return null;
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
        return { email: address, name: name || undefined };
      } catch (err) {
        // A rejected token is an answer, not an outage: return null and let the
        // route render a 401. Anything else is genuinely upstream.
        const message = err instanceof Error ? err.message : String(err);
        if (/token|jwt|signature|expired|invalid/i.test(message)) return null;
        throw new UpstreamError("clerk", message);
      }
    },
  };
}

const ExchangeBody = z.object({ token: str().min(1).max(4096) }).strict();
const LoginBody = z.object({ email: email(), password: z.string().min(1).max(400) }).strict();
const ClaimBody = z
  .object({
    email: email(),
    // Length is the only rule. A composition rule that forces a symbol produces
    // one predictable symbol at the end of a short word.
    password: z.string().min(12).max(400),
    displayName: str().min(1).max(120).trim().optional(),
    code: z.string().trim().regex(/^\d{6}$/, "six digits"),
  })
  .strict();
const CodeBody = z.object({ email: email() }).strict();

const CODE_SENT = "If that address has an invite, a code is on its way. Check your email.";
/* One answer for a wrong, expired, used up or never sent code, so the claim
   cannot be asked who is invited either. */
const CODE_REFUSED =
  "That code is not right, or it has expired. Check the latest email, or send a new code.";

/** Shared tail: mint the session and set the cookie. */
async function issueSession(
  c: Context<AppEnv>,
  db: Db,
  userId: string,
): Promise<{ expiresAt: number }> {
  const { token, expiresAt } = await createSession(db, userId, c.req.header("user-agent") ?? null);
  setSessionCookie(c, token, expiresAt);
  return { expiresAt };
}

/**
 * The Clerk door.
 *
 * Answers 501 when it is not the active door, which is a row of the error table
 * ("capability not configured") rather than a 404: the route exists, it is
 * simply not open, and the hint names what to set to open it.
 */
export function clerkRoutes(deps: { verifier?: ClerkVerifier } = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/auth/clerk/exchange", async (c) => {
    if (activeDoor(c.req) !== "clerk") {
      throw new NotImplementedError(
        "clerk-door",
        "the password door is active; set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY on a custom domain",
      );
    }
    const { token } = await readJson(c, ExchangeBody);

    const db = await currentDb(c);
    await limit(db, `clerk:${clientIp(c)}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
    const verifier = deps.verifier ?? registeredVerifier ?? realVerifier();
    const identity = await verifier.verify(token);
    if (!identity) throw new UnauthenticatedError("clerk rejected the token");

    const result = await admit(db, identity);
    if (!result.ok) return c.json({ ...refusalBody(result.reason), requestId: c.get("requestId") }, 403);

    await issueSession(c, db, result.user.id);
    // sessionMiddleware resolved the cookie before this route ran, so the
    // signer-in is still anonymous to the middleware without this.
    auditActor(c, result.user);
    return c.json({ user: result.user });
  });

  return routes;
}

/**
 * The password door, deliberately small.
 *
 * Invite-only survives: `claim` spends an invite and sets the first password
 * through the same membership decision the Clerk door uses. Unlike Clerk it has
 * no verified address of its own, so the claim needs a code mailed to the
 * invited one first. There is no reset
 * flow, because a reset needs working mail and mail is optional here. The way
 * back in when the last owner is locked out is the bootstrap-owner script.
 */
export function passwordRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  function assertActive(req: { url: string }): void {
    if (activeDoor(req) !== "password") {
      throw new NotImplementedError(
        "password-door",
        "the Clerk door is active; unset CLERK_SECRET_KEY to use email and password",
      );
    }
  }

  routes.post("/auth/password/login", async (c) => {
    assertActive(c.req);
    // Parsed before the limiter: validation is free, the limiter is a write.
    const body = await readJson(c, LoginBody);

    const db = await currentDb(c);
    const ip = clientIp(c);
    await limit(db, `login:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
    const found = await findCredentialByEmail(db, body.email);

    if (!found) {
      // Pay for a hash anyway. Without it an unknown address returns in
      // microseconds while a known one waits for scrypt, and the difference
      // enumerates the user table.
      await burnPasswordTime(body.password);
      throw new UnauthenticatedError("no account for that address, or the password is wrong");
    }
    if (found.disabledAt != null) {
      return c.json({ ...refusalBody("disabled"), requestId: c.get("requestId") }, 403);
    }
    if (!(await verifyPassword(body.password, found.passwordHash))) {
      throw new UnauthenticatedError("no account for that address, or the password is wrong");
    }
    if (await isSuspendedPartner(db, found.user.partnerId)) {
      return c.json({ ...refusalBody("suspended"), requestId: c.get("requestId") }, 403);
    }

    await clearLimit(db, `login:${ip}`, LOGIN_WINDOW_MS);
    await issueSession(c, db, found.user.id);
    // Same reason as the Clerk exchange: nobody is signed in yet when
    // sessionMiddleware looks, so the route has to name the actor itself.
    auditActor(c, found.user);
    return c.json({ user: found.user });
  });

  /**
   * Mails a code for the claim below.
   *
   * The same 200 whether or not the address is invited, has an account, or is
   * inside the resend cooldown, so this route cannot be used to list the invited.
   */
  routes.post("/auth/password/claim/code", async (c) => {
    assertActive(c.req);
    const { email: address } = await readJson(c, CodeBody);

    const db = await currentDb(c);
    await limit(db, `claim-code:${clientIp(c)}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);

    const invite = (await findUserByEmail(db, address)) ? null : await newestOpenInvite(db, address);
    const code = invite ? await issueMailedInviteCode(db, invite) : null;
    if (invite && code) {
      await trySend(
        deps.mailer,
        {
          to: invite.email,
          subject: "Your AVHomes sign-in code",
          text: [
            `Your code is ${code}.`,
            "",
            `Enter it on the sign-in screen to accept your invite. It lasts ${INVITE_CODE_TTL_MS / 60_000} minutes.`,
            "",
            "If you did not ask for it, ignore this email. Nobody can accept the invite without it.",
          ].join("\n"),
        },
        { requestId: c.get("requestId"), route: "POST /auth/password/claim/code" },
      );
    }
    return c.json({ ok: true, detail: CODE_SENT, resendAfter: INVITE_CODE_RESEND_MS / 1000 });
  });

  /**
   * Spends an invite and sets the first password.
   *
   * The invite is claimed BEFORE the user is created and handed back if creation
   * fails, so a crash between the two does not burn the only way that person can
   * ever get in.
   */
  routes.post("/auth/password/claim", async (c) => {
    assertActive(c.req);
    const body = await readJson(c, ClaimBody);

    const db = await currentDb(c);
    await limit(db, `claim:${clientIp(c)}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
    const address = body.email;

    const existing = await findUserByEmail(db, address);
    if (existing) {
      if (existing.disabledAt != null) {
        return c.json({ ...refusalBody("disabled"), requestId: c.get("requestId") }, 403);
      }
      // An account already exists. Setting a password here without proving the
      // caller owns it would be an account takeover primitive.
      throw new BadRequestError("email", [
        { path: "email", message: "an account already exists for this address" },
      ]);
    }

    const invite = await claimInviteWithCode(db, address, body.code);
    if (!invite) throw new PreconditionFailedError("invite_code", { detail: CODE_REFUSED });
    if (await isSuspendedPartner(db, invite.partnerId ?? null)) {
      if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
      return c.json({ ...refusalBody("suspended"), requestId: c.get("requestId") }, 403);
    }
    if (!(await ownerInviteStands(db, invite))) {
      if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
      return c.json({ ...refusalBody("not_invited"), requestId: c.get("requestId") }, 403);
    }

    const displayName = (body.displayName ?? "").trim() || address.split("@")[0] || address;
    try {
      let user = await createUser(db, {
        email: address,
        displayName,
        role: invite.role,
        partnerId: invite.partnerId ?? null,
        partnerRole: invite.partnerRole ?? null,
        passwordHash: await hashPassword(body.password),
      });
      await completeOwnerInvite(db, invite);
      if (invite.partnerId && invite.partnerRole === "main") {
        const took = await setPartnerMain(db, invite.partnerId, user.id, null);
        // The label follows the seat, because `countStaffSeats` counts the label: an
        // account labelled main holding no seat is a staff seat nobody ever spends.
        if (!took) {
          await setPartnerRole(db, user.id, "staff");
          user = { ...user, partnerRole: "staff" };
        }
      }
      await issueSession(c, db, user.id);
      // Claim also establishes a session for someone who was anonymous a
      // moment ago, same as login and the Clerk exchange above.
      auditActor(c, user);
      return c.json({ user }, 201);
    } catch (err) {
      if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
      throw err;
    }
  });

  /** Changing your own password. Requires the current one, even with a session. */
  routes.post("/auth/password/change", async (c) => {
    assertActive(c.req);
    const user = c.get("user");
    if (!user) throw new UnauthenticatedError("route requires a session");

    const db = await currentDb(c);
    const body = await readJson(
      c,
      z.object({ current: z.string().min(1).max(400), next: z.string().min(12).max(400) }).strict(),
    );
    const found = await findCredentialByEmail(db, user.email);
    if (!found || !(await verifyPassword(body.current, found.passwordHash))) {
      throw new UnauthenticatedError("current password is wrong");
    }
    await setPasswordHash(db, user.id, await hashPassword(body.next));
    return c.json({ ok: true });
  });

  return routes;
}
