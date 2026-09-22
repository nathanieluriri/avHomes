/**
 * The guided walkthroughs, as data.
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
  "list-an-estate",
  "log-a-change",
  "reply-to-an-enquiry",
  "write-a-journal-post",
  "check-a-deal",
  "pay-your-marketers",
  "set-commission-rates",
  "sort-a-payment-problem",
  "follow-a-buyer",
  "record-a-sale",
  "read-the-money",
  "spend-the-fund",
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
export type SpotlightSignal =
  | "enquiry-replied"
  | "note-saved"
  | "problem-replied"
  /**
   * The record-a-sale sheet opened. Reported rather than watched for, because the
   * step before it sits on a picker whose options are portaled below the trigger:
   * a step that held the screen would block the very press it is asking for, and
   * once the sheet is up it is a dialog the card would otherwise step aside from,
   * leaving nothing to press. A signal crosses both.
   */
  | "sale-sheet-open";

export type SpotlightPlacement = "top" | "bottom" | "left" | "right";

/** Copy said instead of a step's own while `anchor` is on the page. `title` is optional. */
export interface WhenCopy {
  anchor: string;
  body: string;
  title?: string;
}

/** A step's `bodyWhen`, always as a list, in the order it is tried. */
export function whenCopies(step: { bodyWhen?: WhenCopy | readonly WhenCopy[] }): readonly WhenCopy[] {
  const when = step.bodyWhen;
  if (when === undefined) return [];
  return "anchor" in when ? [when] : when;
}

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
  /**
   * Replaces the copy while one of these anchors is on the page, such as the list
   * of what still blocks Publish. Several are tried in order and the first found
   * wins, which is how one step speaks to staff and to a partner lister, whose
   * picker offers Send for review where staff have Publish.
   */
  bodyWhen?: WhenCopy | readonly WhenCopy[];
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
  /** The screen "Try it now" lands on. A bare pathname: `matchPath` reads it. */
  start: string;
  /**
   * Query the screen needs to open in the state the first step expects, such as a
   * list filtered to the only status the tour can work on. Kept off `start` so
   * that stays a pathname, and appended by `tryHrefOf`.
   */
  startQuery?: string;
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
      also: ["listing-blockers", "listing-review-blockers"],
      page: LISTING,
      title: "Publish when ready",
      body: "When it reads right, press Publish. That's the whole flow.",
      /* A partner lister cannot publish: their picker offers Send for review, and
         the listing page marks that with its own two anchors. Tried first, so a
         partner is never told to press a button they do not have. */
      bodyWhen: [
        {
          anchor: "listing-review-blockers",
          title: "Send it for review when it is ready",
          body: "Send for review unlocks once the list below is clear. Fill those in and save, then send it: AV Homes checks it and puts it live. That's the whole flow.",
        },
        {
          anchor: "listing-review-only",
          title: "Send it for review",
          body: "When it reads right, choose Send for review. AV Homes checks it and puts it live, or sends it back with what to change. That's the whole flow.",
        },
        {
          anchor: "listing-blockers",
          body: "Publish unlocks once the list below is clear. Fill those in, save, then press Publish. That's the whole flow.",
        },
      ],
      advance: "manual",
      final: true,
    },
  ],
};

/**
 * An estate is a development, not a house, so it is listed differently: no
 * single price, a table of options, and a payment plan. This walks the parts
 * that only an estate has and leaves the rest to `add-a-listing`.
 */
