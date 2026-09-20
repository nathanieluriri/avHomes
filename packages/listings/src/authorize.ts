import { ForbiddenError } from "@avhomes/core";
import { isAdminRole, isScopedRole, type AuthUser } from "@avhomes/contracts";

/**
 * Authorization, in ONE function called by every listing route.
 *
 * Not scattered through handlers, and that is the whole design. A rule inlined
 * into a handler exists once per handler: the next route is written by copying
 * the one above it, the copy is subtly different, and the difference is
 * invisible until an agent edits a listing they do not own.
 *
 * The four rules:
 *
 *  - **read**: every signed-in user reads everything, drafts included, EXCEPT a
 *    scoped role, which reads only what it owns. This is one agency with an
 *    invite-only staff list, plus outside partners who are not staff.
 *  - **write**: the listing's own agent, or an admin. An agent owns their
 *    listings; an owner can fix anything, which is what makes the role useful.
 *  - **status**: never a scoped role. A partner submits; AV Homes publishes.
 *  - **destroy**: admin only. It is the one irreversible action here, and trash
 *    is the reversible door an agent already has.
 *
 * `status` is its own action rather than a check inside `write` because a partner
 * genuinely may edit their own listing: what they may not do is decide when it
 * goes public. Folding the two together would either lock them out of their own
 * copy or hand them the publish button.
 */
export type Action = "read" | "write" | "status" | "destroy";

/**
 * Takes only what it reads. A list projection has no images and no description,
 * and typing this to the full Property would force a caller holding one to fetch
 * the whole document just to ask whether it may edit it.
 */
export function authorize(
  listing: { agentUserId: string | null },
  user: AuthUser,
  action: Action,
): boolean {
  if (action === "destroy") return isAdminRole(user.role);
  if (action === "status") return !isScopedRole(user.role);
  if (action === "read") {
    /* The one place "everyone reads everything" stops being true. A scoped role
       reads only rows it owns, and an unclaimed row belongs to nobody, so it is
       not theirs either. */
    return isScopedRole(user.role) ? listing.agentUserId === user.id : true;
  }
  // An unclaimed listing (imported, or created before agents existed) is
  // admin-only rather than everyone's, which is the safe direction to be wrong.
  if (listing.agentUserId === null) return isAdminRole(user.role);
  return listing.agentUserId === user.id || isAdminRole(user.role);
}

/**
 * The Mongo filter a LIST query adds for this caller.
 *
 * Separate from `authorize` because that answers about one record, and filtering
 * a fetched page in memory returns short pages that read as the end of the list.
 * Empty for staff, so the common path adds nothing.
 */
export function scopeFilter(user: AuthUser): Record<string, unknown> {
  return isScopedRole(user.role) ? { agentUserId: user.id } : {};
}

/** Does this caller see only their own rows? For a screen deciding what to draw. */
export function isScopedCaller(user: AuthUser): boolean {
  return isScopedRole(user.role);
}

/**
 * The same decision as a 403.
 *
 * Exists so no handler writes `if (!authorize(...)) throw ...`, which is the
 * shape that gets copied without the `!` exactly once.
 */
export function assertAuthorized(
  listing: { agentUserId: string | null },
  user: AuthUser,
  action: Action,
): void {
  if (!authorize(listing, user, action)) {
    throw new ForbiddenError(
      action === "destroy"
        ? "only an owner or developer can destroy a listing"
        : action === "status"
          ? "only AV Homes can publish or close a listing"
          : "this listing belongs to another agent",
    );
  }
}
