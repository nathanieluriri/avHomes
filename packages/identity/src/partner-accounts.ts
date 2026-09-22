import type { Db } from "@avhomes/db";
import type { Agent, AuthUser, Partner } from "@avhomes/contracts";
import { disableUser, findUserById } from "./repo/users";
import { endAllSessions } from "./repo/sessions";

/** What identity needs from listings, injected at packages/api. */
export interface PartnerPorts {
  listingUsage: (db: Db, partnerIds: readonly string[]) => Promise<Map<string, { review: number; live: number }>>;
  holdListings: (db: Db, partnerId: string, held: boolean) => Promise<number>;
  reassignListings: (db: Db, input: { partnerId: string; fromUserId: string; to: Agent }) => Promise<number>;
}

/** The contact card an account would put on a listing. */
export function agentCardOf(user: AuthUser): Agent {
  return {
    id: user.id,
    name: user.displayName,
    role: user.title || "Sales agent",
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Takes one staff account out of a company: disabled, every session ended,
 * then its listings and cards handed to the main account.
 *
 * In that order, like the team screen's disable: the account is safe before
 * the slow bulk update runs.
 */
export async function offboardPartnerAccount(
  db: Db,
  partner: Partner,
  userId: string,
  reassign: PartnerPorts["reassignListings"],
): Promise<{ sessionsEnded: number; listingsMoved: number }> {
  await disableUser(db, userId);
  const sessionsEnded = await endAllSessions(db, userId);
  const main = partner.mainUserId ? await findUserById(db, partner.mainUserId) : null;
  const listingsMoved = main
    ? await reassign(db, { partnerId: partner.id, fromUserId: userId, to: agentCardOf(main.user) })
    : 0;
  return { sessionsEnded, listingsMoved };
}
