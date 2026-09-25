import { Hono } from "hono";
import { z } from "zod";
import {
  ASSIGNABLE_ROLES,
  canAssign,
  canManage,
  isConsoleRole,
  type Role,
} from "@avhomes/contracts";
import {
  BadRequestError,
  DuplicateError,
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
  auditBefore,
  auditEntityId,
  currentDb,
  currentUser,
  email,
  pathParam,
  readJson,
  readQuery,
  deploymentOrigin,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { requireAdmin } from "../middleware";
import {
  createInvite,
  findInvite,
  findOpenInvite,
  issueHandedInviteCode,
  listInvites,
  revokeTeamInvite,
} from "../repo/invites";
import {
  countActiveOwners,
  disableUser,
  enableUser,
  findUserById,
  findUserByEmail,
  listUsers,
  promoteToOwner,
  reassignListingsToOwner,
  setUserRole,
  stepDownOwner,
  type FoundUser,
} from "../repo/users";
import { endAllSessions } from "../repo/sessions";

const InviteBody = z
  .object({
    // RFC 5321's maximum. Format is checked; deliverability is not.
    email: email(),
    role: z.enum(["owner", ...ASSIGNABLE_ROLES]).default("agent"),
    /* Owner invites only. The role the inviting owner takes once it is accepted. */
    stepDownTo: z.enum(ASSIGNABLE_ROLES).optional(),
  })
  .strict();

const RoleBody = z.object({ role: z.enum(ASSIGNABLE_ROLES) }).strict();

// The role the outgoing owner keeps. Developer is the only one with the same access.
const TransferBody = z.object({ stepDownTo: z.enum(ASSIGNABLE_ROLES).default("developer") }).strict();

const InviteQuery = z.object({ include: str().max(100).optional() }).strict();

/**
 * Who the team list is about. Defaults to the console, so a screen that forgets
 * to ask gets colleagues rather than every marketer who ever signed up.
 */
const UserQuery = z.object({ scope: z.enum(["console", "all"]).default("console") }).strict();

/**
 * The refusals, each with its own operation code.
 *
 * A different code for each is the whole reason they are not one refusal: a
 * screen has to say "you cannot disable yourself" or "developers cannot remove
 * other developers", and a client telling them apart by parsing prose gets it
 * wrong the first time the prose changes.
 */
type Refusal =
  | "disable_self"
  | "disable_last_owner"
  | "manage_peer"
  | "role_self"
  | "role_owner"
  | "manage_marketer"
  | "manage_partner"
  | "transfer_not_owner"
  | "transfer_self"
  | "transfer_disabled"
  | "transfer_target_owner"
  | "transfer_raced";

function refuse(operation: Refusal, userId: string): never {
  throw new PreconditionFailedError(operation, { userId, detail: REFUSAL_DETAIL[operation] });
}

const REFUSAL_DETAIL: Record<Refusal, string> = {
  disable_self: "You cannot disable your own account.",
  disable_last_owner: "This is the last active owner. Promote someone else first.",
  manage_peer: "A developer cannot manage an owner or another developer.",
  role_self: "You cannot change your own role.",
  role_owner: "The owner's role cannot be changed here. The owner hands it over with Make owner.",
  manage_marketer:
    "This is a marketer account, not a console one. Manage it on the Marketers screen.",
  manage_partner:
    "This is a partner company's account. Manage it on that partner's page under Partners.",
  transfer_not_owner: "Only the owner can hand over ownership.",
  transfer_self: "You already own this site.",
  transfer_disabled: "This account is disabled. Enable it before making them owner.",
  transfer_target_owner: "This person is already an owner.",
  transfer_raced: "Their account changed while this was being saved. Reload and try again.",
};

/**
 * Only AV Homes' own people are managed here.
 *
 * A marketer's account is the whole of their app, and a partner's belongs to
 * their company, managed on its page under Partners. Refused by role, so a
 * row the list no longer shows cannot be reached by id either.
 */
function refuseIfNotTeam(target: FoundUser, userId: string): void {
  // The question, not a list of today's answers: a future role that belongs in
  // neither place is refused by default rather than passing because nobody named it.
  if (!isConsoleRole(target.user.role)) refuse("manage_marketer", userId);
  // A partner IS a console role, so it needs its own clause beside the question.
  if (target.user.role === "partner") refuse("manage_partner", userId);
}

/** Counts a user's work, so "what does disabling this person leave behind" has an answer. */
async function workCounts(db: Db, userIds: string[]): Promise<Map<string, { listings: number; posts: number }>> {
  const out = new Map<string, { listings: number; posts: number }>();
  for (const id of userIds) out.set(id, { listings: 0, posts: 0 });

  const [listings, posts] = await Promise.all([
    collection<{ _id: string; count: number }>(db, COLLECTIONS.properties)
      .aggregate<{ _id: string; count: number }>([
        { $match: { agentUserId: { $in: userIds } } },
        { $group: { _id: "$agentUserId", count: { $sum: 1 } } },
      ])
      .toArray(),
    collection<{ _id: string; count: number }>(db, COLLECTIONS.posts)
      .aggregate<{ _id: string; count: number }>([
        { $match: { authorId: { $in: userIds } } },
        { $group: { _id: "$authorId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  for (const row of listings) {
    const entry = out.get(row._id);
    if (entry) entry.listings = row.count;
  }
  for (const row of posts) {
    const entry = out.get(row._id);
    if (entry) entry.posts = row.count;
  }
  return out;
}

export function teamRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/users", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const { scope } = readQuery(c, UserQuery);
    const users = await listUsers(db, scope);
    // Trashed listings and posts count too: the question is what disabling this
    // person leaves behind, and a trashed item is restorable until it is purged.
    const counts = await workCounts(db, users.map((u) => u.id));
    return c.json({
      items: users.map((u) => ({
        ...u,
        listingCount: counts.get(u.id)?.listings ?? 0,
        postCount: counts.get(u.id)?.posts ?? 0,
      })),
    });
  });

  /**
   * Read first, then seniority, then the invariant, then identity.
   *
   * Seniority BEFORE identity, so the two identity rules below can reason about
   * owners and selves without developers in the sentence.
   */
  routes.post("/admin/users/:id/disable", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const actor = currentUser(c);

    const target = await findUserById(db, id);
    // An id naming nobody is a 404, not a silent no-op reported as ok.
    if (!target) throw new NotFoundError(id);
    auditBefore(c, target as unknown as Record<string, unknown>);

    refuseIfNotTeam(target, id);
    if (!canManage(actor.role, target.user.role)) refuse("manage_peer", id);

    if (target.user.role === "owner" && target.disabledAt == null) {
      // Phrased as an invariant (never zero active owners) rather than an
      // identity comparison, so it stays correct as the guards evolve.
      if ((await countActiveOwners(db)) <= 1) refuse("disable_last_owner", id);
    }
    // Not because it is unsafe, but because the outcome is signing yourself out
    // with no undo on screen.
    if (target.user.id === actor.id) refuse("disable_self", id);

    await disableUser(db, id);
    const sessionsEnded = await endAllSessions(db, id);
    /*
     * The listings follow the account out.
     *
     * AFTER the disable and the session sweep, never before: those two are what
     * make the account safe, and a slow bulk update in front of them is a window
     * where a revoked laptop is still signed in. If this line throws, the
     * account is already locked out and the listings are merely still pointing
     * at it, which is the recoverable half of the failure.
     */
    const listingsReassigned = await reassignListingsToOwner(db, id);
    // Idempotent: disabling an already-disabled user is a 200 with 0 sessions
    // ended, not a 409. The state the caller asked for is the state they get.
    return c.json({ ok: true, sessionsEnded, listingsReassigned });
  });

  /**
   * Deliberately NOT the mirror of disable.
   *
   * Enable does not restore sessions. The cookie on the laptop that prompted the
   * revocation does not come back, which is the entire point of destroying the
   * rows rather than shadowing them behind a flag.
   */
  routes.post("/admin/users/:id/enable", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const target = await findUserById(db, id);
    if (!target) throw new NotFoundError(id);
    auditBefore(c, target as unknown as Record<string, unknown>);
    refuseIfNotTeam(target, id);
    if (!canManage(currentUser(c).role, target.user.role)) refuse("manage_peer", id);
    await enableUser(db, id);
    return c.json({ ok: true });
  });

  routes.patch("/admin/users/:id/role", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const actor = currentUser(c);
    const { role: next } = await readJson(c, RoleBody);

    const target = await findUserById(db, id);
    if (!target) throw new NotFoundError(id);
    auditBefore(c, target as unknown as Record<string, unknown>);
    if (target.user.id === actor.id) refuse("role_self", id);
    if (target.user.role === "owner") refuse("role_owner", id);
    refuseIfNotTeam(target, id);
    if (!canManage(actor.role, target.user.role) || !canAssign(actor.role, next as Role)) {
      refuse("manage_peer", id);
    }

    // The second wall: setUserRole refuses an owner in the filter itself.
    const updated = await setUserRole(db, id, next as Role);
    if (!updated) throw new NotFoundError(id);
    return c.json({ ok: true, user: updated });
  });

  /**
   * Hands ownership to another active colleague, and the caller steps down.
   *
   * No transactions in this codebase, so the writes are ORDERED: promote first,
   * then step down. A failure between them leaves two owners, which the new
   * owner can tidy, never zero, which nobody can. `stepDownOwner` also refuses
   * in its own statement unless another active owner exists.
   *
   * Nothing to invalidate: `resolveSession` reads the role from the users row on
   * every request, so the old owner loses owner powers on their next request.
   */
  routes.post("/admin/users/:id/transfer-ownership", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const actor = currentUser(c);
    const { stepDownTo } = await readJson(c, TransferBody);

    const target = await findUserById(db, id);
    if (!target) throw new NotFoundError(id);
    auditBefore(c, target as unknown as Record<string, unknown>);

    if (actor.role !== "owner") refuse("transfer_not_owner", id);
    if (target.user.id === actor.id) refuse("transfer_self", id);
    refuseIfNotTeam(target, id);
    if (target.user.role === "owner") refuse("transfer_target_owner", id);
    if (target.disabledAt != null) refuse("transfer_disabled", id);

    if (!(await promoteToOwner(db, id))) refuse("transfer_raced", id);
    // A 2xx even when this misses: the promotion landed and has to reach the
    // audit trail, which records only successes. Two owners is the safe miss.
    const steppedDown = await stepDownOwner(db, actor.id, stepDownTo);

    return c.json({
      ok: true,
      ownerId: id,
      previousOwnerId: actor.id,
      previousOwnerRole: steppedDown ? stepDownTo : "owner",
      steppedDown,
    });
  });

  /* ─────────────────────────────── invites ────────────────────────────── */

  routes.get("/admin/invites", requireAdmin(), async (c) => {
    const query = readQuery(c, InviteQuery);
    /*
     * Parsed by hand rather than as an enum over repeated `?include=a&include=b`.
     * `c.req.query()` collapses repeats to the LAST value, so asking for both
     * buckets would silently get one.
     */
    const members = (query.include ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m !== "");
    const allowed = new Set(["accepted", "expired"]);
    for (const member of members) {
      if (!allowed.has(member)) {
        throw new BadRequestError("include", [
          { path: "include", message: `unknown member "${member}", expected accepted or expired` },
        ]);
      }
    }
    const items = await listInvites(await currentDb(c), members.length > 0);
    return c.json({ items });
  });

  routes.post("/admin/invites", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const actor = currentUser(c);
    const { email: address, role, stepDownTo } = await readJson(c, InviteBody);

    // Handing over ownership is the owner's alone, so it skips canAssign, which
    // refuses "owner" for everybody.
    if (role === "owner") {
      if (actor.role !== "owner") throw new ForbiddenError("only the owner can invite a new owner");
    } else if (!canAssign(actor.role, role as Role)) {
      throw new ForbiddenError(`role ${actor.role} cannot assign ${role}`);
    }
    if (stepDownTo !== undefined && role !== "owner") {
      throw new BadRequestError("stepDownTo", [
        { path: "stepDownTo", message: "only an owner invite names the role to step down to" },
      ]);
    }
    if (await findUserByEmail(db, address)) throw new DuplicateError("email", address);
    if (await findOpenInvite(db, address)) {
      throw new PreconditionFailedError("invite_open", {
        email: address,
        detail: "An open invite already exists for this address. Revoke it first to change the role.",
      });
    }

    const invite = await createInvite(db, {
      email: address,
      role: role as Role,
      invitedBy: actor.id,
      stepDownTo: role === "owner" ? (stepDownTo ?? "developer") : null,
    });
    auditEntityId(c, invite._id);

    /*
     * THE LINK CARRIES NO CREDENTIAL.
     *
     * It points at the sign-in screen, and membership is spent against the
     * address the door verifies. A forwarded invite used to be a handover of the
     * account; now it is a forwarded URL to a screen that refuses the wrong
     * person.
     *
     * Built from the DEPLOYMENT's own host, not from the request. It points at
     * a sign-in screen, so a recipient trusts it the way they trust any mail
     * from us, and a host chosen by whoever made the request is a credential
     * phishing page wearing our return address. Still nothing to configure:
     * `deploymentOrigin` reads Vercel's own variables.
     */
    const url = `${deploymentOrigin(c.req)}/admin/sign-in`;

    const emailed = await trySend(
      deps.mailer,
      {
        to: address,
        subject: `${actor.displayName} invited you to AVHomes`,
        text: [
          role === "owner"
            ? `${actor.displayName} has invited you to take over the AVHomes admin as its owner.`
            : `${actor.displayName} has invited you to the AVHomes admin as ${role}.`,
          "",
          `Sign in here: ${url}`,
          "",
          "Sign in with this same email address and you'll be sent a 6-digit code to confirm it. The invite expires in seven days.",
        ].join("\n"),
      },
      { requestId: c.get("requestId"), route: "POST /admin/invites" },
    );

    // The URL is in the response whether or not the mail went. An invite is the
    // only way a second person reaches an invite-only instance, so making it
    // depend on a working mail provider locks the team out of growing.
    return c.json(
      {
        invite: {
          id: invite._id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          url,
        },
        emailed,
      },
      201,
    );
  });

  /**
   * A code to read out by phone when the mailed one is not arriving. Replaces
   * any code already sent. Returned once and never stored in the clear; the
   * audit row keeps only the invite id, because this route takes no body.
   */
  routes.post("/admin/invites/:id/code", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const actor = currentUser(c);

    const invite = await findInvite(db, id);
    if (!invite || invite.role === "partner") throw new NotFoundError(id);
    // Whoever could not have sent this invite cannot hand over its code either.
    if (invite.role === "owner") {
      if (actor.role !== "owner") throw new ForbiddenError("only the owner can get the code for an owner invite");
    } else if (!canAssign(actor.role, invite.role)) {
      throw new ForbiddenError(`role ${actor.role} cannot assign ${invite.role}`);
    }

    const issued = await issueHandedInviteCode(db, id);
    if (!issued) {
      throw new PreconditionFailedError("invite_closed", {
        detail: "This invite has been accepted or has expired. Send a new one.",
      });
    }
    auditEntityId(c, id);
    return c.json(issued);
  });

  routes.delete("/admin/invites/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const removed = await revokeTeamInvite(await currentDb(c), id);
    if (!removed) throw new NotFoundError(id);
    return c.json({ ok: true });
  });

  return routes;
}