const listAnEstate: SpotlightTour = {
  id: "list-an-estate",
  title: "List an estate",
  start: LISTINGS,
  record: { noun: "estate", draft: "listing-draft", notDraft: "listing-not-draft" },
  steps: [
    {
      anchor: "new-listing",
      page: LISTINGS,
      title: "Start the estate",
      body: "An estate is one listing that holds every house and plot inside it. Press New listing.",
      advance: "click",
    },
    {
      anchor: "new-listing-form",
      page: LISTINGS,
      title: "Press Estate, then name it",
      body: "Estate rather than Home is the whole fork: it opens a different form. Name the development, not one house in it, then press Create.",
      advance: "route",
      route: LISTING,
      binds: true,
    },
    {
      anchor: "listing-deal",
      page: LISTING,
      title: "Type is already Estate Land",
      body: "It came from the choice you just made, and it is what brings in the options table and the payment plan. There is no Sale or Rent switch here: an estate is sold, not let. Rent belongs to the single home types in this list.",
      advance: "manual",
    },
    {
      anchor: "listing-options",
      page: LISTING,
      title: "Add every option",
      body: "One row per thing a buyer can pick: a bungalow, a duplex, an apartment, or a plot. The chips add a row of that shape, Enter in a price adds the next one, and a plot needs no name because its size is its name.",
      advance: "manual",
      placement: "left",
    },
    {
      anchor: "listing-payment-plan",
      page: LISTING,
      title: "Spread the balance",
      body: "Deposit up front, the rest over so many months. The example under it uses your cheapest option, so you see the real monthly figure before you save.",
      advance: "manual",
      placement: "left",
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
      body: "Press Choose from library. Renders are fine for an off-plan estate, and each option can carry its own picture in the table above.",
      advance: "click",
    },
    {
      anchor: "savebar-save",
      page: LISTING,
      title: "Save the draft",
      body: "Press Save. Nothing is public yet.",
      whenNotDraft: {
        title: "Save your changes",
        body: "Press Save. This estate is no longer a draft, so if it is live the site changes straight away.",
      },
      advance: "click",
      placement: "top",
      skipIfMissing: true,
    },
    {
      anchor: "listing-publish",
      also: ["listing-blockers", "listing-review-blockers"],
      page: LISTING,
      title: "Publish when ready",
      body: "The estate's price is worked out from its options, so it reads as a from price on the site. When it looks right, press Publish. That's the whole flow.",
      // A partner lister sends it for review instead: see the same step in `add-a-listing`.
      bodyWhen: [
        {
          anchor: "listing-review-blockers",
          title: "Send it for review when it is ready",
          body: "Send for review unlocks once the list below is clear. Fill those in and save, then send it: AV Homes checks it and puts it live. That's the whole flow.",
        },
        {
          anchor: "listing-review-only",
          title: "Send it for review",
          body: "The estate's price is worked out from its options. When it looks right, choose Send for review: AV Homes checks it and puts it live. That's the whole flow.",
        },
        {
          anchor: "listing-blockers",
          body: "Publish unlocks once the list below is clear. Fill those in, save, then press Publish. That's the whole flow.",
        },
      ],
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

const DEALS = "/admin/marketers/deals";
const DEAL = "/admin/marketers/deals/*";

/* Approving or cancelling ends what this walkthrough can show on a deal. Asking for
   info or refusing does not: the deal can still be approved afterwards. */
const DEAL_DECIDED = {
  anchor: "deal-decided",
  title: "This deal is already decided",
  body: "Only a deal that is still waiting can be approved or refused. Pick one from Waiting to walk through it.",
  restart: { href: DEALS, label: "Pick a waiting deal" },
};

const checkADeal: SpotlightTour = {
  id: "check-a-deal",
  title: "Check a deal",
  start: DEALS,
  steps: [
    {
      anchor: "deal-row",
      page: DEALS,
      title: "Open a waiting deal",
      body: "A marketer says they closed this one. Open it to check the proof.",
      advance: "route",
      route: DEAL,
      detour: {
        anchor: "deal-find-waiting",
        title: "Find a waiting deal",
        body: "Choose Waiting to see the deals nobody has checked yet.",
      },
      none: {
        anchor: "deal-none",
        title: "Nothing to check yet",
        body: "No deal is waiting right now. Try this again when a marketer reports one.",
      },
    },
    {
      anchor: "deal-proof",
      page: DEAL,
      title: "Check the proof",
      body: "Click a photo to open it full size, and check it against the listing and the amount.",
      advance: "manual",
      none: DEAL_DECIDED,
    },
    {
      anchor: "deal-amount",
      page: DEAL,
      title: "Correct the final amount",
      body: "If the receipt or the note says something else, type what was really paid. The split under it follows when you leave the field.",
      advance: "manual",
      none: DEAL_DECIDED,
    },
    {
      anchor: "deal-split",
      page: DEAL,
      title: "See who gets paid",
      body: "Level 1 closed it, level 2 invited them, level 3 invited that person. Approving writes exactly these amounts.",
      advance: "manual",
      none: DEAL_DECIDED,
    },
    {
      anchor: "deal-decide",
      page: DEAL,
      title: "Decide",
      body: "Press Approve deal when the proof holds up, and the money is owed to everyone above. To ask for more or to refuse, write the reason first: the marketer reads it. That's the whole flow.",
      advance: "manual",
      final: true,
      none: DEAL_DECIDED,
    },
  ],
};

const PAY = "/admin/marketers/pay";

const NOTHING_TO_PAY = {
  anchor: "pay-none",
  title: "Nobody is waiting to be paid",
  body: "Everyone on this list is paid or held. Try this again when next month's list is made.",
};

const payYourMarketers: SpotlightTour = {
  id: "pay-your-marketers",
  title: "Pay your marketers",
  start: PAY,
  steps: [
    {
      anchor: "pay-list",
      page: PAY,
      title: "One row per person",
      body: "Each row is one transfer to send: who, the account it goes to, and how much.",
      advance: "manual",
      detour: {
        anchor: "pay-make",
        title: "Make this month's list",
        body: "Press Make this month's list. It gathers everything approved up to the cut off day, one row per person. No money moves.",
      },
      none: NOTHING_TO_PAY,
    },
    {
      anchor: "pay-copy",
      page: PAY,
      title: "Copy the account number",
      body: "Then send the transfer from your bank's own app. Nothing on this screen moves money.",
      advance: "manual",
      none: NOTHING_TO_PAY,
    },
    {
      anchor: "pay-mark",
      page: PAY,
      title: "Record it once it has gone",
      body: "When the money has left your bank, press Mark as paid, type the bank reference, add the receipt and press Record the payment. The marketer sees both on their own screen. That's the whole flow.",
      advance: "manual",
      final: true,
      none: NOTHING_TO_PAY,
    },
  ],
};

const COMMISSION = "/admin/marketers/settings";

const setCommissionRates: SpotlightTour = {
  id: "set-commission-rates",
  title: "Set commission rates",
  start: "/admin/marketers",
  steps: [
    {
      anchor: "commission-link",
      page: "/admin/marketers",
      title: "Open Commission",
      body: "Commission has no row of its own in the menu. It sits at the top of this screen.",
      advance: "route",
      route: COMMISSION,
    },
    {
      anchor: "commission-sale-rates",
      page: COMMISSION,
      title: "Four rows, five shares each",
      body: "AV Homes' own stock and somebody else's are priced separately, because AV Homes earns far less on a house it does not own. Direct closed the deal, upline 1 invited them, upline 2 invited that person, and the last two go to the funds.",
      advance: "manual",
    },
    {
      anchor: "commission-example",
      page: COMMISSION,
      title: "Read what it pays",
      body: "This follows what you type, so you can see what a real sale pays each level before anything is saved.",
      advance: "manual",
      placement: "left",
    },
    {
      anchor: "savebar-save",
      page: COMMISSION,
      title: "Save when the numbers are right",
      body: "Deals approved from then on use the new rates. A deal already approved keeps the rates it was approved at. Discard puts the old ones back.",
      advance: "manual",
      final: true,
      placement: "top",
      detour: {
        anchor: "commission-sale-rates",
        title: "Change a rate first",
        body: "Save appears once a number here is different. Type a new rate, or press Escape to leave the walkthrough.",
      },
    },
  ],
};

const PROBLEMS = "/admin/marketers/problems";

const sortAPaymentProblem: SpotlightTour = {
  id: "sort-a-payment-problem",
  title: "Sort a payment problem",
  start: PROBLEMS,
  steps: [
    {
      anchor: "problem-open",
      page: PROBLEMS,
      title: "Open the problem",
      body: "A marketer says this money never arrived. Open it to read what they said.",
      advance: "click",
      detour: {
        anchor: "problems-find-open",
        title: "Find an open problem",
        body: "Choose Open to see the problems nobody has sorted yet.",
      },
      none: {
        anchor: "problems-none",
        title: "Nothing to sort right now",
        body: "No marketer has an open payment problem. Try this again when one comes in.",
      },
    },
    {
      anchor: "problem-thread",
      page: PROBLEMS,
      title: "Read the thread",
      body: "What they told you, and anything already said back. Their messages are grey, ours are wine.",
      advance: "manual",
    },
    {
      anchor: "problem-reply",
      page: PROBLEMS,
      title: "Write your reply",
      body: "Say what happened and give the bank reference. They read it in the app, on their phone.",
      advance: "input",
    },
    {
      anchor: "problem-receipt",
      page: PROBLEMS,
      title: "Attach the receipt",
      body: "Optional. A screenshot of the transfer is the proof they can take to their bank.",
      advance: "manual",
    },
    {
      anchor: "problem-send",
      page: PROBLEMS,
      title: "Send it",
      body: "This is a real reply: it goes to their app straight away. Sending it moves you on to the last step.",
      advance: "signal",
      signal: "problem-replied",
      hint: "Moves on when it sends",
      pending: {
        body: "Sending your reply.",
        until: "signal",
        failed: "That didn't send. The reason is shown above the conversation and your words are still there. Press Send reply to try again.",
      },
    },
    {
      anchor: "problem-sort",
      page: PROBLEMS,
      title: "Mark as sorted once it lands",
      body: "When they say the money arrived, press Mark as sorted. It leaves the Open list and the whole thread is kept under Sorted. That's the whole flow.",
      advance: "manual",
      final: true,
    },
  ],
};

const BUYERS = "/admin/marketers/buyers";
const BUYER = "/admin/marketers/buyers/*";

/**
 * A marketer handed over somebody who might buy. This is the console side of
 * that: read what they wrote, call the person, and record the move in words the
 * marketer will read on their phone.
 */
const followABuyer: SpotlightTour = {
  id: "follow-a-buyer",
  title: "Follow up a buyer",
  start: BUYERS,
  steps: [
    {
      anchor: "buyer-row",
      page: BUYERS,
      title: "Open a new buyer",
      body: "New means a marketer sent them in and nobody has called yet. Open this one.",
      advance: "route",
      route: BUYER,
      detour: {
        anchor: "buyer-find-new",
        title: "Find a new buyer",
        body: "Choose New to see the buyers nobody has picked up yet.",
      },
      none: {
        anchor: "buyer-none",
        title: "Everybody has been picked up",
        body: "No buyer is waiting for a first call. Try this again when a marketer sends one in.",
      },
    },
    {
      anchor: "buyer-timeline",
      page: BUYER,
      title: "Read what the marketer wrote",
      body: "Oldest at the bottom. This is the whole history, and it is the same list they read on their phone: there is no private note anywhere on this screen.",
      advance: "manual",
    },
    {
      anchor: "buyer-move",
      page: BUYER,
      title: "Pick the move",
      body: "Where they have got to after your call: We called them, Meeting booked, They viewed, Talking price, Bought or Closed.",
      advance: "manual",
    },
    {
      anchor: "buyer-reason",
      page: BUYER,
      title: "Say why",
      body: "One of these is required. The list changes with the move, so the reason always fits it.",
      advance: "manual",
    },
    {
      anchor: "buyer-note",
      page: BUYER,
      title: "Write what happened",
      body: "A few plain words. The marketer reads this, and it is what keeps them sending you people.",
      advance: "input",
    },
    {
      anchor: "buyer-save",
      page: BUYER,
      title: "Move it along",
      body: "This writes the move and the words onto their phone straight away. Bought is the end of the line: it creates an approved deal and pays the marketer their commission. That's the whole flow.",
      advance: "manual",
      final: true,
    },
  ],
};

/* ═══════════════════════════════════════════════════════════ THE MONEY ════ */

const ANALYTICS = "/admin/analytics";
const TRANSACTIONS = "/admin/analytics/transactions";
const WALLETS = "/admin/analytics/wallets";

/**
 * The one door from live to closed. This walks the sheet rather than describing
 * it from the trigger, because it is the only place in the console where money,
 * proof and a listing's state are written in a single press.
 *
 * The split panel is left out on purpose. It sits below the sheet's pinned footer
 * and the sheet's own scroller does not reach it, so a step pointing at it would
 * hold on something the reader cannot be shown. `read-the-money` opens the same
 * breakdown on a screen that can scroll to it.
 */
const recordASale: SpotlightTour = {
  id: "record-a-sale",
  title: "Record a sale",
  start: LISTINGS,
  /* Listings opens on All, where the first row is whatever was touched last and
     may well be a draft. The detour below still covers somebody who walks in on
     another tab; this is so "Try it now" does not start on one. */
  startQuery: "status=live",
  steps: [
    {
      anchor: "listing-live-row",
      page: LISTINGS,
      title: "Open the listing that sold",
      body: "Only a live listing can be sold, so this is the Live tab. Open the one the money came in on.",
      advance: "route",
      route: LISTING,
      detour: {
        anchor: "listing-find-live",
        title: "Show the live ones",
        body: "Choose Live. A draft has never been on the market, and an archived one is already off it.",
      },
      none: {
        anchor: "listing-none-live",
        title: "Nothing is live right now",
        body: "There is no listing on the market to sell. Publish one first, then come back.",
        restart: { href: "/admin/properties?status=draft", label: "See the drafts" },
      },
    },
    {
      /* No Next on this one: the sheet itself reports that it opened. The options
         are portaled below the trigger, so a step that held the screen would block
         the press it is asking for, and a `manual` step would then go aside behind
         the sheet with no button left to move it on. */
      anchor: "listing-publish",
      page: LISTING,
      title: "Open the status picker",
      body: "Everything a listing can do next is in here. Choose Record the sale: it is the only way to closed, because closing without the money and the proof would lose both.",
      advance: "signal",
      signal: "sale-sheet-open",
      hint: "Choose Record the sale.",
      placement: "left",
      /* A live listing whose sale is already on the record offers no Record the
         sale, only the banner that takes it down, so the run ends there with the
         reason rather than waiting on a choice that is not in the picker. */
      none: {
        anchor: "listing-sold-still-listed",
        title: "This one is sold already",
        body: "Its sale is on the record, so there is nothing to record. Take it off the market with the button here, then try this on another live listing.",
        restart: { href: "/admin/properties?status=live", label: "Pick another listing" },
      },
    },
    {
      anchor: "sale-ownership",
      page: LISTING,
      title: "Whose property it is",
      body: "This decides what the sale pays out. AV Homes' own stock pays its people far more than somebody else's does, and the sheet says which before you type a figure.",
      advance: "manual",
      waitMs: 6000,
    },
    {
      anchor: "sale-amount",
      page: LISTING,
      title: "What it actually sold for",
      body: "The asking price is already here. Type what was really paid when the two differ: every share below is a percentage of this one number.",
      advance: "input",
    },
    {
      anchor: "sale-closer",
      page: LISTING,
      title: "Who closed it",
      body: "A marketer is paid, and so are the two people above them. Staff and walk-ins are paid nothing. Both funds take their share either way.",
      advance: "manual",
    },
    {
      anchor: "sale-buyer",
      page: LISTING,
      title: "Who bought it",
      body: "The name and the number are what make this record worth anything a year from now.",
      advance: "input",
    },
    {
      anchor: "sale-proof",
      page: LISTING,
      title: "The proof",
      body: "A receipt, a bank alert, or the signed agreement. At least one, and the form will not go on without it.",
      advance: "manual",
    },
    {
      anchor: "sale-confirm",
      page: LISTING,
      title: "Record it and close the listing",
      body: "One press, because it does both: the money goes on the record and the house comes off the market. If it falls through, cancel the deal and the commission reverses and both funds give their share back. That's the whole flow.",
      advance: "manual",
      final: true,
      placement: "top",
    },
  ],
};

const NO_TRANSACTIONS = {
  anchor: "tx-none",
  title: "No deals in this window",
  body: "Nothing was recorded over the period you chose. Widen it, or record a sale from a listing and it lands here.",
};

/** What was transacted, who was paid out of it, and what AV Homes kept. */
const readTheMoney: SpotlightTour = {
  id: "read-the-money",
  title: "Read where the money went",
  start: ANALYTICS,
  steps: [
    {
      anchor: "analytics-period",
      page: ANALYTICS,
      title: "Everything here answers for one window",
      body: "Pick it first. Every figure on every analytics screen is measured over this, and it stays chosen as you move between them.",
      advance: "manual",
    },
    {
      anchor: "analytics-transacted",
      page: ANALYTICS,
      title: "Four numbers, in the order they get asked about",
      body: "What was transacted, how many deals made it, what went out as commission, and what AV Homes kept. Press Transacted to see it by day.",
      advance: "click",
      pending: { body: "Drawing the chart.", until: "next" },
    },
    {
      anchor: "analytics-value-chart",
      page: ANALYTICS,
      title: "The same number, by day",
      body: "One line, because two would need two scales, and a chart with two scales can be read to mean anything.",
      advance: "manual",
    },
    {
      anchor: "analytics-ownership",
      page: ANALYTICS,
      title: "Whose property it was",
      body: "The split that explains the gap between what was transacted and what was kept. A month of somebody else's stock earns far less than the same month of your own.",
      advance: "manual",
    },
    {
      anchor: "analytics-funds",
      page: ANALYTICS,
      title: "What the two funds hold",
      body: "Held now, all time: a balance is every deal ever, not this window. That is why the line under it says so.",
      advance: "manual",
    },
    {
      anchor: "analytics-transactions-link",
      page: ANALYTICS,
      title: "The deals behind the totals",
      body: "Each of those four figures is a sum. This is what it was summed from.",
      advance: "route",
      route: TRANSACTIONS,
    },
    {
      anchor: "tx-filters",
      page: TRANSACTIONS,
      title: "Narrow it to the question you have",
      body: "Whose property, sale or rent, and who closed it. The three figures above follow the filters, so the total always belongs to the list under it.",
      advance: "manual",
      none: NO_TRANSACTIONS,
    },
    {
      anchor: "tx-split",
      page: TRANSACTIONS,
      title: "Open one deal",
      body: "Every share by name: who closed it, the two people above them, both funds, and what AV Homes kept. It adds back up to the sale. That's the whole flow.",
      advance: "manual",
      final: true,
      none: NO_TRANSACTIONS,
    },
  ],
};

/** A share of every deal goes in. This is the only way some of it comes out. */
const spendTheFund: SpotlightTour = {
  id: "spend-the-fund",
  title: "Spend the community fund",
  start: WALLETS,
  steps: [
    {
      anchor: "fund-foundation",
      page: WALLETS,
      title: "What the fund holds",
      body: "A share of every recorded deal, whoever closed it. The line under the balance splits it into what came in and what has gone out.",
      advance: "manual",
    },
    {
      anchor: "fund-foundation-history",
      page: WALLETS,
      title: "Where it came from",
      body: "Every movement, with its date and the rate it was taken at. Nothing arrives in this fund without a deal behind it.",
      advance: "manual",
    },
    {
      anchor: "fund-spend",
      page: WALLETS,
      title: "Pay some of it out",
      body: "This is the only way money leaves the fund, and it cannot be taken past what the fund holds.",
      advance: "click",
      pending: { body: "Opening the form.", until: "next" },
    },
    {
      anchor: "spend-amount",
      page: WALLETS,
      title: "How much",
      body: "Up to the balance, never past it. It says so before the button will go.",
      advance: "input",
    },
    {
      anchor: "spend-what",
      page: WALLETS,
      title: "What it paid for",
      body: "Write it for somebody reading this in a year with no memory of the day. A borehole, a scholarship, a clinic: these words are the whole record.",
      advance: "input",
    },
    {
      anchor: "spend-receipt",
      page: WALLETS,
      title: "The receipt",
      body: "At least one. Money leaving a community fund with no evidence behind it is the thing this screen exists to prevent.",
      advance: "manual",
    },
    {
      anchor: "spend-confirm",
      page: WALLETS,
      title: "Record the payment",
      body: "The balance drops by exactly this, and the payment joins the history with its receipt on it. Nothing here is ever deleted: a mistake is corrected by a new entry the other way. That's the whole flow.",
      advance: "manual",
      final: true,
      placement: "top",
    },
  ],
};

export const SPOTLIGHT_TOURS: Record<SpotlightTourId, SpotlightTour> = {
  "add-a-listing": addAListing,
  "list-an-estate": listAnEstate,
  "log-a-change": logAChange,
  "reply-to-an-enquiry": replyToAnEnquiry,
  "write-a-journal-post": writeAJournalPost,
  "check-a-deal": checkADeal,
  "pay-your-marketers": payYourMarketers,
  "set-commission-rates": setCommissionRates,
  "sort-a-payment-problem": sortAPaymentProblem,
  "follow-a-buyer": followABuyer,
  "record-a-sale": recordASale,
  "read-the-money": readTheMoney,
  "spend-the-fund": spendTheFund,
};

export function isSpotlightTourId(value: string | null | undefined): value is SpotlightTourId {
  return SPOTLIGHT_TOUR_IDS.some((id) => id === value);
}
