/**
 * The permission matrix, read by the server's domain gate AND by the admin's
 * role picker.
 *
 * One file, so what a role is described as doing and what it is allowed to do
 * cannot drift apart. That drift is the failure mode of every hand-maintained
 * permissions page.
 */

export type Role = "owner" | "developer" | "agent" | "editor" | "support" | "marketer";

/**
 * A domain is a whole area of the admin, not a verb. Read/write splits are the
 * matrices nobody keeps correct.
 */
export type Domain =
  | "listings" // properties, agents, testimonials, site stats
  | "content" // blog posts, categories, featured, customize studio notes
  | "media" // image library
  | "enquiries" // the contact inbox
  | "analytics" // dashboard reads
  | "team" // users and invites
  | "marketing" // marketers, the deals they report, pay runs and commission rates
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
    description:
      "Writes and publishes blog posts, manages the image library they draw on, and logs change notes for the developer in the customize studio: creates, replies to, updates the status of and deletes them.",
    grants: ["content", "media"],
  },
  support: {
    label: "Support",
    tagline: "Enquiries and the numbers",
    description: "Answers enquiries and reads the dashboard. Changes nothing on the public site.",
    grants: ["enquiries", "analytics"],
  },
  marketer: {
    label: "Marketer",
    tagline: "Sells property, earns commission",
    description:
      "Works from the marketer app on their phone, not the console. Reports the deals they close, invites other marketers and watches what they have earned.",
    /* Nothing. A marketer's app reads its own routes under /api/marketing,
       which the domain gate leaves alone, and holds no admin surface at all. */
    grants: [],
  },
};

/**
 * Every role an API caller may hand out. `owner` is never mintable, and neither
 * is `marketer`: that one is minted by signing up in the marketer app, and
 * handing it to a console account would take that person's console away.
 */
export const ASSIGNABLE_ROLES = ["developer", "agent", "editor", "support"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ALL_ROLES = ["owner", ...ASSIGNABLE_ROLES, "marketer"] as const;

export function isRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value);
}

export function hasDomain(role: Role, domain: Domain): boolean {
  const grants = ROLE_INFO[role]?.grants;
  if (grants === "all") return true;
  return Array.isArray(grants) ? grants.includes(domain) : false;
}

/** Does this role belong in the console at all? A marketer does not. */
export function isConsoleRole(role: Role): boolean {
  return role !== "marketer";
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
