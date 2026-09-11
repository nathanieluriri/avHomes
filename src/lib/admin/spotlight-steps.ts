/**
 * The four guided walkthroughs, as data.
 *
 * Each step names a `data-spotlight` anchor on a real console screen, says in
 * one line what to do there, and says what counts as having done it. The engine
 * in `components/admin/spotlight` reads nothing else, so a screen that moves a
 * control only has to move its attribute with it.
 *
 * `page` is the pathname the step lives on, with `*` standing for one segment.
 * It is what lets the engine tell "still loading" from "you went somewhere
 * else", and what decides whether Back can return to the previous step.
 */

export const SPOTLIGHT_TOUR_IDS = [
  "add-a-listing",
  "log-a-change",
  "reply-to-an-enquiry",
  "write-a-journal-post",
] as const;

export type SpotlightTourId = (typeof SPOTLIGHT_TOUR_IDS)[number];

export type SpotlightAdvance =
  /** The anchor is pressed. */
  | "click"
  /** The field holds a value and the person presses Next, or Enter in a one-line field. */
  | "input"
  /** The pathname matches `route`. */
  | "route"
  /** The person presses Next. Clicks elsewhere are not held back on these. */
  | "manual"
  /** The screen reports the job done with `signalSpotlight(signal)`. Clicks elsewhere are not held back. */
  | "signal";

/** What a screen reports through `signalSpotlight`, after the thing actually happened. */
export type SpotlightSignal = "enquiry-replied" | "note-saved";

export type SpotlightPlacement = "top" | "bottom" | "left" | "right";

export interface SpotlightStep {
  /** The `data-spotlight` value of the element to highlight. */
  anchor: string;
  /** Further anchors cut out of the scrim alongside the first, when present. */
  also?: readonly string[];
  /** Pathname pattern of the screen this step lives on. */
  page: string;
  title: string;
  body: string;
  /** Replaces `body` on a touch screen, where a keyboard shortcut is not one. */
  bodyTouch?: string;
  /** Replaces `body` while this anchor is on the page, such as the list of what still blocks Publish. */
  bodyWhen?: { anchor: string; body: string };
  /**
   * Replaces the copy unless the tour's record is known to be a draft. Copy
   * that calls something private is only ever shown on a proven draft.
   */
  whenNotDraft?: { title?: string; body: string };
  advance: SpotlightAdvance;
  /** For a `signal` step: the report that completes it. */
  signal?: SpotlightSignal;
  /** Said in the footer of a step with no Next button, so the card is never a dead end. */
  hint?: string;
  /** Pathname pattern that completes a `route` step. */
  route?: string;
  /**
   * For a `route` step that creates the record: it completes only after its own
   * anchor was used, and every later step runs on that record's id alone.
   */
  binds?: boolean;
  /** Enter in this anchor does the real thing (sends), so the tour never offers Enter or Ctrl+Enter there. */
  enterSends?: boolean;
  /** Preferred side for the explanation on a wide screen. */
  placement?: SpotlightPlacement;
  /**
   * For a `click` or `signal` step whose result takes a moment: the line shown
   * meanwhile, what ends the wait, and for `signal`, what to say when the
   * button comes back without the screen reporting success.
   */
  pending?: { body: string; until: "next" | "gone" | "signal"; failed?: string };
  /** Shown on this anchor, with its own words, while the real one is absent, such as a filter that would reveal it. */
  detour?: { anchor: string; title: string; body: string };
  /** While this anchor is on the page there is nothing to practise on: the run ends, unrecorded, with this card. */
  none?: { anchor: string; title: string; body: string; restart?: { href: string; label: string } };
  /** Passed over quietly when the anchor is absent, such as Save with nothing to save. */
  skipIfMissing?: boolean;
  /** An `input` step the person may leave empty. */
  skippable?: boolean;
  /** How long to look for the anchor before saying it cannot be found. */
  waitMs?: number;
  /**
   * The last step. A `manual` one points at the public or irreversible control
   * and never requires pressing it. Its anchor is drawn only while pressing it
   * is still to come; on a record that is no longer a draft the run simply ends.
   */
  final?: boolean;
}

export interface SpotlightTour {
  id: SpotlightTourId;
  title: string;
  /** Where "Try it now" lands. */
  start: string;
  /**
   * Set for tours on screens the console gates below `lg`. `fine` also rules out
   * touch screens. `gated` says the start screen shows its own wide-screen gate,
   * so the tour adds no second one.
   */
  desktopOnly?: { feature: string; fine?: boolean; gated?: boolean };
  /**
   * The record a `binds` step creates. `draft` is an anchor drawn only while it
   * is a draft, `notDraft` one drawn only while it is not; with neither on the
   * page its state is unknown, which counts as not a draft for copy.
   */
  record?: { noun: string; draft: string; notDraft: string };
  steps: readonly SpotlightStep[];
}

const LISTINGS = "/admin/properties";
const LISTING = "/admin/properties/*";

