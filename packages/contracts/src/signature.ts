import { formatPhone } from "./phone";

/**
 * Email signatures: the default block every outbound email ends with, what a
 * member or the company can put in its place, and which details are missing.
 *
 * Pure and in contracts so the server signs mail and the console previews it
 * from one renderer. The HTML is built for mail clients, not browsers: nested
 * presentational tables, inline styles only, PNG images with explicit sizes,
 * no SVG (Gmail strips it) and no web fonts.
 */

export const SIGNATURE_MODES = ["default", "custom"] as const;
export type SignatureMode = (typeof SIGNATURE_MODES)[number];
export type SignatureFormat = "text" | "html";

/** A member's choice, or the company's for mail no person signs. */
export interface SignaturePrefs {
  mode: SignatureMode;
  /** How `body` is written when `mode` is custom. */
  format: SignatureFormat;
  body: string;
}

export const DEFAULT_SIGNATURE_PREFS: SignaturePrefs = { mode: "default", format: "text", body: "" };

export const DEFAULT_COMPANY_NAME = "AV Homes Ltd";

/** Settings, Email signature. Empty means not set, like every other setting. */
export interface CompanySignatureSettings {
  /** Empty prints DEFAULT_COMPANY_NAME. */
  companyName: string;
  /** Empty links the site's own address. */
  website: string;
  /** Empty uses the round AV Homes logo. */
  logoUrl: string;
  /** Invites, codes, notifications, newsletters, and team-signed replies. */
  team: SignaturePrefs;
}

export const DEFAULT_COMPANY_SIGNATURE: CompanySignatureSettings = {
  companyName: "",
  website: "",
  logoUrl: "",
  team: DEFAULT_SIGNATURE_PREFS,
};

/** Who signs. */
export interface SignaturePerson {
  name: string;
  title: string;
  phone: string;
  email: string;
}

/** What the company adds to every signature. */
export interface SignatureCompany {
  name: string;
  phone: string;
  email: string;
  officeAddress: string;
  website: string;
  /** Absolute https URL, or empty for the bundled logo. */
  logoUrl: string;
  /** Where /email/*.png is served from. Mail clients need it absolute. */
  assetOrigin: string;
}

export interface RenderedSignature {
  html: string;
  text: string;
}

/** Present in every signature's HTML, so signing twice is detectable. */
export const SIGNATURE_MARKER = "avh-signature";
/** Where a layout wants the signature to go, when the end of the body is wrong. */
export const SIGNATURE_SLOT = "<!--avh-signature-slot-->";
/** The standard plain text delimiter: dash, dash, space. */
export const SIGNATURE_DELIMITER = "-- ";

const WINE = "#983c53";
const INK = "#1e1b2e";
const MUTED = "#55637a";
const RULE = "#e6c3cd";
const FONT = "Arial,Helvetica,sans-serif";

function esc(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/u, "");
}

/** An address as typed, as a link a client will open: bare domains get https. */
export function websiteHref(website: string): string {
  const w = website.trim();
  if (w === "") return "";
  return /^https?:\/\//iu.test(w) ? w : `https://${w}`;
}

