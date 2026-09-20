import { hasDomain, type Domain, type Role, type TutorialId } from "@avhomes/contracts";
import { NAV_ITEMS } from "@/components/admin/nav";
import { ApiError, api } from "@/lib/admin/client";
import { SPOTLIGHT_TOURS, type SpotlightTourId } from "@/lib/admin/spotlight-steps";
import { TUTORIAL_MEDIA, TUTORIAL_STEPS, type TutorialStep } from "@/lib/admin/tutorial-steps";

/**
 * The Tutorials catalogue: one short silent video per everyday job, and the
 * screen its guided walkthrough starts on.
 *
 * `requires` lists every domain the walkthrough's API calls touch, and a role
 * sees a tutorial only when it holds all of them, so no card can walk somebody
 * into a 403 halfway through. It must include the task screen's own rail domain,
 * which `entry` checks.
 */

export interface Tutorial {
  /** Both, because a card is a video AND the walkthrough it hands you. See `entry`. */
  id: TutorialId & SpotlightTourId;
  title: string;
  /** The one line that says what the video solves. */
  problem: string;
  durationSeconds: number;
  video: string;
  poster: string;
  requires: readonly Domain[];
  /** The task screen. "Try it now" adds `?spotlight=<id>`. */
  tryHref: string;
  /** The walkthrough uses a studio the console gates to a wide screen with a mouse. */
  desktopOnly: boolean;
  /** The captions burned into the video, as text. */
  steps: readonly TutorialStep[];
}

/*
 * `id` is BOTH a tutorial and a walkthrough.
 *
 * "Try it now" is `?spotlight=<id>`, which the spotlight engine ignores for an id
 * it has no tour for: three cards once shipped with a button that silently did
 * nothing. The intersection makes that a compile error instead, which is the only
 * gate that holds, since nothing in this file is evaluated at build time.
 */
function entry(
  id: TutorialId & SpotlightTourId,
  title: string,
  problem: string,
  durationSeconds: number,
  tryHref: string,
  requires: readonly Domain[],
  desktopOnly: boolean,
): Tutorial {
  const rail = NAV_ITEMS.find((row) => row.href === tryHref);
  if (!rail) throw new Error(`tutorials: no rail row for ${tryHref}`);
  if (rail.domain !== null && !requires.includes(rail.domain)) {
    throw new Error(`tutorials: ${id} must require ${rail.domain}, the domain of ${tryHref}`);
  }
  // Both tables are partial: an id may be in the allowlist before its video is rendered.
  const media = TUTORIAL_MEDIA[id];
  const steps = TUTORIAL_STEPS[id];
  if (!media || !steps) throw new Error(`tutorials: ${id} has no rendered video yet`);
  // The card and its walkthrough must agree on where they send people.
  const tour = SPOTLIGHT_TOURS[id];
  if (tour.start !== tryHref) {
    throw new Error(`tutorials: ${id} opens ${tryHref}, but its walkthrough starts on ${tour.start}`);
  }
  return {
    id,
    title,
    problem,
    durationSeconds,
    video: media.video,
    poster: media.poster,
    requires,
    tryHref,
    desktopOnly,
    steps,
  };
}

