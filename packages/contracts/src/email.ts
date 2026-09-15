import type { DocNode } from "./doc";

/**
 * Email templates, subscribers and newsletters: the wire shapes both the API
 * and the console read.
 */

export const EMAIL_TEMPLATE_KEYS = [
  "enquiry-reply",
  "enquiry-follow-up",
  "subscribe-welcome",
  "newsletter",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplateInfo {
  label: string;
  /** When it is sent, in one line. */
  when: string;
  /** The placeholders it understands, written `{{name}}` in the template. */
  variables: readonly { name: string; description: string }[];
  defaultSubject: string;
  defaultBody: string;
}

const CONVERSATION_VARS = [
  { name: "name", description: "The buyer's name" },
  { name: "property", description: "The listing they asked about, or empty" },
  { name: "propertyLink", description: "Link to that listing, or empty" },
  { name: "agentName", description: "Who is signing the email" },
  { name: "conversation", description: "The whole chat so far" },
  { name: "replyLink", description: "A private page where they can reply in the chat" },
] as const;

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateInfo> = {
  "enquiry-reply": {
    label: "Reply to an enquiry",
    when: "Sent to the buyer every time someone on the team replies in the inbox.",
    variables: CONVERSATION_VARS,
    defaultSubject: "Your conversation about {{property}}",
    defaultBody: [
      "Hello {{name}},",
      "",
      "{{agentName}} has replied to your enquiry. Here is the conversation so far.",
      "",
      "{{conversation}}",
      "",
      "Reply to this email, or continue the chat here: {{replyLink}}",
    ].join("\n"),
  },
  "enquiry-follow-up": {
    label: "Follow up with a buyer",
    when: "Sent when someone presses Email the buyer on an enquiry.",
    variables: [...CONVERSATION_VARS, { name: "message", description: "What was written in the composer" }],
    defaultSubject: "Following up on {{property}}",
    defaultBody: [
      "Hello {{name}},",
      "",
      "{{message}}",
      "",
      "For reference, here is our conversation so far.",
      "",
      "{{conversation}}",
      "",
      "Reply to this email, or pick the chat back up here: {{replyLink}}",
      "",
      "{{agentName}}",
    ].join("\n"),
  },
  "subscribe-welcome": {
    label: "Welcome a subscriber",
    when: "Sent once, when somebody subscribes from the site.",
    variables: [{ name: "unsubscribeLink", description: "One click to stop the emails" }],
    defaultSubject: "Thanks for subscribing to AVHomes",
    defaultBody: [
      "Hello,",
      "",
      "Thanks for subscribing. We will send you new listings and articles from the journal now and then, never more than we have something worth saying.",
      "",
      "Changed your mind? Unsubscribe here: {{unsubscribeLink}}",
    ].join("\n"),
  },
  newsletter: {
    label: "Newsletter wrapper",
    when: "Wraps every newsletter. The newsletter itself goes where {{content}} is.",
    variables: [
      { name: "content", description: "The newsletter as written" },
      { name: "unsubscribeLink", description: "One click to stop the emails" },
    ],
    defaultSubject: "{{subject}}",
    defaultBody: [
      "{{content}}",
      "",
      "You are receiving this because you subscribed on the AVHomes site. Unsubscribe: {{unsubscribeLink}}",
    ].join("\n"),
  },
};

export interface EmailTemplate {
  key: EmailTemplateKey;
  subject: string;
  body: string;
  /** False while it is still the built-in default. */
  customised: boolean;
  updatedAt: number | null;
  updatedByName: string | null;
}

/* ─────────────────────────────── audience ─────────────────────────────── */

export interface Subscriber {
  id: string;
  email: string;
  source: string | null;
  createdAt: number;
  unsubscribedAt: number | null;
}

export const NEWSLETTER_STATUSES = ["draft", "sending", "sent"] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export interface Newsletter {
  id: string;
  subject: string;
  /** The inbox preview line under the subject. */
  preheader: string;
  content: DocNode;
  status: NewsletterStatus;
  sentAt: number | null;
  sentCount: number;
  failedCount: number;
  createdAt: number;
  updatedAt: number;
  createdByName: string;
  revision: number;
}

/* ─────────────────────────── template requests ────────────────────────── */

export const TEMPLATE_REQUEST_STATUSES = ["open", "in-progress", "done", "declined"] as const;
export type TemplateRequestStatus = (typeof TEMPLATE_REQUEST_STATUSES)[number];

/** Somebody asking the developer for a new kind of email. */
export interface TemplateRequest {
  id: string;
  title: string;
  description: string;
  /** Uploaded examples: screenshots, GIFs or videos of an email they like. */
  media: string[];
  status: TemplateRequestStatus;
  requestedByName: string;
  createdAt: number;
  updatedAt: number;
  decidedByName: string | null;
}
