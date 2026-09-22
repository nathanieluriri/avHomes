import type { Collection, Document } from "mongodb";
import type { Db } from "./client";

/**
 * Every collection name in one place.
 *
 * A name typed as a string literal at a call site is a name that gets misspelled
 * exactly once, and a misspelled collection in MongoDB is not an error: it is a
 * new, empty collection that reads as "all the data is gone".
 */
export const COLLECTIONS = {
  migrations: "migrations",
  users: "users",
  sessions: "sessions",
  invites: "invites",
  authAttempts: "auth_attempts",
  properties: "properties",
  testimonials: "testimonials",
  siteStats: "site_stats",
  posts: "posts",
  postRevisions: "post_revisions",
  categories: "categories",
  images: "images",
  enquiries: "enquiries",
  visits: "visits",
  subscribers: "subscribers",
  settings: "settings",
  designNotes: "design_notes",
  audit: "audit",
  tutorialProgress: "tutorial_progress",
  notifications: "notifications",
  quotaRequests: "quota_requests",
  emailTemplates: "email_templates",
  newsletters: "newsletters",
  templateRequests: "template_requests",
  marketers: "marketers",
  marketingDeals: "marketing_deals",
  marketingLedger: "marketing_ledger",
  marketingPayRuns: "marketing_pay_runs",
  marketingIssues: "marketing_issues",
  marketingUpdates: "marketing_updates",
  marketingLeads: "marketing_leads",
  /* The two pots that belong to nobody. Their own collection rather than rows in
     marketing_ledger, because reconcile() proves that one balances against what
     marketers are owed and a row with no person behind it would break it. */
  fundLedger: "fund_ledger",
  rewardAwards: "reward_awards",
  listingViews: "listing_views",
  partnerApplications: "partner_applications",
  /* Partner companies. Their accounts are users rows carrying the company's id. */
  partners: "partners",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Typed handle. The generic is the stored document shape, not the wire shape. */
export function collection<T extends Document>(db: Db, name: CollectionName): Collection<T> {
  return db.collection<T>(name);
}

/**
 * Documents carry a string `_id`, never an ObjectId.
 *
 * An ObjectId serialises differently depending on the path it takes to JSON, so
 * the id in a URL and the id in a document stop being the same bytes. A prefixed
 * lexicographically-sortable string is the same value everywhere and doubles as
 * the keyset tiebreaker with no conversion.
 */
export interface BaseDoc {
  _id: string;
  createdAt: number;
  updatedAt: number;
}

/** Mutable aggregates carry a monotonic revision. It is the CAS token. */
export interface VersionedDoc extends BaseDoc {
  revision: number;
  /** Non-null means in the trash. Soft delete is a timestamp, never a boolean. */
  deletedAt: number | null;
}