/** "https://www.avhomesltd.com/" as a person would write it. */
export function websiteLabel(website: string): string {
  return website.trim().replace(/^https?:\/\//iu, "").replace(/\/+$/u, "");
}

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/gu, "");
  return digits === "" ? "" : `tel:${digits}`;
}

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function absolute(url: string, origin: string): string {
  if (/^https?:\/\//iu.test(url)) return url;
  return `${trimOrigin(origin)}${url.startsWith("/") ? "" : "/"}${url}`;
}

interface Row {
  icon: "phone" | "mail" | "pin" | "web";
  alt: string;
  html: string;
  text: string;
}

function rowHtml(row: Row, origin: string): string {
  const src = `${trimOrigin(origin)}/email/icon-${row.icon}.png`;
  return `<tr>
<td width="18" valign="top" style="width:18px;padding:0 10px 7px 0;vertical-align:top"><img src="${esc(src)}" width="18" height="18" alt="${esc(row.alt)}" style="display:block;width:18px;height:18px;border:0;outline:none"></td>
<td valign="top" style="padding:0 0 7px 0;vertical-align:top;font-family:${FONT};font-size:13px;line-height:18px;color:${INK}">${row.html}</td>
</tr>`;
}

const LINK = `color:${INK};text-decoration:none`;

/**
 * The default signature: the round logo and a rule on the left, the name, the
 * title and company, then a row each for phone, email, office and website.
 * A row with nothing to say is left out, never printed blank.
 */
export function renderSignature(person: SignaturePerson, company: SignatureCompany): RenderedSignature {
  const origin = company.assetOrigin;
  const name = person.name.trim();
  const title = person.title.trim();
  const companyName = company.name.trim() || DEFAULT_COMPANY_NAME;
  const phone = formatPhone(person.phone.trim() || company.phone.trim());
  const mail = (person.email.trim() || company.email.trim()).toLowerCase();
  const office = company.officeAddress.trim();
  const site = websiteHref(company.website);

  const rows: Row[] = [];
  if (phone) {
    rows.push({
      icon: "phone",
      alt: "Phone",
      html: `<a href="${esc(telHref(phone))}" style="${LINK}">${esc(phone)}</a>`,
      text: `Phone: ${phone}`,
    });
  }
  if (mail) {
    rows.push({
      icon: "mail",
      alt: "Email",
      html: `<a href="mailto:${esc(mail)}" style="${LINK}">${esc(mail)}</a>`,
      text: `Email: ${mail}`,
    });
  }
  if (office) {
    rows.push({
      icon: "pin",
      alt: "Office",
      html: `<a href="${esc(mapsHref(office))}" style="${LINK}">${esc(office).replace(/\n/gu, "<br>")}</a>`,
      text: `Office: ${office.replace(/\s*\n\s*/gu, ", ")}`,
    });
  }
  if (site) {
    rows.push({
      icon: "web",
      alt: "Website",
      html: `<a href="${esc(site)}" style="color:${WINE};text-decoration:none;font-weight:700">${esc(websiteLabel(site))}</a>`,
      text: `Web: ${site}`,
    });
  }

  const logo = company.logoUrl.trim() ? absolute(company.logoUrl.trim(), origin) : `${trimOrigin(origin)}/email/logo-round.png`;
  const byline = title
    ? `<em style="font-style:italic">${esc(title)}</em>&nbsp;&nbsp;|&nbsp;&nbsp;${esc(companyName)}`
    : esc(companyName);

  const html = `<!-- ${SIGNATURE_MARKER} -->
<div data-${SIGNATURE_MARKER}="1" style="margin:24px 0 0;padding:0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt">
<tr>
<td width="110" valign="middle" style="width:110px;padding:0 18px 0 0;vertical-align:middle"><a href="${esc(site || trimOrigin(origin))}" style="text-decoration:none"><img src="${esc(logo)}" width="110" height="110" alt="${esc(companyName)}" style="display:block;width:110px;height:110px;border:0;outline:none;border-radius:55px;color:${WINE};font-family:${FONT};font-size:14px;font-weight:700"></a></td>
<td width="1" style="width:1px;padding:0;background-color:${RULE};font-size:1px;line-height:1px">&nbsp;</td>
<td valign="middle" style="padding:0 0 0 18px;vertical-align:middle">
${name ? `<p style="margin:0;font-family:${FONT};font-size:20px;line-height:26px;font-weight:700;color:${WINE}">${esc(name)}</p>\n` : ""}<p style="margin:${name ? "2px" : "0"} 0 12px;font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED}">${byline}</p>
${rows.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">\n${rows.map((r) => rowHtml(r, origin)).join("\n")}\n</table>` : ""}
</td>
</tr>
</table>
</div>`;

  const text = [
    name,
    title ? `${title} | ${companyName}` : companyName,
    ...rows.map((r) => r.text),
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { html, text };
}

/** Plain text as email paragraphs, links made clickable. */
export function textToEmailHtml(text: string): string {
  if (text.trim() === "") return "";
  return text
    .split(/\n{2,}/u)
    .map(
      (para) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK}">${esc(para)
          .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/gu, (url) => `<a href="${url}" style="color:${WINE}">${url}</a>`)
          .replace(/\n/gu, "<br>")}</p>`,
    )
    .join("\n");
}

