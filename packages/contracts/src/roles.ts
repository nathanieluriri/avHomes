/**
 * The permission matrix, read by the server's domain gate AND by the admin's
 * role picker.
 *
 * One file, so what a role is described as doing and what it is allowed to do
 * cannot drift apart. That drift is the failure mode of every hand-maintained
 * permissions page.
 */

export type Role = "owner" | "developer" | "agent" | "editor" | "support";

/**
 * A domain is a whole area of the admin, not a verb. Read/write splits are the
 * matrices nobody keeps correct.
 */
export type Domain =
  | "listings" // properties, agents, testimonials, site stats
  | "content" // blog posts, categories, featured
  | "media" // image library
  | "enquiries" // the contact inbox
  | "analytics" // dashboard reads
  | "team" // users and invites
  | "danger"; // destroy, export, migrations

export interface RoleInfo {
  label: string;
  tagline: string;
  description: string;
  grants: "all" | readonly Domain[];
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  owner: {
    label: "Owner",
    tagline: "Everything, including the endings",
    description:
      "Full access to every surface, plus the destructive ones. Exactly one per site. Can remove anyone except themselves.",
    grants: "all",
  },
  developer: {
    label: "Developer",
    tagline: "Owner-grade access, several allowed",
    description:
      "The same access as the owner across every surface. Cannot remove, demote or create an owner or another developer.",
    grants: "all",
  },
  agent: {
    label: "Agent",
    tagline: "Listings and the buyers behind them",
    description:
      "Creates and edits their own property listings, uploads their photography, and works the enquiry inbox.",
    grants: ["listings", "media", "enquiries", "analytics"],
  },
  editor: {
    label: "Editor",
    tagline: "The journal",
    description: "Writes and publishes blog posts, and manages the image library they draw on.",
    grants: ["content", "media"],
  },
  support: {
    label: "Support",
    tagline: "Enquiries and the numbers",
    description: "Answers enquiries and reads the dashboard. Changes nothing on the public site.",
    grants: ["enquiries", "analytics"],
  },
};

/** Every role an API caller may hand out. `owner` is never mintable. */
export const ASSIGNABLE_ROLES = ["developer", "agent", "editor", "support"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ALL_ROLES = ["owner", ...ASSIGNABLE_ROLES] as const;

export function isRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value);
}

export function hasDomain(role: Role, domain: Domain): boolean {
  const grants = ROLE_INFO[role]?.grants;
  if (grants === "all") return true;
  return Array.isArray(grants) ? grants.includes(domain) : false;
}

/** The full-access tier requireAdmin() reads. "Owner or developer", once. */
export function isAdminRole(role: Role): boolean {
  return role === "owner" || role === "developer";
}

/** May actor disable, enable or re-role an account holding target? */
export function canManage(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "developer") return target !== "owner" && target !== "developer";
  return false;
}

/** May actor hand out next, on an invite or on a role change? */
export function canAssign(actor: Role, next: Role): boolean {
  if (next === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "developer") return next !== "developer";
  return false;
}
