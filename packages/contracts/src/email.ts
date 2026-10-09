import type { DocNode } from "./doc";

/**
 * Email templates, subscribers and newsletters: the wire shapes both the API
 * and the console read.
 */

export const EMAIL_TEMPLATE_KEYS = [
  "enquiry-reply",
  "enquiry-follow-up",
  "enquiry-transcript",
  "subscribe-welcome",
  "newsletter",
  "partner-application-received",
  "partner-application-approved",
  "partner-application-declined",
  "company-staff-invite",
  "partner-suspended",
  "partner-restored",
  "team-invite",
  "property-partner-welcome",
  "property-partner-whatsapp",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_GROUPS = ["Buyers", "Subscribers", "Listing partners", "Property partners", "Your team"] as const;
export type EmailTemplateGroup = (typeof EMAIL_TEMPLATE_GROUPS)[number];

export interface EmailTemplateInfo {
  label: string;
  group: EmailTemplateGroup;
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

const SIGN_IN_VAR = { name: "signInLink", description: "The sign-in page" } as const;

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateInfo> = {
  "enquiry-reply": {
    label: "Reply to an enquiry",
    group: "Buyers",
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
    group: "Buyers",
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
  "enquiry-transcript": {
    label: "Buyer's copy of a new chat",
    group: "Buyers",
    when: "Sent to the buyer when they start a chat on the site, so they can find it again.",
    variables: CONVERSATION_VARS.filter((v) => v.name !== "agentName"),
    defaultSubject: "Your conversation about {{property}}",
    defaultBody: [
      "Hello {{name}},",
      "",
      "Here is your conversation with our team so far.",
      "",
      "{{conversation}}",
      "",
      "Continue the chat from any device: {{replyLink}}",
    ].join("\n"),
  },
  "subscribe-welcome": {
    label: "Welcome a subscriber",
    group: "Subscribers",
    when: "Sent once, when somebody subscribes from the site.",
    variables: [{ name: "unsubscribeLink", description: "One click to stop the emails" }],
    defaultSubject: "Thanks for subscribing to AV Homes",
    defaultBody: [
      "Hello,",
      "",
      "Thank you for subscribing to AV Homes.",
      "We’ll keep you updated with new property listings, market insights, and useful articles from time to time, only when we have something genuinely valuable to share.",
      "",
      "We’re glad to have you with us.",
      "",
      "No longer want to receive these updates?",
      "You can unsubscribe at any time.",
      "[Unsubscribe]({{unsubscribeLink}})",
    ].join("\n"),
  },
  newsletter: {
    label: "Newsletter wrapper",
    group: "Subscribers",
    when: "Wraps every newsletter. The newsletter itself goes where {{content}} is.",
    variables: [
      { name: "content", description: "The newsletter as written" },
      { name: "unsubscribeLink", description: "One click to stop the emails" },
    ],
    defaultSubject: "{{subject}}",
    defaultBody: [
      "{{content}}",
      "",
      "You are receiving this because you subscribed on the AV Homes site.\n[Unsubscribe]({{unsubscribeLink}})",
    ].join("\n"),
  },
  "partner-application-received": {
    label: "Listing application received",
    group: "Listing partners",
    when: "Sent when somebody applies to list their property with AV Homes.",
    variables: [{ name: "name", description: "The applicant's name" }],
    defaultSubject: "AV Homes has your application",
    defaultBody: [
      "Thank you {{name}}.",
      "",
      "We have your request to list property with AV Homes. Somebody reads every one of these, and you will hear back either way. If we go ahead you will get a link to sign in and add your first property.",
    ].join("\n"),
  },
  "partner-application-approved": {
    label: "Listing application approved",
    group: "Listing partners",
    when: "Sent when an admin approves a listing application.",
    variables: [{ name: "name", description: "The applicant's name" }, SIGN_IN_VAR],
    defaultSubject: "You can list with AV Homes",
    defaultBody: [
      "Good news, {{name}}.",
      "",
      "AV Homes has approved your account. Sign in here to add your first property:",
      "{{signInLink}}",
      "",
      "Use this same email address and you’ll be sent a 6-digit code to confirm it. Your listings go live once AV Homes has read them.",
    ].join("\n"),
  },
  "partner-application-declined": {
    label: "Listing application declined",
    group: "Listing partners",
    when: "Sent when an admin declines a listing application.",
    variables: [
      { name: "name", description: "The applicant's name" },
      { name: "reason", description: "The reason the admin gave, or empty" },
    ],
    defaultSubject: "About your AV Homes application",
    defaultBody: [
      "Thank you for asking to list with AV Homes, {{name}}.",
      "",
      "We are not going ahead this time.",
      "",
      "{{reason}}",
      "",
      "You are welcome to apply again.",
    ].join("\n"),
  },
  "company-staff-invite": {
    label: "Partner adds a staff member",
    group: "Listing partners",
    when: "Sent when a listing partner adds somebody to their company account.",
    variables: [
      { name: "inviterName", description: "Who added them" },
      { name: "company", description: "The partner company" },
      SIGN_IN_VAR,
    ],
    defaultSubject: "{{inviterName}} added you to {{company}} on AV Homes",
    defaultBody: [
      "{{inviterName}} has added you to {{company}}’s account on AV Homes.",
      "",
      "Sign in here: {{signInLink}}",
      "",
      "Sign in with this same email address and you’ll be sent a 6-digit code to confirm it. The invite expires in seven days.",
    ].join("\n"),
  },
  "partner-suspended": {
    label: "Partner access suspended",
    group: "Listing partners",
    when: "Sent to a partner company's contact when an admin suspends it.",
    variables: [
      { name: "name", description: "The contact's name, or the company's" },
      { name: "reason", description: "The reason the admin gave" },
    ],
    defaultSubject: "Your AV Homes access is suspended",
    defaultBody: [
      "Hello {{name}},",
      "",
      "AV Homes has suspended your company’s access, and your listings are off the site for now.",
      "",
      "{{reason}}",
      "",
      "Reply to this email or call AV Homes to talk about it.",
    ].join("\n"),
  },
  "partner-restored": {
    label: "Partner access restored",
    group: "Listing partners",
    when: "Sent to a partner company's contact when an admin lifts a suspension.",
    variables: [
      { name: "name", description: "The contact's name, or the company's" },
      { name: "reason", description: "The note the admin gave" },
    ],
    defaultSubject: "Your AV Homes access is back",
    defaultBody: [
      "Hello {{name}},",
      "",
      "AV Homes has restored your company’s access, and your listings are back on the site.",
      "",
      "{{reason}}",
    ].join("\n"),
  },
  "team-invite": {
    label: "Team member invite",
    group: "Your team",
    when: "Sent when somebody is invited to the admin console.",
    variables: [
      { name: "inviterName", description: "Who sent the invite" },
      { name: "invitedAs", description: "What they are invited as, such as \"to the AVHomes admin as editor\"" },
      SIGN_IN_VAR,
    ],
    defaultSubject: "{{inviterName}} invited you to AVHomes",
    defaultBody: [
      "{{inviterName}} has invited you {{invitedAs}}.",
      "",
      "Sign in here: {{signInLink}}",
      "",
      "Sign in with this same email address and you’ll be sent a 6-digit code to confirm it. The invite expires in seven days.",
    ].join("\n"),
  },
  "property-partner-welcome": {
    label: "Welcome to a new Property Partner",
    group: "Property partners",
    when: "Sent when somebody joins as a Property Partner.",
    variables: [
      { name: "name", description: "The partner's first name" },
      { name: "appLink", description: "The partner app" },
      { name: "whatsappLink", description: "Their link to the partners' WhatsApp group, or empty when none is set" },
    ],
    defaultSubject: "Welcome to AV Homes, {{name}}",
    defaultBody: [
      "Welcome, {{name}}.",
      "",
      "You are now an AV Homes Property Partner. Share our listings with the people you know, log buyers in the app, and you earn when a deal closes.",
      "",
      "Open the app: {{appLink}}",
      "",
      "Join the partners' WhatsApp group for new listings, site visits and pay day news: {{whatsappLink}}",
    ].join("\n"),
  },
  "property-partner-whatsapp": {
    label: "WhatsApp group invite",
    group: "Property partners",
    when: "Sent when an admin reminds partners who have not joined the WhatsApp group yet.",
    variables: [
      { name: "name", description: "The partner's first name" },
      { name: "whatsappLink", description: "Their link to the partners' WhatsApp group" },
    ],
    defaultSubject: "Join the AV Homes partners on WhatsApp",
    defaultBody: [
      "Hello {{name}},",
      "",
      "New listings, site visit days and pay day news go to the partners' WhatsApp group first. Tap to join:",
      "{{whatsappLink}}",
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

export const NEWSLETTER_FORMATS = ["doc", "html"] as const;
/** `doc` is written in the console editor; `html` is a pasted design sent as-is (after cleaning). */
export type NewsletterFormat = (typeof NEWSLETTER_FORMATS)[number];

export const NEWSLETTER_STATUSES = ["draft", "sending", "sent"] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export interface Newsletter {
  id: string;
  subject: string;
  /** The inbox preview line under the subject. */
  preheader: string;
  content: DocNode;
  format: NewsletterFormat;
  /** The pasted design, cleaned. Empty for an editor newsletter. */
  html: string;
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
