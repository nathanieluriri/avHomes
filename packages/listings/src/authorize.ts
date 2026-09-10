import { ForbiddenError } from "@avhomes/core";
import { isAdminRole, type AuthUser } from "@avhomes/contracts";

/**
 * Authorization, in ONE function called by every listing route.
 *
 * Not scattered through handlers, and that is the whole design. A rule inlined
 * into a handler exists once per handler: the next route is written by copying
 * the one above it, the copy is subtly different, and the difference is
 * invisible until an agent edits a listing they do not own.
 *
 * The three rules:
 *
 *  - **read**: every signed-in user reads everything, drafts included. This is
 *    one agency with an invite-only staff list, not a multi-tenant host.
 *  - **write**: the listing's own agent, or an admin. An agent owns their
 *    listings; an owner can fix anything, which is what makes the role useful.
 *  - **destroy**: admin only. It is the one irreversible action here, and trash
 *    is the reversible door an agent already has.
 */
export type Action = "read" | "write" | "destroy";

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
  if (action === "read") return true;
  if (action === "destroy") return isAdminRole(user.role);
  // An unclaimed listing (imported, or created before agents existed) is
  // admin-only rather than everyone's, which is the safe direction to be wrong.
  if (listing.agentUserId === null) return isAdminRole(user.role);
  return listing.agentUserId === user.id || isAdminRole(user.role);
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
        : "this listing belongs to another agent",
    );
  }
}
