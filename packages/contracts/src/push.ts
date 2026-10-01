/**
 * Push notifications and the two installable apps they reach.
 *
 * Standard Web Push (VAPID), not a vendor SDK: Chrome, Edge, Firefox and Safari
 * all deliver through their own push service, which is what Pusher Beams and
 * Firebase wrap. Going direct keeps iPhones in (Beams' web SDK has no Safari)
 * and needs no third party account.
 */

/** The partner app at `/m` and the console at `/admin`. A device subscribes to one. */
export const PUSH_APPS = ["m", "admin"] as const;
export type PushApp = (typeof PUSH_APPS)[number];

/** Where each app's service worker is registered, and the start of every link it opens. */
export const PUSH_SCOPE: Record<PushApp, string> = { m: "/m", admin: "/admin" };

export const PUSH_KINDS = [
  // The partner app.
  "deal-approved",
  "deal-refused",
  "deal-info",
  "share-earned",
  "pay-sent",
  "issue-reply",
  "account-paused",
  "account-active",
  "partner-joined",
  "update",
  // The console.
  "mail-received",
  "mail-failed",
  "enquiry",
  "marketing-deal",
  "marketing-issue",
  "marketing-bank",
  "partner-application",
  "quota-request",
  "note-created",
  "note-updated",
  "template-request",
  // Either.
  "test",
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** One notification, as the sender writes it. The service worker draws it as given. */
export interface PushMessage {
  kind: PushKind;
  /** Short enough for a lock screen: about 50 characters. */
  title: string;
  /** One or two lines. Never an admin's free text at length. */
  body: string;
  /** A path inside the app's own scope, opened on tap. */
  url: string;
  /**
   * Replaces an earlier notification with the same tag instead of stacking a
   * second one, e.g. one per mailbox for new mail.
   */
  tag?: string;
}

/** What the service worker receives. `id` is the ledger row, so a tap can be recorded. */
export interface PushPayload extends PushMessage {
  id: string;
  /** The app's unread count when the sender knows it, for the icon badge. */
  badge?: number;
}

/**
 * How one send to one person went, recorded per send.
 *
 * `no-device` is the one to watch: the person has never turned notifications on,
 * or every device they had has gone, so nothing reached them.
 */
export const PUSH_OUTCOMES = ["delivered", "partial", "failed", "no-device"] as const;
export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

export interface PushDeviceView {
  id: string;
  app: PushApp;
  /** "Chrome on Android", worked out from the user agent when it subscribed. */
  label: string;
  createdAt: number;
  lastOkAt: number | null;
}

export interface PushLogView {
  id: string;
  kind: PushKind;
  title: string;
  body: string;
  outcome: PushOutcome;
  devices: number;
  delivered: number;
  createdAt: number;
  openedAt: number | null;
}

export interface PushDevicesResponse {
  devices: PushDeviceView[];
  recent: PushLogView[];
}

/** The key pair, shown in full to the owner and developers under Settings. */
export interface PushKeysView {
  publicKey: string;
  privateKey: string;
  /** `generated` when the server made it, `pasted` when somebody saved their own. */
  source: "generated" | "pasted";
  createdAt: number;
  updatedAt: number;
}

/** Settings, Push notifications: the keys and what the ledger says about the last week. */
export interface PushSettingsResponse {
  keys: PushKeysView;
  devices: Record<PushApp, number>;
  /** Sends in the last seven days, one per person per notification, by outcome. */
  week: Record<PushOutcome, number>;
  /** Of those, how many were tapped open. */
  opened: number;
}

/** A device's subscription, as `PushSubscription.toJSON()` gives it. */
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * A readable name for a device, from its user agent. Coarse on purpose: it only
 * has to tell "my phone" from "my laptop" in a list of two or three.
 */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent;
  const browser = /Edg\//u.test(ua)
    ? "Edge"
    : /OPR\/|Opera/u.test(ua)
      ? "Opera"
      : /SamsungBrowser/u.test(ua)
        ? "Samsung Internet"
        : /Firefox\//u.test(ua)
          ? "Firefox"
          : /Chrome\//u.test(ua)
            ? "Chrome"
            : /Safari\//u.test(ua)
              ? "Safari"
              : "Browser";
  const os = /iPhone/u.test(ua)
    ? "iPhone"
    : /iPad/u.test(ua)
      ? "iPad"
      : /Android/u.test(ua)
        ? "Android"
        : /Mac OS X/u.test(ua)
          ? "Mac"
          : /Windows/u.test(ua)
            ? "Windows"
            : /Linux/u.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}

/* ─────────────────────────────── unsent mail ─────────────────────────────── */

/**
 * An email the site tried to send and could not.
 *
 * Metadata only. The body is not kept: half of what the site sends is a sign-in
 * code or a reset link, and a copy of either in the database outlives its use.
 */
export interface MailFailure {
  id: string;
  to: string;
  subject: string;
  /** The provider's reason, as it gave it, cut to one line. */
  reason: string;
  at: number;
}

export interface MailFailuresResponse {
  items: MailFailure[];
  /** Failures since the list was last cleared. The alert and the rail read this. */
  open: number;
  clearedAt: number;
}

/** Whether new mail reaches the console as a notification, per mailbox. */
export interface MailWatchView {
  state: "on" | "off" | "no-key" | "not-production";
  mailboxes: { address: string; watching: boolean }[];
  updatedAt: number;
}