const addAListing: SpotlightTour = {
  id: "add-a-listing",
  title: "Add a listing",
  start: LISTINGS,
  record: { noun: "listing", draft: "listing-draft", notDraft: "listing-not-draft" },
  steps: [
    {
      anchor: "new-listing",
      page: LISTINGS,
      title: "Start a listing",
      body: "Press New listing. It stays a private draft until you publish it.",
      advance: "click",
    },
    {
      anchor: "new-listing-form",
      page: LISTINGS,
      title: "Name it",
      body: "Type what it is called, then press Create. The name becomes its web address.",
      advance: "route",
      route: LISTING,
      binds: true,
    },
    {
      anchor: "listing-tagline",
      page: LISTING,
      title: "Add a tagline",
      body: "One short line that sells it. It sits under the title.",
      advance: "input",
    },
    {
      anchor: "listing-description",
      page: LISTING,
      title: "Describe it",
      body: "What a buyer should know: the rooms, the finish, the street.",
      advance: "input",
    },
    {
      anchor: "listing-deal",
      page: LISTING,
      title: "Type and deal",
      body: "Pick what kind of property it is, then Sale or Rent.",
      advance: "manual",
    },
    {
      anchor: "listing-price",
      page: LISTING,
      title: "Set the price",
      body: "The full asking amount. Buyers search and sort by it.",
      advance: "input",
    },
    {
      anchor: "listing-location",
      page: LISTING,
      title: "Say where it is",
      body: "City, area and street. Publishing needs the city and the address.",
      advance: "manual",
    },
    {
      anchor: "image-library",
      page: LISTING,
      title: "Add photos",
      body: "Press Choose from library and pick a few. The first one leads the listing.",
      advance: "click",
    },
    {
      anchor: "savebar-save",
      page: LISTING,
      title: "Save the draft",
      body: "Press Save. Nothing is public yet.",
      whenNotDraft: {
        title: "Save your changes",
        body: "Press Save. This listing is no longer a draft, so if it is live the site changes straight away.",
      },
      advance: "click",
      placement: "top",
      skipIfMissing: true,
    },
    {
      anchor: "listing-publish",
      also: ["listing-blockers"],
      page: LISTING,
      title: "Publish when ready",
      body: "When it reads right, press Publish. That's the whole flow.",
      bodyWhen: {
        anchor: "listing-blockers",
        body: "Publish unlocks once the list below is clear. Fill those in, save, then press Publish. That's the whole flow.",
      },
      advance: "manual",
      final: true,
    },
  ],
};

const logAChange: SpotlightTour = {
  id: "log-a-change",
  title: "Log a change",
  start: "/admin/customize",
  desktopOnly: { feature: "the customize studio", gated: true },
  steps: [
    {
      anchor: "customize-markup",
      page: "/admin/customize",
      title: "Switch to Mark up",
      body: "Mark up lets you circle part of the site and say what should change.",
      advance: "click",
    },
    {
      anchor: "customize-frame",
      page: "/admin/customize",
      also: ["customize-freeze"],
      title: "Find the spot",
      body: "Scroll to what you mean, then press Freeze this screen.",
      advance: "manual",
      placement: "left",
    },
    {
      anchor: "customize-freeze",
      page: "/admin/customize",
      title: "Freeze this screen",
      body: "This takes a picture of what you see, ready to draw on.",
      advance: "click",
      pending: {
        body: "Freezing the screen. It takes a few seconds on a page full of photos.",
        until: "next",
      },
    },
    {
      anchor: "markup-surface",
      also: ["markup-tools", "markup-colours"],
      page: "/admin/customize",
      title: "Circle what you mean",
      body: "Pick Circle, Box or Arrow at the top, then drag on the picture.",
      advance: "manual",
      placement: "right",
    },
    {
      anchor: "markup-comment",
      page: "/admin/customize",
      title: "Say what should change",
      body: "A drawing alone is a guess. One or two plain sentences does it.",
      advance: "input",
      placement: "left",
    },
    {
      anchor: "markup-save",
      page: "/admin/customize",
      title: "Save the note",
      body: "Press Save note. It goes straight onto the team's list, and that finishes this walkthrough.",
      advance: "signal",
      signal: "note-saved",
      hint: "Finishes when it saves",
      placement: "left",
      also: ["markup-save-error"],
      pending: {
        body: "Saving your note.",
        until: "signal",
        failed: "That didn't save. The reason is shown above the button and your note is still there. Press Save note to try again.",
      },
      final: true,
    },
  ],
};

const NO_REPLY_BOX = {
  anchor: "enquiry-no-reply",
  title: "This one has no reply box",
  body: "It came from the contact form, so it is answered by email. The walkthrough needs a chat enquiry.",
  restart: { href: "/admin/enquiries", label: "Pick a chat" },
};

