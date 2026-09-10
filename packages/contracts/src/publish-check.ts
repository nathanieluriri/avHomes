import type { DocNode } from "./doc";
import { docToText } from "./doc";
import { isEstate, prototypeLabel } from "./listing-rules";
import type { EstatePrototype, PropertyType } from "./types";

export interface PublishWarning {
  id: string;
  message: string;
}

/**
 * A link the reader will actually render.
 *
 * The single spelling of this rule. The editor gates typed links with it, the
 * reader strips anything that fails it, and this checklist counts what would be
 * stripped, so all three agree on what a working link is.
 */
export function isAllowedHref(href: string): boolean {
  // A single slash followed by a non-slash, non-backslash character is root
  // relative. Everything a browser would read as "an authority follows" is
  // rejected: //host, ///host, /\host. Browsers normalise a leading backslash to
  // a forward slash, so /\evil.com resolves like //evil.com and a bare
  // startsWith("//") check is not enough.
  return /^(https?:|mailto:|tel:)/i.test(href) || /^\/(?![\\/])/.test(href);
}

/** An image the site is responsible for, rather than one borrowed from elsewhere. */
function isOwnImage(src: string): boolean {
  return src.startsWith("/api/public/images/") || src.startsWith("/images/");
}

/**
 * The things worth knowing before a post goes public.
 *
 * EVERY ONE OF THESE IS A WARNING, NEVER A BLOCK. A writer publishing something
 * with no excerpt has a reason, and an editor that refuses is an editor people
 * learn to route around. The job is to make the cost visible at the moment it
 * can still be paid cheaply.
 *
 * Pure, and living in contracts rather than in the editor, so the same list can
 * run against a submitted document server-side without an editor instance.
 */
