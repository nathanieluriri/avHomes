/**
 * Email delivery and the Hostinger mailboxes, as the console sees them.
 *
 * The API key itself never appears on any of these shapes. The console learns
 * only whether one is saved and its last four characters.
 */

export type MailProvider = "hostinger" | "resend" | "none";

export interface MailSettingsView {
  /** What an outgoing email will actually use right now. */
  provider: MailProvider;
  keySaved: boolean;
  keyLast4: string | null;
  /** A key is saved but no longer decrypts, which is what rotating SESSION_SECRET does. */
  keyUnreadable: boolean;
  /** HOSTINGER_MAIL_API_KEY is set on the deployment, used when no key is saved here. */
  envKey: boolean;
  /** Empty means "the first mailbox the key can reach". */
  senderMailboxId: string;
  senderAddress: string;
  displayName: string;
  resendConfigured: boolean;
  updatedAt: number;
}

export interface MailboxRef {
  resourceId: string;
  address: string;
}

/** IMAP reports STORAGE in KiB, whatever the Hostinger docs say about bytes. */
export interface MailQuota {
  supported: boolean;
  storageUsedKb: number;
  storageLimitKb: number;
  storagePercent: number;
  messages: number;
  messageLimit: number;
}

export interface MailboxSummary extends MailboxRef {
  /** Null when the quota read failed; the mailbox is still usable. */
  quota: MailQuota | null;
}

export interface MailFolder {
  path: string;
  name: string;
  delimiter: string;
  /** `\Inbox`, `\Sent`, `\Trash`, `\Junk`, `\Drafts`, or null for a folder somebody made. */
  specialUse: string | null;
  messageCount: number;
  unreadCount: number;
}

export interface MailAddress {
  name: string;
  address: string;
}

export interface MailAttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
}

export interface MailMessageSummary {
  uid: number;
  folder: string;
  date: string;
  flags: string[];
  unseen: boolean;
  flagged: boolean;
  size: number;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  attachments: MailAttachmentInfo[];
}

export interface MailMessageDetail extends MailMessageSummary {
  bcc: MailAddress[];
  text: string;
  html: string;
}

export interface MailMessagePage {
  items: MailMessageSummary[];
  page: number;
  totalPages: number;
  total: number;
  /** A merged or post-filtered list stopped at its scan window, so `total` is a floor. */
  capped?: boolean;
}

/**
 * The list's filters, as query parameters. Hostinger's search ANDs them.
 *
 * `to` also matches mail delivered to that address without naming it in To
 * (Bcc, forwarded aliases), through the `Received: ... for <address>` trace.
 * `attachment` has no search criterion upstream, so the server filters it over
 * the newest matches itself.
 */
export interface MailListFilters {
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  /** YYYY-MM-DD, inclusive. */
  since?: string;
  /** YYYY-MM-DD, exclusive. */
  before?: string;
  attachment?: "1";
}

/** An address on the mailbox's own domain that recent mail was sent to. */
export interface MailRecipient {
  address: string;
  /** How many of the recent inbox messages named it in To or Cc. */
  count: number;
}

/**
 * The subject of the invite claim code email.
 *
 * One constant, because the mail console hides every message whose subject
 * carries SIGN_IN_CODE_MARKER from anybody but the owner, and a reworded
 * subject would silently stop matching.
 */
export const SIGN_IN_CODE_SUBJECT = "Your AVHomes sign-in code";
/** Matched case-insensitively anywhere in a subject, so replies and forwards are caught too. */
export const SIGN_IN_CODE_MARKER = "avhomes sign-in code";

/* ──────────────────────────── the mail console's own state ──────────────────────────── */

/** Someone the mailbox has written to or heard from, harvested from Inbox and Sent. */
export interface MailContact {
  name: string;
  address: string;
  /** Messages seen with them on From, To or Cc. */
  count: number;
  /** Epoch ms of the newest of those. */
  lastAt: number;
}

export type MailDensity = "comfortable" | "compact";

/** A compose window left open, restored on the next visit. */
export interface MailComposeWindow {
  id: string;
  minimized: boolean;
  expanded: boolean;
}

/** Where a member left the Mailboxes page. Every field is optional on the wire. */
export interface MailViewState {
  mailbox: string;
  folder: string;
  search: string;
  filters: Omit<MailListFilters, "q">;
  /** The date chip's named range, e.g. "30d", so it keeps its label. */
  preset: string | null;
  page: number;
  /** The message that was open. */
  open: { folder: string; uid: number } | null;
  compose: MailComposeWindow[];
}

export interface MailPrefs {
  view: MailViewState | null;
  density: MailDensity;
  /** Addresses last used in the Sent to filter, newest first. */
  recentTo: string[];
  updatedAt: number;
}

export type MailComposeMode = "text" | "html";

export interface MailDraft {
  id: string;
  /** The mailbox it sends from. */
  mailbox: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  mode: MailComposeMode;
  inReplyTo: { uid: number; folder: string } | null;
  forwardOf: { uid: number; folder: string } | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface MailStateResponse {
  prefs: MailPrefs;
  drafts: MailDraft[];
}

/** How often and how lately, in one number. Recency halves over about two weeks. */
function contactWeight(c: MailContact, now: number): number {
  const days = Math.max(0, (now - c.lastAt) / 86_400_000);
  return Math.log2(1 + c.count) + 4 / (1 + days / 14);
}

/**
 * Contacts for a typed fragment, best first: a name word, the local part, the
 * domain or the whole address starting with it beats one merely containing
 * it, and within each tier the frequent and recent come first. An empty
 * fragment ranks everybody, for the suggestion circles.
 *
 * Shared by the contacts route and the composer, which ranks locally so a
 * keystroke costs no request.
 */
export function rankContacts(contacts: MailContact[], query: string, limit: number, now = Date.now()): MailContact[] {
  const q = query.trim().toLowerCase();
  const scored: { c: MailContact; tier: number; weight: number }[] = [];
  for (const c of contacts) {
    const address = c.address.toLowerCase();
    let tier = 0;
    if (q !== "") {
      const [local = "", domain = ""] = address.split("@");
      const words = c.name.toLowerCase().split(/[\s.,'"()-]+/u);
      const prefix =
        address.startsWith(q) || local.startsWith(q) || domain.startsWith(q) || words.some((w) => w.startsWith(q)) ||
        c.name.toLowerCase().startsWith(q);
      if (prefix) tier = 0;
      else if (address.includes(q) || c.name.toLowerCase().includes(q)) tier = 1;
      else continue;
    }
    scored.push({ c, tier, weight: contactWeight(c, now) });
  }
  scored.sort((a, b) => a.tier - b.tier || b.weight - a.weight);
  return scored.slice(0, limit).map((s) => s.c);
}