const replyToAnEnquiry: SpotlightTour = {
  id: "reply-to-an-enquiry",
  title: "Reply to an enquiry",
  start: "/admin/enquiries",
  steps: [
    {
      anchor: "enquiry-row",
      page: "/admin/enquiries",
      title: "Open a chat",
      body: "Chats are the enquiries you answer from here. Open this one.",
      advance: "route",
      route: "/admin/enquiries/*",
      detour: {
        anchor: "enquiry-find-chat",
        title: "Find a chat",
        body: "No chat is in this list. Choose All to see every enquiry.",
      },
      none: {
        anchor: "enquiry-none",
        title: "Nothing to practise on yet",
        body: "There is no chat enquiry to reply to right now. Contact form enquiries are answered by email. Try this again when a chat comes in.",
      },
    },
    {
      anchor: "enquiry-thread",
      page: "/admin/enquiries/*",
      title: "Read what they asked",
      body: "The whole conversation is here, newest message at the bottom.",
      advance: "manual",
      none: NO_REPLY_BOX,
    },
    {
      anchor: "enquiry-reply",
      page: "/admin/enquiries/*",
      title: "Write your reply",
      body: "Answer in plain words. Enter sends it to them for real, Shift+Enter adds a line.",
      bodyTouch: "Answer in plain words. Nothing goes until you press Send.",
      advance: "input",
      enterSends: true,
      none: NO_REPLY_BOX,
    },
    {
      anchor: "enquiry-send",
      page: "/admin/enquiries/*",
      title: "Send it",
      body: "This is a real reply: they see it here and by email, and the enquiry moves to Open. Sending it finishes the walkthrough.",
      advance: "signal",
      signal: "enquiry-replied",
      hint: "Finishes when it sends",
      also: ["enquiry-send-error"],
      pending: {
        body: "Sending your reply.",
        until: "signal",
        failed: "That didn't send. The reason is shown above the reply box and your words are still there. Press Send to try again.",
      },
      final: true,
      none: NO_REPLY_BOX,
    },
  ],
};

const POST = "/admin/posts/*";
const STUDIO = "/admin/posts/*/advanced";

const writeAJournalPost: SpotlightTour = {
  id: "write-a-journal-post",
  title: "Write a journal post",
  start: "/admin/posts",
  desktopOnly: { feature: "the advanced writing studio", fine: true },
  record: { noun: "post", draft: "post-draft", notDraft: "post-not-draft" },
  steps: [
    {
      anchor: "new-post",
      page: "/admin/posts",
      title: "Start a post",
      body: "Press New post. It opens as a private draft.",
      advance: "route",
      route: POST,
      binds: true,
    },
    {
      anchor: "post-title",
      page: POST,
      title: "Give it a title",
      body: "The headline readers see first. It becomes the web address.",
      whenNotDraft: { body: "The headline readers see first." },
      advance: "input",
    },
    {
      anchor: "post-subtitle",
      page: POST,
      title: "Add a subtitle",
      body: "One sentence that makes someone read on.",
      advance: "input",
    },
    {
      anchor: "post-excerpt",
      page: POST,
      title: "The excerpt",
      body: "The teaser on the journal list. Leave it empty and the opening lines are used.",
      advance: "manual",
    },
    {
      anchor: "image-library",
      page: POST,
      title: "Pick a cover",
      body: "Press Choose from library and pick one image.",
      advance: "click",
    },
    {
      anchor: "post-cover-alt",
      page: POST,
      title: "Describe the cover",
      body: "A few words on what it shows, for readers who can't see it.",
      advance: "input",
      skippable: true,
    },
    {
      anchor: "savebar-save",
      page: POST,
      title: "Save the draft",
      body: "Press Save before you switch editors.",
      whenNotDraft: {
        title: "Save your changes",
        body: "Press Save before you switch editors. This post is no longer a draft, so if it is published readers see the change straight away.",
      },
      advance: "click",
      placement: "top",
      skipIfMissing: true,
    },
    {
      anchor: "post-advanced",
      page: POST,
      title: "Open the writing studio",
      body: "Advanced editor gives the body a whole page to itself.",
      advance: "route",
      route: STUDIO,
    },
    {
      anchor: "post-body",
      page: STUDIO,
      title: "Write the body",
      body: "Type here. ## makes a heading and 1. a numbered list. It saves as you go.",
      advance: "manual",
      placement: "right",
    },
    {
      anchor: "post-publish",
      page: STUDIO,
      title: "Publish when ready",
      body: "When it reads right, press Publish. That's the whole flow.",
      advance: "manual",
      final: true,
    },
  ],
};

export const SPOTLIGHT_TOURS: Record<SpotlightTourId, SpotlightTour> = {
  "add-a-listing": addAListing,
  "log-a-change": logAChange,
  "reply-to-an-enquiry": replyToAnEnquiry,
  "write-a-journal-post": writeAJournalPost,
};

export function isSpotlightTourId(value: string | null | undefined): value is SpotlightTourId {
  return SPOTLIGHT_TOUR_IDS.some((id) => id === value);
}