export function publishWarnings(post: {
  title: string;
  excerpt: string;
  category: string;
  content: DocNode;
  coverImage: { url: string; alt: string } | null;
}): PublishWarning[] {
  const out: PublishWarning[] = [];
  const headings: number[] = [];
  let missingAlt = 0;
  let remote = 0;
  let brokenLinks = 0;

  const walk = (n: DocNode): void => {
    if (n.type === "heading") headings.push(Number(n.attrs?.level) || 2);
    if (n.type === "image") {
      const src = String(n.attrs?.src ?? "");
      if (!String(n.attrs?.alt ?? "").trim()) missingAlt += 1;
      if (src !== "" && !isOwnImage(src)) remote += 1;
    }
    for (const mark of n.marks ?? []) {
      if (mark.type !== "link") continue;
      const href = String(mark.attrs?.href ?? "").trim();
      // A link to nothing, to the page it is already on, or to a protocol the
      // reader strips anyway. All of them render as text that looks clickable
      // and is not.
      if (href === "" || href === "#" || /^https?:\/\/?$/i.test(href) || !isAllowedHref(href)) {
        brokenLinks += 1;
      }
    }
    n.content?.forEach(walk);
  };
  walk(post.content);

  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  if (post.title.trim() === "") {
    out.push({
      id: "title",
      message: "There is no title, so the post has nothing to derive a web address from.",
    });
  }

  if (docToText(post.content).trim().length < 200) {
    out.push({
      id: "short",
      message: "The body is very short. Readers arriving from a link preview will see most of it at once.",
    });
  }

  if (missingAlt > 0) {
    out.push({
      id: "alt",
      message: `${missingAlt} ${plural(missingAlt, "image has", "images have")} no alt text, so readers using a screen reader will be told nothing about ${plural(missingAlt, "it", "them")}.`,
    });
  }

  if (remote > 0) {
    out.push({
      id: "remote",
      message: `${remote} ${plural(remote, "image is", "images are")} loaded from another site. ${plural(remote, "It", "They")} will break if that site removes ${plural(remote, "it", "them")}.`,
    });
  }

  if (!post.coverImage) {
    out.push({
      id: "cover",
      message: "No cover image, so the listing card and every social preview will be text only.",
    });
  } else if (post.coverImage.alt.trim() === "") {
    out.push({
      id: "cover-alt",
      message: "The cover image has no alt text.",
    });
  }

  if (post.excerpt.trim() === "") {
    out.push({
      id: "excerpt",
      message: "There is no excerpt, so listings and link previews will have nothing to show.",
    });
  }

  if (post.category.trim() === "") {
    out.push({
      id: "category",
      message: "No category, so this post will not appear under any of them.",
    });
  }

  /*
   * A document that opens at a subheading, or reaches one before any heading,
   * reads to a screen reader as a section with no parent.
   */
  const firstH2 = headings.indexOf(2);
  const firstH3 = headings.indexOf(3);
  if (firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2)) {
    out.push({
      id: "headings",
      message:
        "A subheading appears before any heading. Screen readers use that nesting to navigate, so start the section with a Heading.",
    });
  }

  if (brokenLinks > 0) {
    out.push({
      id: "links",
      message: `${brokenLinks} ${plural(brokenLinks, "link points", "links point")} nowhere usable and will render as plain text.`,
    });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════ listings ════ */

/**
 * The title `createProperty` seeds. A listing still wearing it has not been
 * named by anybody.
 *
 * Exported so the create route's default and the check below cannot drift into
 * disagreeing about what "untitled" spells.
 */
export const UNTITLED_LISTING = "Untitled listing";

export interface PublishBlocker {
  field: string;
  message: string;
}

/**
 * The reasons a listing may not go public. NOT warnings: these BLOCK.
 *
 * That is the opposite call to `publishWarnings` twenty lines up, and the
 * difference is worth stating because the two look like the same problem.
 *
 * A post with no excerpt is a writer's judgement. Somebody weighed it and chose
 * to publish, and an editor that refuses is an editor people learn to route
 * around. A listing at a price of zero with no address is nobody's judgement.
 * It is a record that was created and never filled in, and the only reason it
 * reaches the public site is that the person who made it clicked twice. Nothing
 * is gained by letting it through: a blank listing gets a URL, a 200 and an
 * index entry, and it tells a buyer the company does not check its own work.
 *
 * So the bar here is not "is this listing good", which is a judgement and stays
 * out of it. It is "does this listing say what it is", which has one answer.
 * Photographs are deliberately NOT on this list, because "photos on Saturday"
 * is a real and common reason to list early; the alerts registry raises those
 * separately, where they can be seen without blocking anybody.
 */
export function listingPublishBlockers(listing: {
  title: string;
  priceMinor: number;
  city: string;
  address: string;
  type?: PropertyType;
  prototypes?: readonly EstatePrototype[];
}): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  const title = listing.title.trim();

  if (title === "") {
    out.push({
      field: "title",
      message: "Give the listing a title. The web address is derived from it.",
    });
  } else if (title === UNTITLED_LISTING) {
    // The seeded title is not empty, so the old `title.trim() === ""` guard
    // could never fire for a listing made with the New button and published
    // straight away, which is exactly the path that produced live listings
    // called "Untitled listing".
    out.push({
      field: "title",
      message: "The listing is still called Untitled listing. Give it a real title.",
    });
  }

  if (listing.type !== undefined && isEstate(listing.type)) {
    // An estate's price is derived from its options, so the options are what to fix.
    const prototypes = listing.prototypes ?? [];
    if (prototypes.length === 0) {
      out.push({
        field: "prototypes",
        message: "Add at least one option, such as a 3 bedroom or a 500 sqm plot.",
      });
    }
    const unpriced = prototypes.filter((p) => p.priceMinor <= 0);
    if (unpriced.length > 0) {
      out.push({
        field: "prototypes",
        message: `Set a price on ${unpriced.map((p) => prototypeLabel(p)).join(", ")}.`,
      });
    }
  } else if (listing.priceMinor <= 0) {
    out.push({
      field: "price",
      message: "Set a price. A listing at zero reads as a mistake, and it cannot be filtered on.",
    });
  }

  if (listing.city.trim() === "") {
    out.push({ field: "city", message: "Add the city. Every search starts with one." });
  }

  if (listing.address.trim() === "") {
    out.push({
      field: "address",
      message: "Add the address. The detail page has no location block without it.",
    });
  }

  return out;
}
