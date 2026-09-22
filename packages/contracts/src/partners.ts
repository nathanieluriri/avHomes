import { isScopedRole, type PartnerRole, type Role } from "./roles";
import type { PropertyStatus } from "./types";

/*
 * A partner is a company. Its accounts share its listings, inside three limits
 * AV Homes sets, and one function decides what any account may see of them.
 */

export const PARTNER_STATUSES = ["active", "suspended"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  active: "Active",
  suspended: "Suspended",
};

export const PARTNER_LIMIT_KEYS = ["review", "live", "staff"] as const;
export type PartnerLimitKey = (typeof PARTNER_LIMIT_KEYS)[number];
export type PartnerLimits = Record<PartnerLimitKey, number>;
/** A company's own values. Null takes the default from Partners settings. */
export type PartnerLimitOverrides = Record<PartnerLimitKey, number | null>;

export const DEFAULT_PARTNER_LIMITS: PartnerLimits = { review: 3, live: 10, staff: 3 };

/** The largest value a limit field accepts, so a typo cannot open the gates. */
export const PARTNER_LIMIT_MAX = 500;

export const PARTNER_LIMIT_LABEL: Record<PartnerLimitKey, string> = {
  review: "Not yet approved",
  live: "Live",
  staff: "Staff",
};

export const PARTNER_LIMIT_HINT: Record<PartnerLimitKey, string> = {
  review: "Drafts plus listings waiting for AV Homes",
  live: "Live plus under offer. Sold is not counted",
  staff: "Staff accounts plus open invites, not the main account",
};

/** The statuses each listing limit counts, trash excluded. */
export const REVIEW_LIMIT_STATUSES: readonly PropertyStatus[] = ["draft", "submitted"];
export const LIVE_LIMIT_STATUSES: readonly PropertyStatus[] = ["live", "under-offer"];

export interface Partner {
  id: string;
  /** Printed after "Listed by" in pass two. Only AV Homes changes it. */
  name: string;
  contactName: string;
  /** Where review decisions and buyer threads are mailed. */
  contactEmail: string;
  contactPhone: string;
  status: PartnerStatus;
  /** Why it was last suspended or reinstated. The partner reads it. */
  statusReason: string;
  limits: PartnerLimitOverrides;
  /** Null until the main person first signs in. */
  mainUserId: string | null;
  /** Null for a company the migration made from an account with no application. */
  applicationId: string | null;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export type PartnerUsage = Record<PartnerLimitKey, number>;

export interface PartnerAccount {
  id: string;
  email: string;
  displayName: string;
  partnerRole: PartnerRole;
  disabledAt: number | null;
  /** The newest `lastSeenAt` among its sessions. Null when it has none. */
  lastActiveAt: number | null;
  createdAt: number;
}

export interface PartnerInvite {
  id: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

/** One row of the Partners list. */
export interface PartnerRow {
  partner: Partner;
  limits: PartnerLimits;
  usage: PartnerUsage;
  accounts: number;
}

/** One partner's page, for AV Homes. */
export interface PartnerDetail {
  partner: Partner;
  limits: PartnerLimits;
  defaults: PartnerLimits;
  usage: PartnerUsage;
  accounts: PartnerAccount[];
  invites: PartnerInvite[];
}

/** The partner's own Company and Staff screens. */
export interface CompanyView {
  partner: Partner;
  limits: PartnerLimits;
  usage: PartnerUsage;
  accounts: PartnerAccount[];
  invites: PartnerInvite[];
  viewer: { userId: string; partnerRole: PartnerRole };
}

export interface PartnerSettings {
  limits: PartnerLimits;
  updatedAt: number;
}

/** A company's own value where it has one, the default where it has none. */
export function effectiveLimits(own: PartnerLimitOverrides, defaults: PartnerLimits): PartnerLimits {
  return {
    review: own.review ?? defaults.review,
    live: own.live ?? defaults.live,
    staff: own.staff ?? defaults.staff,
  };
}

/** An id no document carries. A scoped account without a company scopes to it. */
export const NO_PARTNER = "ptnr_none";

/**
 * The company this account is confined to, or null when it is not confined.
 *
 * Null means every row, and only an unscoped role gets it. A scoped role with
 * no company gets NO_PARTNER, so a broken account reads nothing rather than
 * everything.
 */
export function partnerScopeOf(user: { role: Role; partnerId: string | null }): string | null {
  if (!isScopedRole(user.role)) return null;
  return user.partnerId || NO_PARTNER;
}

const REFUSAL_TAIL: Record<PartnerLimitKey, Record<"partner" | "av", string>> = {
  review: {
    partner: "Send one for review or delete a draft first.",
    av: "Raise their limit, or wait for one to be approved.",
  },
  live: {
    partner: "Mark one sold or take one down first.",
    av: "Raise their limit, or wait for one to come down.",
  },
  staff: {
    partner: "Remove somebody or revoke an invite first.",
    av: "Raise their limit first.",
  },
};

const NOUN: Record<PartnerLimitKey, [string, string]> = {
  review: ["listing not yet approved", "listings not yet approved"],
  live: ["live listing", "live listings"],
  staff: ["staff seat in use", "staff seats in use"],
};

/** The sentence a refused action shows, to the partner or to AV Homes. */
export function limitRefusal(
  limit: PartnerLimitKey,
  count: number,
  max: number,
  audience: "partner" | "av",
): string {
  const noun = NOUN[limit][count === 1 ? 0 : 1];
  const lead = audience === "partner" ? `You have ${count} ${noun}` : `This partner has ${count} ${noun}`;
  const whose = audience === "partner" ? "your" : "their";
  return `${lead}, ${whose} limit of ${max}. ${REFUSAL_TAIL[limit][audience]}`;
}

// TODO(test): partnerScopeOf returns null for every unscoped role, the company
// for a partner, and NO_PARTNER for a partner with none.