export const TUTORIALS: readonly Tutorial[] = [
  entry(
    "add-a-listing",
    "Add a listing",
    "From a blank draft to a listing people want to view.",
    93,
    "/admin/properties",
    ["listings", "media"],
    false,
  ),
  // `media` for the photos: an estate's own gallery, and a render per option.
  entry(
    "list-an-estate",
    "List an estate",
    "One listing that holds every house and plot inside it, each with its own price.",
    129,
    "/admin/properties",
    ["listings", "media"],
    false,
  ),
  entry(
    "log-a-change",
    "Log a change for the developer",
    "Show exactly what should be different on the site, in one note.",
    42,
    "/admin/customize",
    ["content", "media"],
    true,
  ),
  entry(
    "reply-to-an-enquiry",
    "Reply to an enquiry",
    "Answer a buyer quickly, from the thread they started.",
    39,
    "/admin/enquiries",
    ["enquiries"],
    false,
  ),
  entry(
    "write-a-journal-post",
    "Write a journal post",
    "From the quick editor to a published article on the site.",
    77,
    "/admin/posts",
    ["content", "media"],
    true,
  ),
  // Before the deals, because a buyer becomes one: this is where the money starts.
  entry(
    "follow-a-buyer",
    "Follow up a buyer",
    "A marketer sent somebody in. Call them, then move them along the line.",
    64,
    "/admin/marketers/buyers",
    ["marketing"],
    false,
  ),
  entry(
    "check-a-deal",
    "Check a deal",
    "A marketer says they sold a house. Check it, then approve it.",
    57,
    "/admin/marketers/deals",
    ["marketing"],
    false,
  ),
  // `media` for the receipt, uploaded in the sheet that Mark as paid opens.
  entry(
    "pay-your-marketers",
    "Pay your marketers",
    "The end of the month: one list, one transfer per person.",
    48,
    "/admin/marketers/pay",
    ["marketing", "media"],
    false,
  ),
  entry(
    "sort-a-payment-problem",
    "Sort a payment problem",
    "A marketer says their money never arrived. Answer it, then close it.",
    51,
    "/admin/marketers/problems",
    ["marketing", "media"],
    false,
  ),
  // Commission has no rail row of its own, so the walkthrough starts on Marketers and opens it from there.
  entry(
    "set-commission-rates",
    "Set commission rates",
    "Change what marketers earn, and see what it pays before you save.",
    42,
    "/admin/marketers",
    ["marketing"],
    false,
  ),
  /* The money screens. `media` on the first because the proof is uploaded in the
     sheet, and `marketing` on all three because every figure they show is one. */
  entry(
    "record-a-sale",
    "Record a sale",
    "A house sold. Take it off the market, with the amount and the proof on the record.",
    52,
    "/admin/properties",
    ["listings", "media", "marketing"],
    false,
  ),
  entry(
    "read-the-money",
    "Read where the money went",
    "What you transacted, who was paid out of it, and what AV Homes kept.",
    47,
    "/admin/analytics",
    ["analytics", "marketing"],
    false,
  ),
  entry(
    "spend-the-fund",
    "Spend the community fund",
    "A share of every deal goes in. Pay some out, and leave a receipt behind it.",
    53,
    "/admin/analytics/wallets",
    ["analytics", "marketing", "media"],
    false,
  ),
];

export function tutorialsFor(role: Role): Tutorial[] {
  return TUTORIALS.filter((tutorial) => tutorial.requires.every((domain) => hasDomain(role, domain)));
}

export function tryHrefOf(tutorial: Tutorial): string {
  // The tour says what state its first step needs the screen in; the card just opens it.
  const { startQuery } = SPOTLIGHT_TOURS[tutorial.id];
  return `${tutorial.tryHref}?${startQuery ? `${startQuery}&` : ""}spotlight=${tutorial.id}`;
}

/** The step playing at `time`, held through the gaps between captions; -1 before the first. */
export function stepAt(steps: readonly TutorialStep[], time: number): number {
  let current = -1;
  steps.forEach((step, index) => {
    if (step.at <= time + 0.05) current = index;
  });
  return current;
}

const RETRY_DELAYS_MS = [800, 2400];

/**
 * A progress write that survives a dropped connection or a server hiccup.
 * A refusal (4xx) is final at once; anything transient is retried twice.
 */
export async function putWithRetry<T>(path: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.put<T>(path, body);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const transient = status === 0 || status === 408 || status === 429 || status >= 500;
      const wait = RETRY_DELAYS_MS[attempt];
      if (!transient || wait === undefined) throw err;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/** "1:33", for the chip on a poster. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "1 minute 33 seconds", for a screen reader. */
export function spokenDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}