/** A readable copy of signature HTML for the text part. */
export function signatureHtmlToText(html: string): string {
  return html
    .replace(/<(style|head|title|script)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<a\b[^>]*href=("|')(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu, (_, __, href: string, label: string) => {
      const t = label.replace(/<[^>]+>/gu, "").trim();
      return t === "" || href.endsWith(t) || href === `mailto:${t}` ? t || href : `${t} (${href})`;
    })
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

/**
 * A custom signature as sendable parts. HTML is trusted here: the server
 * sanitises it when it is saved.
 */
export function customSignature(prefs: SignaturePrefs): RenderedSignature {
  const body = prefs.body.trim();
  if (body === "") return { html: "", text: "" };
  const inner = prefs.format === "html" ? body : textToEmailHtml(body);
  return {
    html: `<!-- ${SIGNATURE_MARKER} -->\n<div data-${SIGNATURE_MARKER}="1" style="margin:24px 0 0;padding:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK}">${inner}</div>`,
    text: prefs.format === "html" ? signatureHtmlToText(body) : body,
  };
}

/** The default, or the custom one when chosen and not empty. */
export function resolveSignature(prefs: SignaturePrefs, person: SignaturePerson, company: SignatureCompany): RenderedSignature {
  if (prefs.mode === "custom") {
    const custom = customSignature(prefs);
    if (custom.text !== "" || custom.html !== "") return custom;
  }
  return renderSignature(person, company);
}

/* ───────────────────────────── appending ───────────────────────────── */

export function hasSignature(html: string | undefined): boolean {
  return (html ?? "").includes(SIGNATURE_MARKER);
}

/** A minimal HTML document for a message that was written as plain text. */
export function plainEmailHtml(text: string): string {
  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff">
<div lang="en" dir="ltr" style="padding:16px;max-width:640px">
${textToEmailHtml(text)}
${SIGNATURE_SLOT}
</div>
</body></html>`;
}

/** The paragraph index a text signature goes above: a closing unsubscribe line, if there is one. */
function unsubscribeIndex(paragraphs: string[]): number {
  for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 2); i -= 1) {
    if (/unsubscribe/iu.test(paragraphs[i] ?? "")) return i;
  }
  return -1;
}

/**
 * Adds a signature to a message, once. Text gets `-- ` and the text version;
 * HTML gets the block at the layout's slot, else before </body>, else at the
 * end. A message with no HTML gains an HTML part so the signature reads as one.
 */
export function appendSignature<T extends { text: string; html?: string }>(message: T, sig: RenderedSignature): T {
  if (sig.text === "" && sig.html === "") return message;
  if (hasSignature(message.html)) {
    return { ...message, html: (message.html ?? "").replace(SIGNATURE_SLOT, "") };
  }

  let text = message.text;
  if (sig.text !== "" && !text.includes(sig.text)) {
    const block = `${SIGNATURE_DELIMITER}\n${sig.text}`;
    const paragraphs = text.trimEnd().split(/\n{2,}/u);
    const at = unsubscribeIndex(paragraphs);
    text =
      at > 0
        ? [...paragraphs.slice(0, at), block, ...paragraphs.slice(at)].join("\n\n")
        : `${text.trimEnd()}\n\n${block}`;
  }

  const base = message.html && message.html.trim() !== "" ? message.html : plainEmailHtml(message.text);
  let html: string;
  if (base.includes(SIGNATURE_SLOT)) html = base.replace(SIGNATURE_SLOT, sig.html);
  else if (/<\/body\s*>/iu.test(base)) html = base.replace(/<\/body\s*>/iu, `${sig.html}\n</body>`);
  else html = `${base}\n${sig.html}`;

  return { ...message, text, html };
}

/* ───────────────────────────── what is missing ───────────────────────────── */

export type PersonSignatureField = "name" | "title" | "phone" | "email";
export type CompanySignatureField = "office" | "website" | "phone" | "email" | "logo";

export const PERSON_FIELD_LABEL: Record<PersonSignatureField, string> = {
  name: "name",
  title: "job title",
  phone: "phone number",
  email: "email address",
};

export const COMPANY_FIELD_LABEL: Record<CompanySignatureField, string> = {
  office: "office address",
  website: "website",
  phone: "company phone",
  email: "company email",
  logo: "company logo",
};

export function personSignatureGaps(person: SignaturePerson): PersonSignatureField[] {
  const out: PersonSignatureField[] = [];
  if (person.name.trim() === "") out.push("name");
  if (person.title.trim() === "") out.push("title");
  if (person.phone.trim() === "") out.push("phone");
  if (person.email.trim() === "") out.push("email");
  return out;
}

/** Logo is left out: an empty one uses the AV Homes logo, so nothing is missing. */
export function companySignatureGaps(company: {
  officeAddress: string;
  website: string;
  phone: string;
  email: string;
}): Exclude<CompanySignatureField, "logo">[] {
  const out: Exclude<CompanySignatureField, "logo">[] = [];
  if (company.officeAddress.trim() === "") out.push("office");
  if (company.website.trim() === "") out.push("website");
  if (company.phone.trim() === "") out.push("phone");
  if (company.email.trim() === "") out.push("email");
  return out;
}

/** "title, phone number and email address". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/* ───────────────────────────── the mail setup card ───────────────────────────── */

export type MailSetupItemId =
  | "signature-title"
  | "signature-phone"
  | "signature-name"
  | "company-office"
  | "company-website"
  | "company-phone"
  | "company-email"
  | "company-logo"
  | "sender-mailbox";

export interface MailSetupItem {
  id: MailSetupItemId;
  title: string;
  description: string;
  action: { label: string; href: string };
  /** Optional items can be dismissed; the rest clear only by doing them. */
  optional: boolean;
  done: boolean;
}

export interface MailSetupResponse {
  items: MailSetupItem[];
  /** Epoch ms. The card stays hidden until then. */
  snoozedUntil: number;
  /** Decided by the server, so the card does not read the clock while it renders. */
  snoozed: boolean;
  dismissed: MailSetupItemId[];
}

export const MAIL_SETUP_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
