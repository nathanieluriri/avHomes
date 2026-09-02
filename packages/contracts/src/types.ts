import type { Role } from "./roles";
import type { DocNode } from "./doc";

/* ─────────────────────────────── identity ─────────────────────────────── */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface TeamUser extends AuthUser {
  createdAt: number;
  /** Non-null means revoked. Sessions were destroyed with it. */
  disabledAt: number | null;
  listingCount: number;
  postCount: number;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  invitedBy: string;
  invitedByName: string;
  /** The SERVER's verdict, derived from the same clock the filter used. Never re-derive. */
  state: "open" | "accepted" | "expired";
}

export interface SessionSummary {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgent: string | null;
  current: boolean;
}

/* ─────────────────────────────── listings ─────────────────────────────── */

export const PROPERTY_STATUSES = ["draft", "for-sale", "for-rent", "sold", "archived"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_TYPES = [
  "Villa",
  "Apartment",
  "Duplex",
  "Townhouse",
  "Studio",
  "Penthouse",
  "Bungalow",
  "Mansion",
  "Terrace",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Only these reach the public site. Draft and archived are admin-only. */
export const PUBLIC_PROPERTY_STATUSES: readonly PropertyStatus[] = ["for-sale", "for-rent", "sold"];

export interface Agent {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  avatarUrl: string;
}

export interface Property {
  id: string;
  slug: string | null;
  title: string;
  tagline: string;
  description: string;
  /** Integer minor units (kobo). 100 per naira. Never a float. */
  priceMinor: number;
  currency: string;
  status: PropertyStatus;
  type: PropertyType;
  location: string;
  city: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  parkingSpaces: number;
  yearBuilt: number;
  featured: boolean;
  amenities: string[];
  images: string[];
  agent: Agent;
  /** The account that owns this listing, for per-record authorization. */
  agentUserId: string | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  deletedAt: number | null;
  revision: number;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  initials: string;
  position: number;
}

export interface SiteStat {
  id: string;
  /** Numeric target the counter animates toward. */
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  position: number;
}

/* ──────────────────────────────── content ─────────────────────────────── */

export const POST_STATUSES = ["draft", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const READING_TEMPLATES = ["magazine", "minimal", "editorial", "technical"] as const;
export type ReadingTemplate = (typeof READING_TEMPLATES)[number];

export interface CoverImage {
  /** Relative: /api/public/images/<id>. Always pass through imageUrl(). */
  url: string;
  alt: string;
  focalPoint: string;
  width: number;
  height: number;
}

export interface PublicPost {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: CoverImage | null;
  category: string;
  tags: string[];
  template: ReadingTemplate | null;
  publishedAt: number;
  updatedAt: number;
  wordCount: number;
  readingTime: number;
  author: { name: string };
}

export interface PublicPostDetail extends PublicPost {
  content: DocNode;
}

export interface PublicPostList {
  items: PublicPost[];
  nextCursor: string | null;
}

/** The admin projection. Carries drafts, ownership and the CAS token. */
export interface Post extends Omit<PublicPost, "publishedAt"> {
  status: PostStatus;
  content: DocNode;
  publishedAt: number | null;
  createdAt: number;
  deletedAt: number | null;
  authorId: string;
  revision: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  accent: string;
  position: number;
}

/* ──────────────────────────────── media ───────────────────────────────── */

export interface ImageRecord {
  id: string;
  url: string;
  alt: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  uploadedBy: string;
}

/* ─────────────────────────────── enquiries ────────────────────────────── */

export const ENQUIRY_STATUSES = ["new", "open", "closed", "spam"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  /** Set when the enquiry came from a property page. */
  propertyId: string | null;
  propertySlug: string | null;
  status: EnquiryStatus;
  createdAt: number;
  updatedAt: number;
  handledBy: string | null;
  handledByName: string | null;
  note: string | null;
  revision: number;
}

/* ─────────────────────────────── analytics ────────────────────────────── */

export interface SitePulse {
  /** Sessions whose last beacon landed inside the live window (five minutes). */
  live: number;
  /** Sessions in the last 30 days. A session is a tab, not a person. */
  sessions: number;
  /** The 30 days before those, so a trend is two measured windows. */
  previousSessions: number;
  /** Exactly 30 entries, oldest first, UTC days, ZERO-FILLED. */
  series: { day: string; sessions: number }[];
  /** Page views across the sessions counted above. */
  views: number;
}

/* ───────────────────────────── shared paging ──────────────────────────── */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
