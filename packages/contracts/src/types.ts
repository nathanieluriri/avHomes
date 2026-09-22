import type { PartnerRole, Role } from "./roles";
import type { DocNode } from "./doc";

/* ─────────────────────────────── identity ─────────────────────────────── */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /**
   * The face a buyer sees in a chat. Empty until somebody uploads one, which is
   * exactly the state the console nags about: an enquiry answered by a blank
   * circle reads as an autoresponder, and the whole point of the thread is that
   * a person is on the other end.
   */
  avatarUrl: string;
  /** The line under the name. "Senior Property Consultant", not the role slug. */
  title: string;
  phone: string;
  /** The partner company this account works for. Null for AV Homes' own accounts. */
  partnerId: string | null;
  /** "main" manages the company's staff and details. Null outside a company. */
  partnerRole: PartnerRole | null;
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

/** Lifecycle only. What kind of deal a listing is lives in ListingType, not here. */
export const PROPERTY_STATUSES = [
  "draft",
  "submitted",
  "live",
  "under-offer",
  "closed",
  "archived",
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/**
 * Whose property this is, which is the only thing the commission rate depends on
 * besides sale versus rent.
 *
 * Deliberately NOT derived from `agentUserId`. An AV Homes agent can list a
 * partner's property for an owner who holds no account, and a partner account
 * can only ever hold its own, so the two fields answer different questions.
 * Collapsing them would make the rate depend on which account typed the listing
 * in.
 */
export const OWNERSHIPS = ["av", "partner"] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

/** The reader's vocabulary. "Non-AV" is the owner's own word for it. */
export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  av: "AV Homes",
  partner: "Non-AV",
};

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
  "Estate Land",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * A development sold as one listing with several options inside it (Kuje Estate:
 * a 2 bed, a 3 bed, a 500 sqm plot). Always a sale. Its own price and bedroom
 * count are DERIVED from its prototypes on save; see `estateSummary`.
 */
export const ESTATE_TYPE = "Estate Land" satisfies PropertyType;

/** A prototype is a house design on a plot, or the bare plot. */
export const PROTOTYPE_KINDS = ["house", "plot"] as const;
export type PrototypeKind = (typeof PROTOTYPE_KINDS)[number];

export const PROTOTYPES_MAX = 20;

export interface EstatePrototype {
  /** Stable across edits, so a React key and an enquiry can name one. `pt_` + random. */
  id: string;
  kind: PrototypeKind;
  /** "2 bedroom semi-detached bungalow", "500 sqm plot". */
  name: string;
  /** Zero on a plot. */
  bedrooms: number;
  bathrooms: number;
  /** Plot size for a plot, built-up area for a house. Square metres, not feet. */
  sizeSqm: number;
  priceMinor: number;
  /** One render or photo. Null shows the estate's lead photo instead. */
  image: string | null;
  /** False is "sold out". The row stays on the page so buyers see what sold. */
  available: boolean;
}

/** Deposit up front, the balance spread evenly across `months`. */
export interface PaymentPlan {
  /** Whole percent, 1 to 100. */
  depositPercent: number;
  /** Months the balance is spread over, 1 to 120. */
  months: number;
  /** "No interest", "Allocation after 50%". Optional. */
  note: string;
}

export const BUILD_STAGES = ["off-plan", "under-construction", "completed"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];

/** What a buyer asks first in Nigeria: what paper backs this land. */
export const TITLE_DOCUMENTS = [
  "c-of-o",
  "r-of-o",
  "governors-consent",
  "deed-of-assignment",
  "excision",
  "gazette",
] as const;
export type TitleDocument = (typeof TITLE_DOCUMENTS)[number];

export const FURNISHINGS = ["furnished", "semi-furnished", "unfurnished"] as const;
export type Furnishing = (typeof FURNISHINGS)[number];

/**
 * The statuses a listing may be featured in. Featuring a draft shows nothing,
 * and featuring a sold house advertises something nobody can buy. Leaving these
 * statuses clears the flag on the server.
 */
