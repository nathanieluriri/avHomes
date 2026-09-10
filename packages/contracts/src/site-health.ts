import type { Domain } from "./roles";
import type { ClientLogo, Office } from "./types";

/**
 * What the site is currently getting wrong, said to the person who can fix it.
 *
 * The sibling of `publish-check.ts`, one level up: that file asks whether ONE
 * post is ready, this one asks whether the SITE is. Both are pure and both live
 * in contracts so the same list can run on the server without a browser and
 * render in the console without a second implementation drifting from it.
 *
 * Two rules hold this together, and both come from the same place: an alert
 * nobody can clear is an alert everybody learns to scroll past.
 *
 * 1. EVERY CHECK CLEARS FROM THE ADMIN. Nothing here can be dismissed, so
 *    nothing here may describe a condition the reader has no way to resolve.
 *    Before adding a check, find the screen that fixes it. If there isn't one,
 *    build that first; the check is not the feature. "Clears from the admin"
 *    includes the ROLE: see `domain` below.
 * 2. EVERY MESSAGE CARRIES ITS CONSEQUENCE. "No cover image" is a fact about a
 *    database. "No cover image, so every social preview will be text only" is a
 *    reason to go and do something. Say what a visitor experiences, not what a
 *    column contains.
 */

export const ALERT_SEVERITIES = ["blocker", "warning", "advisory"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface SiteAlert {
  id: string;
  severity: AlertSeverity;
  /**
   * Who is shown this. `null` means the settings tier: owner and developer
   * only, matching `requireAdmin()` on the routes that would fix it. An agent
   * told to correct a phone number they cannot reach has been given a chore
   * with no door.
   *
   * Pick this by asking who can WRITE the fix, never by what the alert is
   * about. `no-site-stats` is listings-shaped and is `null`, because writing a
   * stat is `requireAdmin()` even though `hasDomain("agent", "listings")` is
   * true.
   */
  domain: Domain | null;
  /** The problem, in one line, in the second person. */
  title: string;
  /** The problem's cost to a visitor, in one or two sentences. */
  message: string;
  /** Where it gets fixed. Never null: rule 1 above. */
  action: { label: string; href: string };
}

/**
 * Everything the checks read, gathered once.
 *
 * A snapshot rather than a database handle, so the check list stays pure and a
 * caller pays for exactly one pass of counts however many checks run over it.
 */
export interface SiteHealthSnapshot {
  listings: {
    /**
     * Everything a visitor can reach: PUBLIC_PROPERTY_STATUSES, which is
     * live + under-offer + closed, NOT just `live`.
     *
     * These were one number and the number was `live`, which disagreed with
     * what the site actually publishes. With 19 live and 3 under-offer/closed,
     * three listings had their own detail pages and were invisible to every
     * check here.
     */
    publiclyVisible: number;
    /** Available to transact. A site of nothing but sold stock has none. */
    live: number;
    draft: number;
    /** Publicly reachable listings whose `images` array is empty. */
    withoutPhotos: number;
    /**
     * Publicly reachable listings with no price or no address.
     *
     * Publish refuses only an empty title, so a listing created with the New
     * button and published immediately goes live carrying "Untitled listing",
     * a price of zero and nothing else. It gets a URL, a 200 and an index entry.
     */
    incomplete: number;
  };
  posts: {
    published: number;
    draft: number;
  };
  /** Gathered but unread: see the DELIBERATELY ABSENT note below. */
  testimonials: number;
  siteStats: number;
  settings: {
    contactPhone: string;
    contactEmail: string;
    whatsappNumber: string;
    offices: Office[];
    clientLogos: ClientLogo[];
    /** Profile URLs by platform. Empty means that icon is not drawn. */
    social: Record<string, string>;
  };
  enquiries: {
    /** New and unanswered for more than two days. */
    stale: number;
  };
}

/*
 * DELIBERATELY ABSENT: a "no testimonials published" check.
 *
 * The homepage band renders empty when there are none, so the condition is real
 * and worth telling somebody about. There is simply nowhere to send them: the
 * testimonial API exists at /admin/testimonials but NO CONSOLE SCREEN READS IT,
 * so the alert would have been an instruction to do something the console
 * cannot do. That is exactly the failure rule 1 above exists to prevent. Build
 * the screen, then add the check back.
 */

/** Below this the journal reads as abandoned rather than new. */
const THIN_JOURNAL = 3;

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  blocker: 0,
  warning: 1,
  advisory: 2,
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The whole registry, in one flat list.
 *
 * Ordered by severity and then by the order written here, which is roughly the
 * order a site becomes real: stock, then a way to reach someone, then the
 * things that make the two believable. Adding a check means adding a block;
 * there is no registration step and no separate list to keep in sync.
 */
export function siteAlerts(snap: SiteHealthSnapshot): SiteAlert[] {
  const out: SiteAlert[] = [];
  const { listings, posts, settings, enquiries } = snap;

  /* ─────────────────────────────── blockers ─────────────────────────────── */

  if (listings.publiclyVisible === 0) {
    out.push({
      id: "no-live-listings",
      severity: "blocker",
      domain: "listings",
      title: "Your site has no live listings",
      message:
        listings.draft > 0
          ? `Buy and Rent are both empty pages, so a visitor cannot see a single property or a single price. You have ${listings.draft} ${plural(listings.draft, "listing", "listings")} in draft that could go live today.`
          : "Buy and Rent are both empty pages, so a visitor cannot see a single property or a single price. Everything else on this list is decoration until this one is cleared.",
      action: { label: "Work through the listings", href: "/admin/properties" },
    });
  }

  if (settings.contactPhone.trim() === "") {
    out.push({
      id: "no-contact-phone",
      severity: "blocker",
      domain: null,
      title: "You have not set a phone number",
      message:
        "The contact page shows no number at all, so a buyer who wants to speak to a person has no way to start. Property here is sold on the phone.",
      action: { label: "Add your number", href: "/admin/settings" },
    });
  }

  if (settings.contactEmail.trim() === "") {
    out.push({
      id: "no-contact-email",
      severity: "blocker",
      domain: null,
      title: "You have not set a contact email",
      message:
        "The contact page and the footer both hide their email block, so the only route in is the form, and a form gives a visitor nothing to copy or forward.",
      action: { label: "Add your address", href: "/admin/settings" },
    });
  }

  if (listings.incomplete > 0) {
    out.push({
      id: "incomplete-published",
      severity: "blocker",
      domain: "listings",
      title: `${listings.incomplete} published ${plural(listings.incomplete, "listing has", "listings have")} no price or no address`,
      message: `${plural(listings.incomplete, "It is", "They are")} live on the site with a public URL that anyone can find and share. A blank listing does more damage than a missing one: it tells a buyer the company does not check its own work.`,
      action: { label: "Finish or unpublish", href: "/admin/properties" },
    });
  }

  /* ─────────────────────────────── warnings ─────────────────────────────── */

  if (listings.withoutPhotos > 0) {
    out.push({
      id: "listings-without-photos",
      severity: "warning",
      domain: "listings",
      title: `${listings.withoutPhotos} live ${plural(listings.withoutPhotos, "listing has", "listings have")} no photographs`,
      message: `${plural(listings.withoutPhotos, "It shows", "They show")} as an empty frame in the grid and on the detail page. Nobody enquires about a house they cannot see, and a listing with no photo reads as one that does not exist.`,
      action: { label: "Add photographs", href: "/admin/properties" },
    });
  }

  if (listings.publiclyVisible > 0 && listings.live === 0) {
    out.push({
      id: "nothing-available",
      severity: "warning",
      domain: "listings",
      title: "Nothing you have is still available",
      message: `All ${listings.publiclyVisible} ${plural(listings.publiclyVisible, "listing", "listings")} on your site are under offer or closed. A visitor can browse but cannot enquire about anything they could actually get.`,
      action: { label: "Publish something", href: "/admin/properties" },
    });
  }

  if (settings.whatsappNumber.trim() === "") {
    out.push({
      id: "no-whatsapp",
      severity: "warning",
      domain: null,
      title: "WhatsApp is not set up",
      message:
        "Your contact page cannot offer a WhatsApp button, so every enquiry has to go through a form and wait. Most property conversations here start and finish on WhatsApp.",
      action: { label: "Add your WhatsApp number", href: "/admin/settings" },
    });
  }

  if (settings.offices.length === 0) {
    out.push({
      id: "no-office",
      severity: "warning",
      domain: null,
      title: "No office address is published",
      message:
        "The contact page can only offer a form, so a visitor has no way to check there is a real place and a real company behind the site.",
      action: { label: "Add an office", href: "/admin/settings" },
    });
  }

  {
    const unset = Object.entries(settings.social)
      .filter(([, url]) => url.trim() === "")
      .map(([platform]) => platform);
    if (unset.length > 0) {
      out.push({
        id: "social-links-unset",
        severity: "advisory",
        domain: null,
        title: `${unset.length} social ${plural(unset.length, "profile is", "profiles are")} not linked`,
        message: `The footer draws an icon only for the profiles you have filled in, so ${unset.join(" and ")} ${plural(unset.length, "is", "are")} missing rather than wrong. Two of these used to point at the platforms' own front pages instead of at you.`,
        action: { label: "Add your profiles", href: "/admin/settings" },
      });
    }
  }

  if (settings.clientLogos.length === 0) {
    out.push({
      id: "no-client-logos",
      severity: "warning",
      domain: null,
      title: "Your trust strip names no clients",
      message:
        "The band that says who you have worked for is hidden, and it is the one section of the homepage whose entire job is credibility. One client you can actually show beats five you cannot.",
      action: { label: "Add a client", href: "/admin/settings" },
    });
  }

  /* ────────────────────────────── advisories ────────────────────────────── */

  if (posts.published < THIN_JOURNAL) {
    out.push({
      id: "thin-journal",
      severity: "advisory",
      domain: "content",
      title:
        posts.published === 0
          ? "Your journal is empty"
          : `Your journal has only ${posts.published} ${plural(posts.published, "post", "posts")}`,
      message:
        posts.draft > 0
          ? `Guides are what people read before they trust an agency with a house, and they are most of what brings a stranger in from a search. You have ${posts.draft} ${plural(posts.draft, "draft", "drafts")} waiting.`
          : "Guides are what people read before they trust an agency with a house, and they are most of what brings a stranger in from a search. Three is enough to stop the page reading as abandoned.",
      action: { label: "Write a post", href: "/admin/posts" },
    });
  }

  if (snap.siteStats === 0) {
    out.push({
      id: "no-site-stats",
      severity: "advisory",
      // NOT `listings`, even though a stat is listings-shaped. Writing one is
      // requireAdmin() on the server and StorefrontCard hides its controls for
      // everyone else, so an agent shown this would press the button and find
      // nothing there.
      domain: null,
      title: "No site statistics are published",
      message:
        "The counters on the homepage render empty. A figure with its source attached reads as a fact; one without reads as decoration, so give each one a period it covers.",
      action: { label: "Add a statistic", href: "/admin" },
    });
  }

  if (listings.draft > 0 && listings.live > 0) {
    out.push({
      id: "drafts-waiting",
      severity: "advisory",
      domain: "listings",
      title: `${listings.draft} ${plural(listings.draft, "listing is", "listings are")} sitting in draft`,
      message: `Photographed and priced work that no visitor can see. ${plural(listings.draft, "It earns", "They earn")} nothing until published.`,
      action: { label: "Review the drafts", href: "/admin/properties" },
    });
  }

  if (enquiries.stale > 0) {
    out.push({
      id: "enquiries-waiting",
      severity: "advisory",
      domain: "enquiries",
      title: `${enquiries.stale} ${plural(enquiries.stale, "enquiry has", "enquiries have")} waited more than two days`,
      message: `Somebody asked about a specific house and has heard nothing back. By now ${plural(enquiries.stale, "they have", "most of them have")} asked someone else.`,
      action: { label: "Answer them", href: "/admin/enquiries" },
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * The alerts a given role is shown.
 *
 * Filtered rather than merely hidden: the count in the navigation and the list
 * on the page have to agree, and both have to agree with what pressing the
 * action would actually be allowed to do.
 */
export function visibleAlerts(
  alerts: readonly SiteAlert[],
  canSee: (domain: Domain | null) => boolean,
): SiteAlert[] {
  return alerts.filter((a) => canSee(a.domain));
}
