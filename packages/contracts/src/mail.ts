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
}
