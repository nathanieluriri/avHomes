import type { TutorialId } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { TUTORIAL_MEDIA, TUTORIAL_STEPS } from "@/lib/admin/tutorial-steps";

/**
 * The help catalogue for the phone app: the two videos a marketer needs, and
 * the written steps that stand in for each one until its video is rendered.
 *
 * The console's `@/lib/admin/tutorials` is deliberately not reused. It builds
 * its catalogue at import and drags the console's whole nav in with it, and a
 * phone app has no business shipping that to read four helpers. The generated
 * tables below carry nothing but data, so those are imported directly.
 */

export const PROGRESS_PATH = "/admin/tutorials/progress";

export interface HelpStep {
  title: string;
  line: string;
  /** Seconds into the video, or null when there is no video to seek. */
  at: number | null;
}

export interface HelpTopic {
  id: TutorialId;
  title: string;
  /** The one line that says what it solves. */
  problem: string;
  /** Null until the video is rendered. The steps carry the screen on their own. */
  video: string | null;
  poster: string | null;
  /** How long the video runs, or null when there is no video. */
  seconds: number | null;
  steps: readonly HelpStep[];
}

interface Written {
  id: TutorialId;
  title: string;
  problem: string;
  steps: readonly { title: string; line: string }[];
}

/**
 * The steps as prose, written here rather than generated.
 *
 * They are the screen before any video exists, and the fallback for a video
 * that will not load, so they have to make sense with no picture beside them.
 */
const WRITTEN: readonly Written[] = [
  {
    id: "report-a-deal",
    title: "Report a deal",
    problem: "Tell us about a home you helped sell or rent, and send the proof.",
    steps: [
      { title: "Tap Report a deal", line: "The big round button in the middle of the bar at the bottom." },
      { title: "Pick the home", line: "Search its name, then say if it was sold or rented." },
      { title: "Put in the amount", line: "What the buyer or the tenant actually paid. You see what you could earn." },
      { title: "Add the proof", line: "A photo of the agreement or the receipt, clear enough to read." },
      { title: "Send it", line: "It shows up under Deals, marked Being checked." },
      { title: "Wait for the check", line: "AV Homes looks at your proof. It usually takes a day or two." },
      { title: "The money is yours", line: "Once it is approved, your part waits for pay day." },
    ],
  },
  {
    id: "invite-and-earn",
    title: "Invite people and earn",
    problem: "Share your link, and earn a slice of every deal your people close.",
    steps: [
      { title: "Find your link", line: "It is on the home screen, under Share your link." },
      { title: "Send it on WhatsApp", line: "One tap. The message is already written for you." },
      { title: "They sign up on your link", line: "Their account is tied to your code from the start." },
      { title: "Watch your team grow", line: "Everybody you brought in shows under Team." },
      { title: "Earn from their deals", line: "A slice of every deal they close, and a smaller slice of the deals their own people close." },
      { title: "It lands in your money", line: "With the rest of what you are owed, paid at the end of the month." },
    ],
  },
];

/**
 * One topic, with whatever has landed.
 *
 * The generated steps win when the video exists, because those are the captions
 * burned into the picture and the list has to agree with what is on screen. The
 * video's length is the last step's end, so nothing here is hand-typed twice.
 */
function topicOf(written: Written): HelpTopic {
  const media = TUTORIAL_MEDIA[written.id];
  const filmed = TUTORIAL_STEPS[written.id];
  const last = filmed?.[filmed.length - 1];
  const shot = media !== undefined && filmed !== undefined && last !== undefined;

  return {
    id: written.id,
    title: written.title,
    problem: written.problem,
    video: shot ? media.video : null,
    poster: shot ? media.poster : null,
    seconds: shot ? Math.round(last.until) : null,
    steps: shot
      ? filmed.map((step) => ({ title: step.title, line: step.line, at: step.at }))
      : written.steps.map((step) => ({ title: step.title, line: step.line, at: null })),
  };
}

export const HELP_TOPICS: readonly HelpTopic[] = WRITTEN.map(topicOf);

/** "1:12", for the chip on a poster. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** How long this will cost you, in the plainest words there are. */
export function aboutLength(seconds: number): string {
  if (seconds < 60) return "Less than a minute";
  const minutes = Math.round(seconds / 60);
  return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** The step playing at `time`, held through the gaps between captions; -1 before the first. */
export function stepAt(steps: readonly HelpStep[], time: number): number {
  let current = -1;
  steps.forEach((step, index) => {
    if (step.at !== null && step.at <= time + 0.05) current = index;
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