export const FEATURABLE_STATUSES: readonly PropertyStatus[] = ["live", "under-offer"];

/** Only these reach the public site. Draft and archived are admin-only. */
export const PUBLIC_PROPERTY_STATUSES: readonly PropertyStatus[] = ["live", "under-offer", "closed"];

export const LISTING_TYPES = ["sale", "rent"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const RENT_PERIODS = ["year", "month", "night"] as const;
export type RentPeriod = (typeof RENT_PERIODS)[number];

export const FEE_KINDS = ["agency", "legal", "caution", "service-charge"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

/** Recurs with the rent rather than being paid once at move in. */
export const RECURRING_FEE_KINDS: readonly FeeKind[] = ["service-charge"];

/** Which fee kinds a listing of each type can carry. */
export const FEE_KINDS_FOR: Record<ListingType, readonly FeeKind[]> = {
  sale: ["agency", "legal"],
  rent: ["agency", "legal", "caution", "service-charge"],
};

export interface ListingFee {
  kind: FeeKind;
  amountMinor: number;
  /** Defaults to the listing's currency. Stored so a fee can disagree. */
  currency: string;
}

export interface PriceChange {
  at: number;
  fromMinor: number;
  toMinor: number;
  currency: string;
  byUserId: string | null;
  /** SNAPSHOT of who changed it, as EnquiryMessage.authorName is. */
  byName: string;
}

export const PRICE_HISTORY_MAX = 50;

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
  /** Whose property this is. Absent on a legacy row, which reads as "av". */
  ownership: Ownership;
  /**
   * The external owner or developer, for grouping stock by where it came from.
   * Empty when not stated, and meaningless on an `av` listing.
   */
  ownerLabel: string;
  /**
   * The deal that closed it, so the listing draws its own sale in one read.
   * Written only by the one flow that closes a listing, never by hand.
   */
  closedDealId: string | null;
  listingType: ListingType;
  /** Null on a sale. Absent on a legacy row; see readRentPeriod. */
  rentPeriod: RentPeriod | null;
  fees: ListingFee[];
  priceHistory: PriceChange[];
  type: PropertyType;
  location: string;
  city: string;
  address: string;
  /**
   * The Google Maps link an operator pasted, expanded from a share link on
   * save. Empty means none, and the site falls back to searching the address.
   */
  mapUrl: string;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  parkingSpaces: number;
  yearBuilt: number;
  featured: boolean;
  amenities: string[];
  images: string[];
  /** Estate Land only; empty on every other type. See `fieldsFor`. */
  prototypes: EstatePrototype[];
  /** Estate Land only. */
  paymentPlan: PaymentPlan | null;
  /** Estate Land only. Replaces `yearBuilt`, which an off-plan estate does not have. */
  buildStage: BuildStage | null;
  /** Sales only, estates included. Null means not stated. */
  titleDocument: TitleDocument | null;
  /** Rent only. Null means not stated. */
  furnishing: Furnishing | null;
  /** Rent only. Cleaning, power and upkeep are in the service charge. */
  serviced: boolean;
  /** Rent only. Epoch ms at UTC midnight. Null means available now. */
  availableFrom: number | null;
  /** Rent only. Months on a yearly or monthly rent, nights on a shortlet. Null means no minimum. */
  minStay: number | null;
  /** The search result's title. Empty means the listing title. */
  seoTitle: string;
  /** The search result's description. Empty means one assembled from the facts. */
  seoDescription: string;
  /** Web addresses this listing used to have. Each one redirects to `slug`. */
  previousSlugs: string[];
  agent: Agent;
  /** The account that owns this listing, for per-record authorization. */
  agentUserId: string | null;
  /**
   * The partner company whose listing this is. Null for AV Homes' own, and for
   * Non-AV property an AV Homes agent typed in for an owner with no account.
   */
  partnerId: string | null;
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
export interface Post extends Omit<PublicPost, "publishedAt" | "slug"> {
  /**
   * NULL UNTIL PUBLISH DERIVES ONE, unlike the public projection.
   *
   * `toPublicPost` substitutes the id when a slug is missing, which is right
   * there: a published post always has one, and the fallback keeps a malformed
   * row from crashing a page. The admin list is the opposite case. It carries
   * drafts, so substituting the id makes every draft claim `/posts/<id>` as its
   * address, which is a URL that answers 404, and it makes the "no slug yet"
   * copy every admin screen writes for this case unreachable.
   */
  slug: string | null;
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

/**
 * How the enquiry arrived.
 *
 * `form` is the one-shot contact form: a message with no expectation of a reply
 * in the page. `chat` is a live thread the visitor can come back to. They share
 * a collection because they are the same object to whoever works the inbox, and
 * splitting them would mean two unread counts and two places to miss one.
 */
export const ENQUIRY_CHANNELS = ["form", "chat"] as const;
export type EnquiryChannel = (typeof ENQUIRY_CHANNELS)[number];

export interface EnquiryMessage {
  id: string;
  /** Never an account id. A thread has exactly two sides. */
  from: "visitor" | "agent";
  body: string;
  createdAt: number;
  /**
   * SNAPSHOT, not a join. What the visitor was told at the time this was sent.
   * Flipping the site to a team identity must not silently rewrite the name on
   * messages a buyer has already read, or on the transcript already in their
   * inbox.
   */
  authorName: string;
}

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** The opening message. Also `messages[0]`, kept flat for the inbox preview. */
  message: string;
  channel: EnquiryChannel;
  messages: EnquiryMessage[];
  /** Set when the enquiry came from a property page. */
  propertyId: string | null;
  propertySlug: string | null;
  propertyTitle: string | null;
  /**
   * The marketer code, such as AV-0042, on the shared link this visitor arrived
   * through in the same browser session. Unverified: it says which link was
   * followed, not that the marketer is owed anything.
   */
  referralCode: string | null;
  status: EnquiryStatus;
  createdAt: number;
  updatedAt: number;
  /** When the visitor last wrote. Null on a thread nobody has answered yet. */
  lastVisitorAt: number | null;
  lastAgentAt: number | null;
  handledBy: string | null;
  handledByName: string | null;
  note: string | null;
  revision: number;
}

/** What the VISITOR is allowed to see of their own thread. No inbox metadata. */
export interface EnquiryThread {
  id: string;
  status: EnquiryStatus;
  propertyTitle: string | null;
  messages: EnquiryMessage[];
  /** Who is answering, as the visitor should be told. Null before a first reply. */
  agentName: string | null;
  agentAvatarUrl: string | null;
  updatedAt: number;
}

/* ─────────────────────────────── settings ─────────────────────────────── */

/**
 * Whose name goes on a reply.
 *
 * `individual` signs with the person who typed it. `team` signs everything with
 * one name, which is what an agency wants when staff turn over and a buyer
 * should not be able to tell that the person they spoke to last month has left.
 */
export const REPLY_IDENTITIES = ["individual", "team"] as const;
export type ReplyIdentity = (typeof REPLY_IDENTITIES)[number];

/**
 * The platforms the footer and the mobile sheet draw an icon for.
 *
 * A fixed list rather than free text, because each one needs a hand-drawn SVG
 * and an unknown platform would render an empty hole. Adding one means adding
 * an icon, which is the point of making it a closed set.
 */
export const SOCIAL_PLATFORMS = ["linkedin", "instagram", "facebook", "x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** A staffed address a visitor can turn up to. */
export interface Office {
  label: string;
  address: string;
}

/**
 * A client the site names in its trust strip.
 *
 * The logo is required. The strip previously named five companies against image
 * paths that did not exist, which rendered the one band whose whole job is
 * credibility as plain scrolling text. A client with no logo is not shown.
 */
export interface ClientLogo {
  name: string;
  imageUrl: string;
}

/**
 * The search work that happens off this site, recorded here because the site
 * has no way to see it.
 *
 * EVERY FIELD IS AN ARTIFACT, never a checkbox. A verification token exists
 * only after Google has accepted that you own the domain, and a Business
 * Profile URL resolves only once the map listing is verified. Each one is
 * rendered into a public page, so a value typed here is a value a crawler reads
 * back, and an invented one fails somewhere visible rather than quietly marking
 * a chore done.
 *
 * That is why these live in settings and not in a to-do list. The alerts in
 * `site-health.ts` may not describe work the console cannot clear, and this is
 * the console clearing it.
 */
export interface SeoSettings {
  /**
   * The `content` of the google-site-verification tag, without the tag around
   * it. Pasting the whole tag is accepted and unwrapped on save, because that
   * is what Google's own copy button puts on the clipboard.
   *
   * Empty means Search Console has never been connected, so nothing reports
   * which searches reach the site, which pages failed to index, or whether the
   * sitemap has ever been read.
   */
  googleVerification: string;
  /**
   * The public Google Business Profile URL, which is also the agency's entry in
   * `sameAs` on the organisation record the site publishes.
   *
   * Empty means no map result and no knowledge panel, and local property search
   * mostly starts and finishes there.
   */
  googleBusinessProfileUrl: string;
}

export interface SiteSettings {
  replyIdentity: ReplyIdentity;
  /** The name used when `replyIdentity` is `team`. */
  teamName: string;
  /** The avatar shown beside that name. Empty falls back to an initial. */
  teamAvatarUrl: string;
  /**
   * Owner-supplied contact facts. Empty means NOT SET, and every surface that
   * renders one hides its block rather than printing a placeholder. A site with
   * no phone number reads better than a site with a fake one, and a fake one is
   * what these fields exist to stop shipping.
   */
  contactPhone: string;
  contactEmail: string;
  /** Digits only, country code first, no `+`. Empty disables every wa.me link. */
  whatsappNumber: string;
  offices: Office[];
  clientLogos: ClientLogo[];
  /**
   * Profile URLs, keyed by platform. Empty means the icon is not drawn.
   *
   * These were hardcoded, and two of the four pointed at `linkedin.com` and
   * `facebook.com`, the sites' own front pages rather than any profile. An icon
   * that looks like a link to your company and lands on a login wall is the
   * same broken promise as the placeholder phone number.
   */
  social: Record<SocialPlatform, string>;
  /** See SeoSettings. All empty is the shape of a site nobody has listed yet. */
  seo: SeoSettings;
  updatedAt: number;
  revision: number;
}

/* ──────────────────────────── design notes ───────────────────────────── */

/**
 * The customize studio's unit of work.
 *
 * A note is a FROZEN PICTURE plus something said about it. The picture is the
 * anchor, deliberately: the alternative was pinning a note to a CSS selector and
 * a scroll offset, which survives an edit to the copy and then silently points
 * at nothing the day the section is rebuilt. A screenshot can go stale, but it
 * always renders, and "here is exactly what I was looking at" is the thing a
 * developer actually needs six weeks later.
 */
export const NOTE_STATUSES = ["open", "in-progress", "done", "declined"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const NOTE_KINDS = ["markup", "copy"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const MARK_KINDS = ["pen", "ellipse", "rect", "arrow"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface NoteMark {
  kind: MarkKind;
  color: string;
  /**
   * Flat [x, y, x, y, ...] NORMALISED to 0..1 against the shot.
   *
   * Normalised rather than pixels because the same note is drawn at three sizes:
   * a sidebar thumbnail, the review pane, and full screen. Pixel coordinates
   * would need the render scale threaded through every one of them, and the
   * first place that forgot would draw a circle a hundred pixels off the thing
   * it was circling.
   */
  points: number[];
}

export interface NoteAttachment {
  /** Uploaded stills go through the image pipeline; video is a link. */
  kind: "image" | "link";
  url: string;
  label: string;
}

/** The trail. Every status move and every reply, in the order they happened. */
export interface NoteEvent {
  id: string;
  at: number;
  byName: string;
  kind: "comment" | "status";
  text: string;
}

export interface DesignNote {
  id: string;
  /** The pathname the shot was taken on, so notes group by page. */
  path: string;
  kind: NoteKind;
  comment: string;
  /** For a `copy` note: the words as they were, and as they should be. */
  copyBefore: string | null;
  copyAfter: string | null;
  shotUrl: string;
  shotWidth: number;
  shotHeight: number;
  marks: NoteMark[];
  attachments: NoteAttachment[];
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  createdByName: string;
  events: NoteEvent[];
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

/* ───────────────────────────────── audit ──────────────────────────────── */

/** The entity kinds an audit entry can name. See the spec's derivation table. */
export const AUDIT_ENTITIES = [
  "property", "post", "category", "image", "enquiry", "user", "invite",
  "testimonial", "stat", "note", "settings", "session", "auth",
  "marketer", "deal", "lead", "payrun", "update",
  "fund", "award", "application", "unknown",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export interface AuditEntry {
  id: string;
  /** Epoch ms, like every other timestamp here. */
  at: number;
  /** SNAPSHOT of the actor, not a join. A renamed or deleted user must not
   *  rewrite who did a thing last year. */
  actorId: string;
  actorName: string;
  actorRole: Role;
  /** "property", "post", "user", "enquiry", ... see the derivation table. */
  entity: AuditEntity;
  /** The record's id, or null where there is not one. See the table. */
  entityId: string | null;
  /** "create" | "update" | "delete" | "op:<name>". See the table. */
  action: string;
  /** What the caller asked for. The request body, redacted. */
  requested: Record<string, unknown> | null;
  /** What the record looked like first. Only where a route supplies it. */
  before: Record<string, unknown> | null;
  method: string;
  /** Path only. The query string is captured separately, below. */
  path: string;
  /** Parsed query parameters, redacted like any other payload. Null when
   *  there were none. `DELETE /admin/properties/:id?baseRevision=7` carries
   *  its only interesting argument here, so dropping it would record a
   *  deletion with no record of what was asked for.
   *
   *  Values are strings, since that is what a query string carries, EXCEPT for
   *  the one marker `requested` and `before` can also hold: a query too large
   *  to keep becomes `{ _truncated: true }`, with the same real boolean the
   *  other two use rather than the string `"true"`. Typed like its two siblings
   *  so a reader can test all three the same way. */
  query: Record<string, unknown> | null;
  status: number;
  /** Ties an entry to the error-table line and the server log for the same call. */
  requestId: string;
}

/* ─────────────────────────────── tutorials ────────────────────────────── */

/**
 * The server's allowlist, checked by the progress route. The console's catalogue
 * and the marketer app's help screen both draw from it. Migration 0010 only
 * bounds the stored subject's length, so adding an id here needs no migration.
 *
 * An id is listed before its video is rendered. Until then the help screens show
 * the written steps, and progress is still stored against the id.
 */
export const TUTORIAL_IDS = [
  "add-a-listing",
  "log-a-change",
  "reply-to-an-enquiry",
  "write-a-journal-post",
  "list-an-estate",
  // The phone app's own.
  "report-a-deal",
  "invite-and-earn",
  "share-a-listing",
  "send-more-proof",
  "join-as-a-marketer",
  "log-a-buyer",
  // The console's, about the marketer side of the business.
  "check-a-deal",
  "pay-your-marketers",
  "set-commission-rates",
  "sort-a-payment-problem",
  "follow-a-buyer",
  // The money screens: recording what sold, reading where it went, spending a fund.
  "record-a-sale",
  "read-the-money",
  "spend-the-fund",
] as const;
export type TutorialId = (typeof TUTORIAL_IDS)[number];

export function isTutorialId(value: string): value is TutorialId {
  return (TUTORIAL_IDS as readonly string[]).includes(value);
}

/** One member's progress on one tutorial. Each timestamp is set once and kept. */
export interface TutorialProgress {
  tutorialId: string;
  watchedAt: number | null;
  completedAt: number | null;
}

export interface TutorialProgressList {
  items: TutorialProgress[];
  nudgeDismissedAt: number | null;
}

/* ───────────────────────────── shared paging ──────────────────────────── */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
