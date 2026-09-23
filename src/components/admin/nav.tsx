import {
  Activity,
  Banknote,
  Bell,
  Building2,
  ChartNoAxesColumn,
  Contact,
  Eye,
  Gauge,
  GraduationCap,
  Handshake,
  History,
  Images,
  Inbox,
  LibraryBig,
  Mail,
  Megaphone,
  MessageCircleWarning,
  MailOpen,
  Newspaper,
  PencilRuler,
  Receipt,
  SlidersHorizontal,
  TriangleAlert,
  Trophy,
  UserRoundCheck,
  UserRoundSearch,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { hasDomain, isScopedRole, type Domain, type Role } from "@avhomes/contracts";

/**
 * The rail's contents, in one place because three surfaces read them: the rail
 * itself, the command palette, and Tutorials, which looks a screen's label up
 * by href.
 *
 * TWO LEVELS, AND ONLY ONE OF THEM IS EVER FULLY DRAWN. The console has
 * outgrown a flat list: seventeen rows under five headings is a directory, not
 * a place you work. So the sections are real rows now, and a section's
 * sub-pages appear only while the reader is inside it. There is no disclosure
 * control to click, nothing to remember the state of, and nothing to leave
 * open: the URL decides, so the column is never longer than the top-level rows
 * plus one section's depth. Rows can keep arriving without the rail growing.
 *
 * `domain` is the SAME key the server's permission gate reads, so a row can
 * never appear for a screen whose API would answer 403. That is the reason the
 * matrix lives in @avhomes/contracts rather than being restated here.
 */

export interface NavItem {
  /**
   * Null on a SECTION row: it has no screen of its own and opens its first
   * visible child instead. Content and Audience are the two, and neither has
   * an index page worth building, so neither invents one.
   */
  href: string | null;
  label: string;
  /** The one-line answer to "what is this screen for", used by the palette. */
  hint: string;
  icon: LucideIcon;
  /** Null means every signed-in member. Alerts and Tutorials need it: each page
   *  filters its own list per role, so the row itself gates nothing. */
  domain: Domain | null;
  /** Narrows the row to these roles on top of the domain check. */
  roles?: readonly Role[];
  /**
   * The screen reads every record, so a role scoped to its own records never
   * sees the row. A domain cannot say this: a partner genuinely holds
   * `analytics` for their own listings, and the dashboard is the whole site's.
   */
  unscoped?: true;
  /**
   * The screen reads money, which the server hands to a role holding `marketing`
   * and to a scoped role for its own records, and to nobody else. Mirrors the
   * `money` flag `scopeFor` computes, so an agent or support account never gets a
   * row whose API refuses them.
   */
  money?: true;
  /** Sub-pages, drawn only while the reader is somewhere inside this row. */
  children?: readonly NavPage[];
}

/** A row that is a real screen, which is every row the palette can offer. */
export type NavPage = NavItem & { href: string };

/** The one filter every surface that renders a nav row must use. */
export function canSeeNavItem(role: Role, item: NavItem): boolean {
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.unscoped && isScopedRole(role)) return false;
  if (item.money && !hasDomain(role, "marketing") && !isScopedRole(role)) return false;
  return item.domain === null || hasDomain(role, item.domain);
}

