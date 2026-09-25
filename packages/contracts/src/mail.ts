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
