import type { Db } from "@avhomes/db";
import type { AuthUser } from "@avhomes/contracts";
import { claimInvite, releaseInvite } from "./repo/invites";
import { createUser, findUserByEmail } from "./repo/users";

/**
 * The ONE membership decision, shared by both doors.
 *
 * Each door proves WHO you are; this decides whether this instance knows you.
 * Clerk owns authentication, the password door owns authentication, and neither
 * owns membership. That separation is what keeps an invite-only instance
 * invite-only when a Clerk sign-up succeeds for an address nobody invited.
 *
 * A seam here rather than an `AuthenticatorPort`, because the two doors take
 * genuinely different inputs (a JWT versus a password) and forcing them through
 * one `verify(credential)` interface would be an abstraction that describes
 * nothing.
 */

export type AdmitRefusal = "not_invited" | "disabled";

export type AdmitResult = { ok: true; user: AuthUser } | { ok: false; reason: AdmitRefusal };

export interface Identity {
  email: string;
  /** A verified account with no profile name is ordinary. Resolved below. */
  name?: string | undefined;
}

export async function admit(db: Db, identity: Identity): Promise<AdmitResult> {
  const address = identity.email.trim().toLowerCase();
  if (address === "") return { ok: false, reason: "not_invited" };

  const found = await findUserByEmail(db, address);

  /*
   * A DISABLED ACCOUNT IS REFUSED BEFORE THE INVITE IS CONSULTED.
   *
   * A revoked teammate whose old invite row survived must not walk back in by
   * signing in again. Checking membership first and disabled-ness second is the
   * ordering that lets exactly that happen.
   */
  if (found && found.disabledAt != null) return { ok: false, reason: "disabled" };
  if (found) return { ok: true, user: found.user };

  const invite = await claimInvite(db, address);
  if (!invite) return { ok: false, reason: "not_invited" };

  // `createUser` refuses a blank name, and a Google account without one is
  // ordinary, so the local part is the fallback and it is resolved HERE rather
  // than inside the repository, which has no better answer to give.
  const displayName = (identity.name ?? "").trim() || address.split("@")[0] || address;

  try {
    const user = await createUser(db, { email: address, displayName, role: invite.role });
    return { ok: true, user };
  } catch (err) {
    // Hand the invite back rather than burning it, and only if nothing else
    // claimed it meanwhile. Two exchanges for one address, racing.
    if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
    throw err;
  }
}

/** The 403 body both doors return, so a screen has one sentence to render. */
export function refusalBody(reason: AdmitRefusal): { error: string; reason: AdmitRefusal; detail: string } {
  return {
    error: "forbidden",
    reason,
    detail:
      reason === "disabled"
        ? "This account has been disabled. Ask an owner to re-enable it."
        : "This address has not been invited. Ask an owner or developer for an invite.",
  };
}
