"use client";

import { createContext, type ReactNode } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  File,
  Folder,
  FolderInput,
  Inbox,
  OctagonAlert,
  PenLine,
  Send,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  SIGNATURE_DELIMITER,
  quoteBlockHtml,
  splitReplyQuote,
  type MailAddress,
  type MailDraft,
  type MailFolder,
  type MailListFilters,
  type MailMessageDetail,
  type MailMessageSummary,
  type RenderedSignature,
} from "@avhomes/contracts";
import { ApiError } from "@/lib/admin/client";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { dateTime, shortDate } from "@/lib/admin/format";

export const enc = encodeURIComponent;

/** The virtual folder: flagged mail from every real one. */
export const STARRED = "*starred";

/** The rail's unread badge listens for this. */
export const MAIL_CHANGED_EVENT = "avhomes:mail-read";

export function announceMailChange(): void {
  window.dispatchEvent(new Event(MAIL_CHANGED_EVENT));
}

export function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export function kb(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} MB`;
  return `${value} KB`;
}

export function bytes(value: number): string {
  return value >= 1024 ? kb(Math.round(value / 1024)) : `${value} B`;
}

export function who(m: { from: { name: string; address: string } | null }): string {
  return m.from ? m.from.name || m.from.address : "(no sender)";
}

/** Gmail's sender column for a conversation: "Nathaniel, me", a whole name when there is one person. */
export function participantsLabel(people: MailAddress[], own: string): string {
  const me = own.toLowerCase();
  const names = people.map((p) => (p.address.toLowerCase() === me ? "me" : p.name || p.address.split("@")[0]));
  if (names.length === 0) return "(no sender)";
  if (names.length === 1) return names[0];
  const short = names.map((n) => (n === "me" ? n : n.split(/\s+/u)[0]));
  return short.length > 3 ? `${short[0]} .. ${short.slice(-2).join(", ")}` : short.join(", ");
}

export function initialOf(text: string): string {
  const first = text.replace(/^[^A-Za-z0-9]+/u, "").charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export function hasFiles(m: MailMessageSummary): boolean {
  return m.attachments.some((a) => !a.inline);
}

export function keyOf(m: { folder: string; uid: number }): string {
  return `${m.folder}\u0001${m.uid}`;
}

/** The clock today, "24 Sept" this year, 24/09/25 before that. */
export function listDate(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const date = new Date(at);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) return shortDate(at);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/* ─────────────────────────────── folders ─────────────────────────────── */

const SPECIAL_ORDER = ["\\Inbox", "\\Sent", "\\Drafts", "\\Junk", "\\Trash"];

export function sortFolders(folders: MailFolder[]): MailFolder[] {
  const rank = (f: MailFolder) => {
    const i = f.specialUse ? SPECIAL_ORDER.indexOf(f.specialUse) : -1;
    return i === -1 ? SPECIAL_ORDER.length : i;
  };
  return [...folders].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function isSpecial(f: MailFolder): boolean {
  return f.specialUse !== null && SPECIAL_ORDER.includes(f.specialUse);
}

export function folderLabel(f: MailFolder | null, path: string): string {
  if (path === STARRED) return "Starred";
  if (path === DRAFTS) return "Your drafts";
  if (!f) return path;
  if (f.specialUse === "\\Inbox" || f.path === "INBOX") return "Inbox";
  return f.name;
}

export function folderIcon(f: MailFolder | null, path: string): LucideIcon {
  if (path === STARRED) return Star;
  if (path === DRAFTS) return PenLine;
  switch (f?.specialUse) {
    case "\\Inbox":
      return Inbox;
    case "\\Sent":
      return Send;
    case "\\Drafts":
      return File;
    case "\\Junk":
      return OctagonAlert;
    case "\\Trash":
      return Trash2;
    default:
      return path === "INBOX" ? Inbox : Folder;
  }
}

/* ─────────────────────────────── filters ─────────────────────────────── */

export function activeFilters(f: MailListFilters): boolean {
  return Boolean(f.q || f.from || f.to || f.subject || f.since || f.before || f.attachment);
}

export function listQuery(f: MailListFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  for (const [name, value] of Object.entries(f)) {
    if (typeof value === "string" && value !== "") params.set(name, value);
  }
  return params.toString();
}

/** YYYY-MM-DD in local time, which is what a date input gives and IMAP expects. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDay(d);
}

/* ─────────────────────────────── drafts ──────────────────────────────── */

/** A draft as the composer edits it. `revision` 0 means the server has never seen it. */
export type Draft = Omit<MailDraft, "createdAt">;

/** The virtual folder: this member's own unsent drafts, kept by the console. */
export const DRAFTS = "*drafts";

const ID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newDraftId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return `mdrf_${[...bytes].map((b) => ID_CHARS[b % 32]).join("")}`;
}

export function blankDraft(mailbox: string, extra: Partial<Draft> = {}): Draft {
  return {
    id: newDraftId(),
    mailbox,
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    text: "",
    html: "",
    mode: "text",
    inReplyTo: null,
    forwardOf: null,
    revision: 0,
    updatedAt: Date.now(),
    ...extra,
  };
}

/* What was written above the signature the composer inserted. */
function aboveSignature(d: Draft): { text: string; html: string } {
  const text = d.text.split(`\n${SIGNATURE_DELIMITER}\n`)[0] ?? "";
  const html = (d.html.split("<!-- avh-signature")[0] ?? "").replace(/<[^>]+>|&nbsp;/gu, "");
  return { text, html };
}

/** Nothing typed: a new message holding only its signature counts as empty. */
export function draftIsEmpty(d: Draft): boolean {
  const above = aboveSignature(d);
  return (
    d.to.length + d.cc.length + d.bcc.length === 0 &&
    d.subject.trim() === "" &&
    above.text.trim() === "" &&
    above.html.trim() === ""
  );
}

export function draftTitle(d: Draft): string {
  if (d.subject.trim() !== "") return d.subject;
  return d.inReplyTo ? "Reply" : d.forwardOf ? "Forward" : "New message";
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@.<>(),;:"]+(?:\.[^\s@.<>(),;:"]+)+$/u;

export function isEmail(value: string): boolean {
  return value.length <= 320 && EMAIL.test(value);
}

/** "Ada <ada@x.com>", "ada@x.com; bo@y.com" or one per line, as bare addresses. */
export function parseAddresses(value: string): string[] {
  return value
    .split(/[,;\n\r]+/u)
    .map((part) => {
      const angled = /<([^>]+)>/u.exec(part);
      return (angled ? angled[1] : part).trim().replace(/^mailto:/iu, "");
    })
    .filter((part) => part !== "");
}

/** The console's plain-text fallback for an HTML body: tags out, links kept as "text (url)", quotes as "> " lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|title|script)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/giu, (_, inner: string) => {
      const lines = htmlToText(inner).split("\n");
      return `\n${lines.map((line) => `> ${line}`.trimEnd()).join("\n")}\n`;
    })
    .replace(/<a\b[^>]*href=("|')(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu, (_, __, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/gu, "").trim();
      return text === "" || text === href ? href : `${text} (${href})`;
    })
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/blockquote)\b[^>]*>/giu, "\n")
    .replace(/<li\b[^>]*>/giu, "- ")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/u)
    .filter((para) => para.trim() !== "")
    .map((para) => `<p>${escapeHtml(para).replace(/\n/gu, "<br>")}</p>`)
    .join("\n");
}

/** Plain text as paragraphs, the starting point when a message switches to HTML. A quoted reply goes in Gmail's quote markup. */
export function textToHtml(text: string): string {
  if (text.trim() === "") return "";
  const split = splitReplyQuote(text);
  if (!split) return paragraphs(text);
  return [paragraphs(split.body), quoteBlockHtml(escapeHtml(split.attribution), paragraphs(split.quoted))]
    .filter(Boolean)
    .join("\n");
}

function quoted(m: MailMessageDetail): string {
  // An HTML-only message still gets quoted, from its HTML.
  const source = (m.text.trim() === "" ? htmlToText(m.html) : m.text).replace(/\r\n?/gu, "\n").trim();
  const body = source === "" ? "" : source.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  return `\n\nOn ${dateTime(Date.parse(m.date))}, ${who(m)} wrote:\n${body}`;
}

/* ─────────────────────────────── signature ─────────────────────────────── */

/** The member's signature, for the composer's Write to HTML switch. Null until it loads. */
export const SignatureContext = createContext<RenderedSignature | null>(null);

function signatureBlock(sig: RenderedSignature): string {
  return `${SIGNATURE_DELIMITER}\n${sig.text}`;
}

/**
 * A new message with the signature under the space for writing and above any
 * quote, as Gmail does. Only new drafts: a saved one keeps what it has.
 */
export function signDraft(d: Draft, sig: RenderedSignature | null): Draft {
  if (!sig || sig.text === "" || d.revision > 0) return d;
  return { ...d, text: `\n\n${signatureBlock(sig)}${d.text}` };
}

/** Plain text as HTML, with the signature block drawn as the real signature. */
export function textToHtmlSigned(text: string, sig: RenderedSignature | null): string {
  const block = sig && sig.text !== "" ? signatureBlock(sig) : "";
  const at = block ? text.indexOf(block) : -1;
  if (!sig || at < 0) return textToHtml(text);
  const before = textToHtml(text.slice(0, at).replace(/\s+$/u, ""));
  const after = textToHtml(text.slice(at + block.length).replace(/^\s+/u, ""));
  return [before || "<p><br></p>", sig.html, after].filter(Boolean).join("\n");
}

/**
 * HTML back to plain text with the signature kept as the composer's own block,
 * so a later switch to HTML draws the real signature again.
 */
export function htmlToTextSigned(html: string, sig: RenderedSignature | null): string {
  const at = sig && sig.html !== "" && sig.text !== "" ? html.indexOf(sig.html) : -1;
  if (!sig || at < 0) return htmlToText(html);
  const before = htmlToText(html.slice(0, at));
  const after = htmlToText(html.slice(at + sig.html.length));
  return `${before}\n\n${signatureBlock(sig)}${after ? `\n\n${after}` : ""}`;
}

/** A reply to our own message goes to whoever it was sent to, as Gmail does. */
export function replyDraft(mailbox: string, m: MailMessageDetail, own = ""): Draft {
  const me = own.toLowerCase();
  const mine = me !== "" && m.from?.address.toLowerCase() === me;
  const others = (list: MailAddress[]) => list.map((a) => a.address.toLowerCase()).filter((a) => a !== me);
  return blankDraft(mailbox, {
    to: mine ? others(m.to) : m.from ? [m.from.address.toLowerCase()] : [],
    cc: mine ? others(m.cc) : [],
    subject: /^re:/iu.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    text: quoted(m),
    inReplyTo: { uid: m.uid, folder: m.folder },
  });
}

export function forwardDraft(mailbox: string, m: MailMessageDetail): Draft {
  const header = [
    "---------- Forwarded message ----------",
    `From: ${m.from ? `${m.from.name} <${m.from.address}>` : ""}`,
    `Date: ${dateTime(Date.parse(m.date))}`,
    `Subject: ${m.subject}`,
    `To: ${m.to.map((a) => a.address).join(", ")}`,
  ].join("\n");
  return blankDraft(mailbox, {
    subject: /^fwd?:/iu.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
    text: `\n\n${header}\n\n${m.text}`,
    forwardOf: { uid: m.uid, folder: m.folder },
  });
}

/* ──────────────────────────────── menus ──────────────────────────────── */

/**
 * One row of a `ResponsiveMenu`: a dropdown item with a mouse, a sheet button
 * that closes its sheet with a thumb.
 */
export function MenuRow({
  kind,
  onSelect,
  children,
  current = false,
  disabled = false,
  danger = false,
}: {
  kind: "menu" | "sheet";
  onSelect: () => void;
  children: ReactNode;
  current?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const tone = `${danger ? "text-red-700" : "text-plum-950"} ${current ? "bg-mist-100" : ""}`;
  if (kind === "menu") {
    return (
      <DropdownMenu.Item
        disabled={disabled}
        onSelect={onSelect}
        className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-mist-100 ${tone}`}
      >
        {children}
      </DropdownMenu.Item>
    );
  }
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium active:bg-mist-100 disabled:opacity-50 ${tone}`}
      >
        {children}
      </button>
    </Dialog.Close>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{children}</p>
  );
}

export function MenuSeparator({ kind }: { kind: "menu" | "sheet" }) {
  return kind === "menu" ? (
    <DropdownMenu.Separator className="my-1.5 h-px bg-mist-200" />
  ) : (
    <div className="my-1.5 h-px bg-mist-200" aria-hidden="true" />
  );
}

/* ─────────────────────────────── avatars ─────────────────────────────── */

// Brand tints only, so a list of senders reads as this console rather than Gmail.
const TONES = [
  "bg-wine-600",
  "bg-chrome-700",
  "bg-plum-800",
  "bg-wine-500",
  "bg-slate-600",
  "bg-wine-700",
  "bg-chrome-800",
];

/** The same address always gets the same colour. */
export function toneOf(key: string): string {
  let hash = 0;
  for (const ch of key.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function LetterAvatar({
  text,
  toneKey,
  size = "md",
  className = "",
}: {
  text: string;
  toneKey: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const box = {
    xs: "h-7 w-7 text-[11px]",
    sm: "h-8 w-8 text-[12px]",
    md: "h-10 w-10 text-[15px]",
    lg: "h-12 w-12 text-[18px]",
  }[size];
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${toneOf(toneKey)} ${box} ${className}`}
    >
      {initialOf(text)}
    </span>
  );
}

