import { hasDomain, type Domain, type Role, type TutorialId } from "@avhomes/contracts";
import { NAV_ITEMS } from "@/components/admin/nav";
import { ApiError, api } from "@/lib/admin/client";
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
  id: TutorialId;
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

function entry(
  id: TutorialId,
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
  return {
    id,
    title,
    problem,
    durationSeconds,
    video: TUTORIAL_MEDIA[id].video,
    poster: TUTORIAL_MEDIA[id].poster,
    requires,
    tryHref,
    desktopOnly,
    steps: TUTORIAL_STEPS[id],
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
];

export function tutorialsFor(role: Role): Tutorial[] {
  return TUTORIALS.filter((tutorial) => tutorial.requires.every((domain) => hasDomain(role, domain)));
}

export function tryHrefOf(tutorial: Tutorial): string {
  return `${tutorial.tryHref}?spotlight=${tutorial.id}`;
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
