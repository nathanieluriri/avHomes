"use client";

import type { ReactNode } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  File,
  Folder,
  Inbox,
  OctagonAlert,
  Send,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { MailFolder, MailListFilters, MailMessageDetail, MailMessageSummary } from "@avhomes/contracts";
import { ApiError } from "@/lib/admin/client";
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
  if (!f) return path;
  if (f.specialUse === "\\Inbox" || f.path === "INBOX") return "Inbox";
  return f.name;
}

export function folderIcon(f: MailFolder | null, path: string): LucideIcon {
  if (path === STARRED) return Star;
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

export interface Draft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo?: { uid: number; folder: string };
  forwardOf?: { uid: number; folder: string };
}

export const EMPTY_DRAFT: Draft = { to: "", cc: "", bcc: "", subject: "", text: "" };

export function splitAddresses(value: string): string[] {
  return value
    .split(/[,;\s]+/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function quoted(m: MailMessageDetail): string {
  const body = m.text.trim() === "" ? "" : m.text.split("\n").map((line) => `> ${line}`).join("\n");
  return `\n\nOn ${dateTime(Date.parse(m.date))}, ${who(m)} wrote:\n${body}`;
}

export function replyDraft(m: MailMessageDetail): Draft {
  return {
    ...EMPTY_DRAFT,
    to: m.from?.address ?? "",
    subject: /^re:/iu.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    text: quoted(m),
    inReplyTo: { uid: m.uid, folder: m.folder },
  };
}

export function forwardDraft(m: MailMessageDetail): Draft {
  const header = [
    "---------- Forwarded message ----------",
    `From: ${m.from ? `${m.from.name} <${m.from.address}>` : ""}`,
    `Date: ${dateTime(Date.parse(m.date))}`,
    `Subject: ${m.subject}`,
    `To: ${m.to.map((a) => a.address).join(", ")}`,
  ].join("\n");
  return {
    ...EMPTY_DRAFT,
    subject: /^fwd?:/iu.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
    text: `\n\n${header}\n\n${m.text}`,
    forwardOf: { uid: m.uid, folder: m.folder },
  };
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