export const NAV: readonly NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    hint: "Traffic, storefront and what is waiting",
    icon: Gauge,
    domain: "analytics",
    unscoped: true,
  },
  {
    href: "/admin/alerts",
    label: "Alerts",
    hint: "What the public site is getting wrong",
    icon: TriangleAlert,
    /* Null rather than a domain: the page filters each alert to what the
       reader could actually act on, so an editor sees their empty journal and
       nothing about listings. Gating the ROW by a domain would hide that from
       the one person who can fix it. */
    domain: null,
    // Every check is about AV Homes' whole site, and the server returns none to a partner.
    unscoped: true,
  },
  {
    href: "/admin/notifications",
    label: "Notifications",
    hint: "Storage requests and customize notes",
    icon: Bell,
    domain: null,
    roles: ["developer"],
  },
  {
    href: "/admin/properties",
    label: "Listings",
    hint: "Every property, including drafts and the trash",
    icon: Building2,
    domain: "listings",
  },
  {
    href: "/admin/company",
    label: "Company",
    hint: "Your company's details and limits",
    icon: Building2,
    domain: null,
    roles: ["partner"],
    children: [
      {
        href: "/admin/company/staff",
        label: "Staff",
        hint: "Who works on your listings",
        icon: UsersRound,
        domain: null,
        roles: ["partner"],
      },
    ],
  },
  {
    /* A section rather than one screen, because six pages each answer their own
       question and a single page answering all six is the overload this whole
       section is built to avoid. Placed under Listings and above Marketers: it
       reads what those two produce. */
    href: "/admin/analytics",
    label: "Analytics",
    hint: "Money, listings, people and traffic",
    icon: ChartNoAxesColumn,
    domain: "analytics",
    children: [
      {
        href: "/admin/analytics/transactions",
        label: "Transactions",
        hint: "Every deal, with its split and its proof",
        icon: Receipt,
        domain: "analytics",
        money: true,
      },
      {
        href: "/admin/analytics/listings",
        label: "Listing performance",
        hint: "What gets looked at and what lands",
        icon: Eye,
        domain: "analytics",
      },
      {
        href: "/admin/analytics/people",
        label: "People",
        hint: "Who is closing, marketers and staff",
        icon: Trophy,
        domain: "marketing",
      },
      {
        href: "/admin/analytics/wallets",
        label: "The two funds",
        hint: "The prize pool and the community fund",
        icon: Wallet,
        domain: "marketing",
      },
      {
        href: "/admin/analytics/traffic",
        label: "Traffic",
        hint: "Visitors, and the listings they read",
        icon: Activity,
        domain: "analytics",
      },
    ],
  },
  {
    href: "/admin/enquiries",
    label: "Enquiries",
    hint: "The contact form's inbox",
    icon: Inbox,
    domain: "enquiries",
  },
  {
    /* A section, not a screen. An agent holds `media` but not `content`, so
       this collapses to a plain Media row for them rather than opening into a
       list of one. `visibleNav` does that. */
    href: null,
    label: "Content",
    hint: "The journal, the photo library and the studio",
    icon: LibraryBig,
    domain: null,
    children: [
      {
        href: "/admin/posts",
        label: "Journal",
        hint: "Articles, drafts and revisions",
        icon: Newspaper,
        domain: "content",
      },
      {
        href: "/admin/images",
        label: "Media",
        hint: "Photos, GIFs and videos, and the storage allowance",
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
    href: null,
    label: "Audience",
    hint: "Subscribers, what gets sent to them and how it reads",
    icon: Contact,
    domain: null,
    children: [
      {
        href: "/admin/subscribers",
        label: "Subscribers",
        hint: "Everyone on the newsletter list",
        icon: UserRoundCheck,
        domain: "content",
      },
      {
        href: "/admin/newsletters",
        label: "Newsletters",
        hint: "Write and send an email to subscribers",
        icon: Mail,
        domain: "content",
      },
      {
        href: "/admin/email-templates",
        label: "Email templates",
        hint: "The wording of every email the site sends",
        icon: MailOpen,
        domain: "content",
      },
    ],
  },
  {
    /* A section WITH a screen of its own: the row opens the marketer list, and
       the queues hanging off it are the children. Commission still takes no
       row at all, because it is a settings page nobody visits twice a month
       and it falls through to this row, which is where a reader would look.

       The children are matched before the parent, which is what settles the
       one place two rows overlap: Deals and Pay day sit UNDER /admin/marketers
       in the URL tree, so a plain prefix test says yes to both. */
    href: "/admin/marketers",
    label: "Marketers",
    hint: "Everyone selling, their team and what they earned",
    icon: UsersRound,
    domain: "marketing",
    children: [
      {
        href: "/admin/marketers/buyers",
        label: "Buyers",
        hint: "People marketers introduced, and where each one has got to",
        icon: UserRoundSearch,
        domain: "marketing",
      },
      {
        href: "/admin/marketers/deals",
        label: "Deals",
        hint: "Sales a marketer reported, waiting to be checked",
        icon: Handshake,
        domain: "marketing",
      },
      {
        href: "/admin/marketers/pay",
        label: "Pay day",
        hint: "This month's transfers, and who is still owed",
        icon: Banknote,
        domain: "marketing",
      },
      {
        href: "/admin/marketers/problems",
        label: "Problems",
        hint: "Marketers who say a payment never arrived",
        icon: MessageCircleWarning,
        domain: "marketing",
      },
      {
        href: "/admin/marketers/updates",
        label: "Updates",
        hint: "News cards on the marketer app's home screen",
        icon: Megaphone,
        domain: "marketing",
      },
    ],
  },
  {
    href: "/admin/partners",
    label: "Partners",
    hint: "Companies listing their own property, their teams and limits",
    icon: Building2,
    domain: "team",
    unscoped: true,
    children: [
      {
        href: "/admin/partners/applications",
        label: "Applications",
        hint: "People asking to list their own property",
        icon: UserRoundSearch,
        domain: "team",
      },
      {
        href: "/admin/partners/settings",
        label: "Settings",
        hint: "The limits every partner starts with",
        icon: SlidersHorizontal,
        domain: "team",
      },
    ],
  },
  {
    href: "/admin/team",
    label: "Team",
    hint: "Who can sign in, and what they may touch",
    icon: Users,
    domain: "team",
    children: [
      {
        href: "/admin/audit",
        label: "Audit trail",
        hint: "Who changed what, and when",
        icon: History,
        domain: "danger",
      },
    ],
  },
];

/**
 * The foot of the column, pushed away from the rest.
 *
 * Neither of these is a thing anybody does all day. Settings is read when
 * something is wrong and Tutorials is found once by somebody new, and putting
 * them down here is what keeps the nine rows above them a list of the job.
 */
export const NAV_BOTTOM: readonly NavItem[] = [
  {
    href: "/admin/tutorials",
    label: "Tutorials",
    hint: "Short videos, then a guided try on the real screen",
    icon: GraduationCap,
    /* Null: the page lists only the tutorials whose screens this role can open. */
    domain: null,
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
];

/** Flattened to real screens, for the palette and for Tutorials' href lookup. */
export const NAV_ITEMS: readonly NavPage[] = [...NAV, ...NAV_BOTTOM].flatMap((row) => [
  ...(row.href === null ? [] : [row as NavPage]),
  ...(row.children ?? []),
]);

/**
 * A row is current when the URL is it or sits under it, compared on a SEGMENT
 * BOUNDARY. A bare `startsWith` lights `/admin/posts` up for a future
 * `/admin/posts-archive`, and `/admin` would light up for everything.
 */
export function isSectionActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Where a section row points: its own screen, or its first child's. */
export function hrefOf(item: NavItem): string {
  return item.href ?? item.children?.[0]?.href ?? "/admin";
}

/**
 * The rows this role may see, with each row's children already filtered.
 *
 * A SECTION OF ONE IS JUST THE PAGE. An agent holds `media` and nothing else
 * under Content, and a "Content" row that opens into a single "Media" child is
 * a folder drawn around one file. It is promoted to a top-level row instead,
 * keeping its own icon, so that agent sees Media where everyone else sees
 * Content.
 */
export function visibleNav(role: Role, rows: readonly NavItem[] = NAV): readonly NavItem[] {
  const out: NavItem[] = [];
  for (const row of rows) {
    const children = (row.children ?? []).filter((child) => canSeeNavItem(role, child));
    if (row.href === null) {
      if (children.length === 0) continue;
      if (children.length === 1) out.push(children[0]);
      else out.push({ ...row, children });
      continue;
    }
    if (!canSeeNavItem(role, row)) continue;
    out.push({ ...row, children });
  }
  return out;
}

export interface RailPosition {
  /** The top-level row the URL belongs to. Its children are the ones drawn. */
  section: NavItem | null;
  /** The href of the ONE row that takes the pill. Null off the map. */
  current: string | null;
}

/**
 * Where the reader is, in the two answers the rail needs.
 *
 * Children are tested before their parent, so the deepest row wins and exactly
 * one row is ever highlighted. Anything a section does not name by href, such
 * as an open marketer or the commission screen, falls through to the section
 * row itself, which is where a reader would look for it.
 */
export function locate(rows: readonly NavItem[], pathname: string): RailPosition {
  for (const row of rows) {
    const child = (row.children ?? []).find((item) => isSectionActive(pathname, item.href));
    if (child) return { section: row, current: child.href };
    if (row.href !== null && isSectionActive(pathname, row.href)) {
      return { section: row, current: row.href };
    }
  }
  return { section: null, current: null };
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
  // A partner's front door is their own listings, not Alerts, which is the first row left once the dashboard is gone.
  if (isScopedRole(role)) return "/admin/properties";
  return NAV_ITEMS.find((item) => canSeeNavItem(role, item))?.href ?? "/admin";
}
