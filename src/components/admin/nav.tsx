import {
  Building2,
  Gauge,
  Images,
  Inbox,
  Newspaper,
  PencilRuler,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { hasDomain, type Domain, type Role } from "@avhomes/contracts";

/**
 * The rail's contents, in one place because three surfaces read them: the rail
 * itself, the command palette, and the breadcrumb, which needs a section's icon
 * to draw the parent chip.
 *
 * `domain` is the SAME key the server's permission gate reads, so a row can
 * never appear for a screen whose API would answer 403. That is the reason the
 * matrix lives in @avhomes/contracts rather than being restated here.
 */

export interface NavItem {
  href: string;
  label: string;
  /** The one-line answer to "what is this screen for", used by the palette. */
  hint: string;
  icon: LucideIcon;
  /** Null means every signed-in member. Alerts is the only row that needs it:
   *  the list behind it is filtered per alert, so the row itself gates nothing. */
  domain: Domain | null;
}

export interface NavGroup {
  /** Null renders the group with no heading. The first group is the app's
   *  front door and a label over a single row is more chrome than navigation. */
  label: string | null;
  items: readonly NavItem[];
}

/** The one filter every surface that renders a nav row must use. */
export function canSeeNavItem(role: Role, item: NavItem): boolean {
  return item.domain === null || hasDomain(role, item.domain);
}

export const NAV: readonly NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        hint: "Traffic, storefront and what is waiting",
        icon: Gauge,
        domain: "analytics",
      },
      {
        href: "/admin/alerts",
        label: "Alerts",
        hint: "What the public site is getting wrong",
        icon: TriangleAlert,
        /* Null rather than a domain: the page filters each alert to what the
           reader could actually act on, so an editor sees their empty journal
           and nothing about listings. Gating the ROW by a domain would hide
           that from the one person who can fix it. */
        domain: null,
      },
      {
        href: "/admin/properties",
        label: "Listings",
        hint: "Every property, including drafts and the trash",
        icon: Building2,
        domain: "listings",
      },
      {
        href: "/admin/enquiries",
        label: "Enquiries",
        hint: "The contact form's inbox",
        icon: Inbox,
        domain: "enquiries",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/posts",
        label: "Journal",
        hint: "Articles, drafts and revisions",
        icon: Newspaper,
        domain: "content",
      },
      {
        href: "/admin/images",
        label: "Images",
        hint: "The shared photo library",
        icon: Images,
        domain: "media",
      },
      {
        href: "/admin/customize",
        label: "Customize",
        /* `content` rather than a domain of its own. The studio is where
           somebody says what the site should say and look like, which is the
           same authority as writing the words on it. */
        hint: "Circle anything on the site and leave a note",
        icon: PencilRuler,
        domain: "content",
      },
    ],
  },
  {
    label: "Access",
    items: [
      {
        href: "/admin/team",
        label: "Team",
        hint: "Who can sign in, and what they may touch",
        icon: Users,
        domain: "team",
      },
      {
        href: "/admin/settings",
        label: "Settings",
        /* `team` rather than a domain of its own. The only setting here decides
           what a buyer is told about who works here, which is the same authority
           as deciding who works here. */
        hint: "Whose name answers an enquiry",
        icon: SlidersHorizontal,
        domain: "team",
      },
    ],
  },
];

/** Flattened, for the palette and for breadcrumb lookups. */
export const NAV_ITEMS: readonly NavItem[] = NAV.flatMap((group) => group.items);

/**
 * A section is current when the URL is it or sits under it, compared on a
 * SEGMENT BOUNDARY. A bare `startsWith` lights `/admin/posts` up for a future
 * `/admin/posts-archive`, and `/admin` would light up for everything.
 */
export function isSectionActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav row a URL belongs to, or null. Feeds the breadcrumb's parent chip. */
export function sectionFor(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => isSectionActive(pathname, item.href)) ?? null;
}

/**
 * Where a role's console actually starts.
 *
 * `/admin` is not everybody's home. The dashboard needs the `analytics` domain,
 * which an editor does not hold, so sending every role there put an editor's
 * front door on a screen whose own API answers 403: they signed in and got a red
 * error box. The rail already refused to draw that row, and this is the same
 * rule applied to the two surfaces that were still guessing, sign-in and the
 * wordmark.
 *
 * Falls back to `/admin` for a role that holds nothing at all, which no role in
 * the matrix does. Better a wrong screen than a link with no href.
 */
export function homeFor(role: Role): string {
  return NAV_ITEMS.find((item) => canSeeNavItem(role, item))?.href ?? "/admin";
}