/* ─────────────────────────────── toolbars ────────────────────────────── */

/** "desk" shrinks to 32px from `sm`; "touch" stays a 44px target at every width. */
export function ToolIcon({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  active = false,
  size = "desk",
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: "desk" | "touch";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`c-tap grid shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:cursor-not-allowed disabled:opacity-40 ${
        size === "touch" ? "h-11 w-11" : "h-11 w-11 sm:h-8 sm:w-8 sm:rounded-lg"
      }`}
    >
      <Icon
        className={`${size === "touch" ? "h-5 w-5" : "h-4 w-4"} ${active ? "fill-amber-400 text-amber-500" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}

export function MoveMenu({
  targets,
  disabled,
  onMove,
  size = "desk",
}: {
  targets: MailFolder[];
  disabled: boolean;
  onMove: (path: string) => void;
  size?: "desk" | "compact" | "touch";
}) {
  const box = size === "compact" ? "h-8 w-8 rounded-lg" : size === "touch" ? "h-11 w-11 rounded-full" : "h-11 w-11 rounded-full sm:h-8 sm:w-8 sm:rounded-lg";
  return (
    <ResponsiveMenu
      title="Move to"
      align="start"
      trigger={
        <button
          type="button"
          aria-label="Move to"
          title="Move to"
          disabled={disabled}
          className={`c-tap grid shrink-0 place-items-center text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:opacity-40 ${box}`}
        >
          <FolderInput className={size === "touch" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
        </button>
      }
      items={(kind) => (
        <>
          <MenuLabel>Move to</MenuLabel>
          {targets.map((f) => {
            const Icon = folderIcon(f, f.path);
            return (
              <MenuRow key={f.path} kind={kind} onSelect={() => onMove(f.path)}>
                <Icon className="h-4 w-4 text-slate-550" aria-hidden="true" />
                <span className="truncate">{folderLabel(f, f.path)}</span>
              </MenuRow>
            );
          })}
        </>
      )}
    />
  );
}
