import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  HostingerError,
  NotFoundError,
  currentDb,
  currentUser,
  email,
  hostingerAccount,
  hostingerFetch,
  hostingerPage,
  hostingerRequest,
  pathParam,
  readJson,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  SIGN_IN_CODE_MARKER,
  rankContacts,
  type MailAddress,
  type MailAttachmentInfo,
  type MailContact,
  type MailFolder,
  type MailMessageDetail,
  type MailMessagePage,
  type MailMessageSummary,
  type MailQuota,
  type MailRecipient,
  type MailboxSummary,
} from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";
import { htmlToText, sanitizeEmailHtml } from "./email-templates";
import { hostingerKey, hostingerProblem, readMailSettings } from "./mail";
import { dropDraft } from "./mail-state";

/**
 * The console's window onto the Hostinger mailboxes: quotas, folders, reading,
 * filing and sending.
 *
 * A pass-through, deliberately. No message is copied into the database, so
 * the mailbox stays the one record of what was received and sent, and deleting
 * a message in Hostinger's own webmail is not contradicted by a stale copy here.
 * The one cache is `mail_contacts`: names and addresses, for the composer.
 */

/* ───────────────────────────── wire shapes ───────────────────────────── */

interface RawAddress {
  name?: string | null;
  address?: string | null;
}

interface RawAttachment {
  id: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  inline?: boolean | null;
  filename?: string | null;
}

interface RawMessage {
  uid: number;
  path: string;
  date: string;
  flags?: string[];
  unseen?: boolean;
  size?: number;
  subject?: string | null;
  from?: RawAddress | null;
  to?: RawAddress[] | null;
  cc?: RawAddress[] | null;
  bcc?: RawAddress[] | null;
  attachments?: RawAttachment[] | null;
}

interface RawFolder {
  path: string;
  name: string;
  delimiter?: string | null;
  specialUse?: string | null;
  messageCount?: number | null;
  unreadCount?: number | null;
}

interface RawQuota {
  quotas?: { resourceName: string; usage: number; limit: number; percentage: number }[];
  supported?: boolean;
}

function address(raw: RawAddress | null | undefined): MailAddress | null {
  if (!raw?.address) return null;
  return { name: raw.name ?? "", address: raw.address };
}

function addresses(raw: RawAddress[] | null | undefined): MailAddress[] {
  return (raw ?? []).map(address).filter((a): a is MailAddress => a !== null);
}

function attachment(raw: RawAttachment): MailAttachmentInfo {
  return {
    id: raw.id,
    filename: raw.filename ?? "attachment",
    contentType: raw.contentType ?? "application/octet-stream",
    sizeBytes: raw.sizeBytes ?? 0,
    inline: raw.inline ?? false,
  };
}

function summary(raw: RawMessage): MailMessageSummary {
  const flags = raw.flags ?? [];
  return {
    uid: raw.uid,
    folder: raw.path,
    date: raw.date,
    flags,
    unseen: raw.unseen ?? !flags.includes("\\Seen"),
    flagged: flags.includes("\\Flagged"),
    size: raw.size ?? 0,
    subject: raw.subject ?? "",
    from: address(raw.from),
    to: addresses(raw.to),
    cc: addresses(raw.cc),
    attachments: (raw.attachments ?? []).map(attachment),
  };
}

function folder(raw: RawFolder): MailFolder {
  return {
    path: raw.path,
    name: raw.name,
    delimiter: raw.delimiter ?? ".",
    specialUse: raw.specialUse || null,
    messageCount: raw.messageCount ?? 0,
    unreadCount: raw.unreadCount ?? 0,
  };
}

function quota(raw: RawQuota | null): MailQuota | null {
  if (!raw) return null;
  const storage = raw.quotas?.find((q) => q.resourceName === "STORAGE");
  const messages = raw.quotas?.find((q) => q.resourceName === "MESSAGE");
  return {
    supported: raw.supported ?? false,
    storageUsedKb: storage?.usage ?? 0,
    storageLimitKb: storage?.limit ?? 0,
    storagePercent: storage?.percentage ?? 0,
    messages: messages?.usage ?? 0,
    messageLimit: messages?.limit ?? 0,
  };
}

/* ────────────────────────────── helpers ──────────────────────────────── */

async function keyFor(c: Parameters<typeof currentDb>[0]): Promise<string> {
  const key = await hostingerKey(await currentDb(c));
  if (!key) throw new BadRequestError("Email is not connected. Paste a Hostinger API key under Settings first.");
  return key;
}

/** Hostinger's refusal as a console error, and its 404 as ours. */
async function call<T>(run: () => Promise<T>, what: string): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof HostingerError && err.status === 404) throw new NotFoundError(what);
    hostingerProblem(err);
  }
}

const enc = encodeURIComponent;

function base(c: Parameters<typeof pathParam>[0]): string {
  return `/mailboxes/${enc(pathParam(c, "mailbox"))}`;
}

function inFolder(c: Parameters<typeof pathParam>[0]): string {
  return `${base(c)}/folders/${enc(pathParam(c, "folder"))}`;
}

function uidOf(c: Parameters<typeof pathParam>[0]): number {
  const uid = Number(pathParam(c, "uid"));
  if (!Number.isInteger(uid) || uid < 1) throw new BadRequestError("uid");
  return uid;
}

/** Enough to survive a Content-Disposition header, and nothing that could split one. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/gu, "_").trim().slice(0, 120);
  return cleaned === "" ? "attachment" : cleaned;
}

/* ─────────────────────────── sign-in codes ───────────────────────────── */

/*
 * Invite claim codes go out through the site's own mailbox, so they sit in
 * Sent, and an invite to an alias of that mailbox lands in its Inbox. A
 * developer reading either could claim an owner invite. So for anybody but the
 * owner those messages do not exist: every list, count and uid route below
 * goes through `codeGuard`, and nothing else decides it.
 */

function isSignInCode(subject: string | null | undefined): boolean {
  return (subject ?? "").toLowerCase().includes(SIGN_IN_CODE_MARKER);
}

const HIDDEN_TTL_MS = 60_000;
const hiddenCache = new Map<string, { at: number; value: Promise<RawMessage[]> }>();

/** The code messages in one folder, newest 100, cached for a minute. */
function hiddenIn(key: string, mailbox: string, folderPath: string): Promise<RawMessage[]> {
  const id = `${key.slice(-8)}\u0001${mailbox}\u0001${folderPath}`;
  const now = Date.now();
  const hit = hiddenCache.get(id);
  if (hit && now - hit.at < HIDDEN_TTL_MS) return hit.value;
  const value = hostingerPage<RawMessage>(
    key,
    `/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}/messages/search`,
    { page: 1, perPage: 100, sort: "-date" },
    { method: "POST", body: { subject: SIGN_IN_CODE_MARKER } },
  )
    .then((page) => page.data.filter((m) => isSignInCode(m.subject)))
    .catch((err: unknown) => {
      hiddenCache.delete(id);
      throw err;
    });
  hiddenCache.set(id, { at: now, value });
  return value;
}

function codeGuard(c: Parameters<typeof currentUser>[0]) {
  const hides = currentUser(c).role !== "owner";
  return {
    hides,
    /** False for a code message the caller may not see. */
    keep(m: { subject?: string | null }): boolean {
      return !hides || !isSignInCode(m.subject);
    },
    /** Folder counts without the code messages in them. */
    async folders(key: string, mailbox: string, list: MailFolder[]): Promise<MailFolder[]> {
      if (!hides) return list;
      return Promise.all(
        list.map(async (f) => {
          if (f.messageCount === 0) return f;
          const hidden = await hiddenIn(key, mailbox, f.path).catch(() => [] as RawMessage[]);
          if (hidden.length === 0) return f;
          const unseen = hidden.filter((m) => m.unseen ?? !(m.flags ?? []).includes("\\Seen")).length;
          return {
            ...f,
            messageCount: Math.max(0, f.messageCount - hidden.length),
            unreadCount: Math.max(0, f.unreadCount - unseen),
          };
        }),
      );
    },
    /** A 404 for one uid that is a code message, decided from its summary before anything reads or changes it. */
    async uid(key: string, path: string): Promise<void> {
      if (!hides) return;
      const meta = await call(() => hostingerRequest<RawMessage>(key, "GET", path), "message");
      if (!meta || isSignInCode(meta.subject)) throw new NotFoundError("message");
    },
    /** The same refusal for a bulk action that names any code message. */
    async uids(key: string, mailbox: string, folderPath: string, uids: number[]): Promise<void> {
      if (!hides) return;
      const hidden = await call(() => hiddenIn(key, mailbox, folderPath), "folder");
      if (hidden.some((m) => uids.includes(m.uid))) throw new NotFoundError("message");
    },
  };
}

type CodeGuard = ReturnType<typeof codeGuard>;

/* ─────────────────────────────── listing ─────────────────────────────── */

const PER_PAGE = 25;
/* How deep a merged or post-filtered list reads before it stops counting. */
const SCAN_PAGES = 3;
const SCAN_PER_PAGE = 100;

type Criteria = Record<string, string | string[]>;

function criteriaOf(f: ListFilters, flagged: boolean): Criteria {
  const out: Criteria = {};
  if (f.q) out.text = f.q;
  if (f.from) out.from = f.from;
  if (f.subject) out.subject = f.subject;
  if (f.since) out.since = f.since;
  if (f.before) out.before = f.before;
  if (flagged) out.flags = ["\\Flagged"];
  return out;
}

/*
 * Hostinger rewrites Delivered-To to the mailbox itself, so an alias, a Bcc or a
 * forward survives only in To and in the `Received: ... for <alias>` trace. Two
 * searches, merged by uid, because IMAP search has no OR here.
 */
function variantsOf(f: ListFilters, flagged: boolean): Criteria[] {
  const base = criteriaOf(f, flagged);
  if (!f.to) return [base];
  return [
    { ...base, to: f.to },
    { ...base, header: `Received:${f.to}` },
  ];
}

function hasFiles(m: MailMessageSummary): boolean {
  return m.attachments.some((a) => !a.inline);
}

async function scan(
  key: string,
  folderBase: string,
  criteria: Criteria,
): Promise<{ items: RawMessage[]; more: boolean }> {
  const items: RawMessage[] = [];
  const empty = Object.keys(criteria).length === 0;
  for (let page = 1; page <= SCAN_PAGES; page += 1) {
    const query = { page, perPage: SCAN_PER_PAGE, sort: "-date" };
    const result = empty
      ? await hostingerPage<RawMessage>(key, `${folderBase}/messages`, query)
      : await hostingerPage<RawMessage>(key, `${folderBase}/messages/search`, query, {
          method: "POST",
          body: criteria,
        });
    items.push(...result.data);
    if (result.page >= result.totalPages) return { items, more: false };
  }
  return { items, more: true };
}

/**
 * One page of messages across one or more folders.
 *
 * The plain case (one folder, one search, no attachment filter) is Hostinger's
 * own paging. Anything that merges or filters on our side reads the newest
 * SCAN_PAGES * SCAN_PER_PAGE matches per search and pages over those.
 */
async function listMessages(
  key: string,
  mailbox: string,
  folders: string[],
  f: ListFilters,
  guard: CodeGuard,
  flagged = false,
): Promise<MailMessagePage> {
  const page = f.page ?? 1;
  const variants = variantsOf(f, flagged);
  const folderBase = (path: string) => `/mailboxes/${enc(mailbox)}/folders/${enc(path)}`;

  if (folders.length === 1 && variants.length === 1 && !f.attachment) {
    const criteria = variants[0];
    const query = { page, perPage: PER_PAGE, sort: "-date" };
    const result =
      Object.keys(criteria).length === 0
        ? await hostingerPage<RawMessage>(key, `${folderBase(folders[0])}/messages`, query)
        : await hostingerPage<RawMessage>(key, `${folderBase(folders[0])}/messages/search`, query, {
            method: "POST",
            body: criteria,
          });
    const kept = result.data.filter((m) => guard.keep(m));
    return {
      items: kept.map(summary),
      page: result.page,
      totalPages: result.totalPages,
      // Hostinger counted the code messages; take off the ones this page dropped.
      total: Math.max(0, result.total - (result.data.length - kept.length)),
    };
  }

  const runs = await Promise.all(
    folders.flatMap((path) => variants.map((criteria) => scan(key, folderBase(path), criteria))),
  );
  const seen = new Map<string, MailMessageSummary>();
  for (const run of runs) {
    for (const raw of run.items) {
      if (!guard.keep(raw)) continue;
      const m = summary(raw);
      seen.set(`${m.folder}\u0001${m.uid}`, m);
    }
  }
  let all = [...seen.values()];
  if (f.attachment) all = all.filter(hasFiles);
  all.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  return {
    items: all.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    page,
    totalPages,
    total: all.length,
    capped: runs.some((run) => run.more),
  };
}

/* ─────────────────────────────── unread ──────────────────────────────── */

/*
 * The rail polls this for every owner and developer once a minute, so it is
 * cached for as long. Anything here that changes a flag or moves mail forgets
 * it, so the badge follows a read on this instance at once.
 */
const UNREAD_TTL_MS = 60_000;
/* Keyed by whether sign-in codes count: the owner sees them and nobody else does. */
const unreadCache = new Map<string, { key: string; at: number; value: Promise<number> }>();

function forgetUnread(): void {
  unreadCache.clear();
  hiddenCache.clear();
}

async function countUnread(key: string, guard: CodeGuard): Promise<number> {
  const account = await hostingerAccount(key);
  const counts = await Promise.all(
    account.mailboxes.map(async (m) => {
      const page = await hostingerPage<RawFolder>(key, `/mailboxes/${enc(m.resourceId)}/folders`, { perPage: 100 });
      const inbox = page.data.find((f) => f.specialUse === "\\Inbox" || f.path === "INBOX");
      if (!inbox) return 0;
      const [counted] = await guard.folders(key, m.resourceId, [folder(inbox)]);
      return counted.unreadCount;
    }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

function cachedUnread(key: string, guard: CodeGuard): Promise<number> {
  const now = Date.now();
  const slot = guard.hides ? "hides" : "all";
  const hit = unreadCache.get(slot);
  if (hit && hit.key === key && now - hit.at < UNREAD_TTL_MS) return hit.value;
  const value = countUnread(key, guard).catch(() => {
    // A failed read is not cached, so the next poll tries again.
    unreadCache.delete(slot);
    return 0;
  });
  unreadCache.set(slot, { key, at: now, value });
  return value;
}

/* ─────────────────────────────── bodies ──────────────────────────────── */

const FolderName = z.object({ name: str().trim().min(1).max(100) }).strict();

const day = () => str().regex(/^\d{4}-\d{2}-\d{2}$/u, "date");

const ListQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    q: str().trim().max(200).optional(),
    from: str().trim().max(320).optional(),
    to: str().trim().max(320).optional(),
    subject: str().trim().max(200).optional(),
    since: day().optional(),
    before: day().optional(),
    attachment: z.literal("1").optional(),
  })
  .strict();

type ListFilters = z.infer<typeof ListQuery>;

const FlagsBody = z
  .object({ read: z.boolean().optional(), flagged: z.boolean().optional() })
  .strict();

const MoveBody = z.object({ targetFolder: str().trim().min(1).max(200) }).strict();

const Uids = z.array(z.number().int().min(1)).min(1).max(100);

const BulkFlagsBody = FlagsBody.extend({ uids: Uids }).strict();

const BulkMoveBody = MoveBody.extend({ uids: Uids }).strict();

const SourceRef = z.object({ uid: z.number().int().min(1), folder: str().min(1).max(200) }).strict();

const SendBody = z
  .object({
    to: z.array(email()).max(50).default([]),
    cc: z.array(email()).max(50).default([]),
    bcc: z.array(email()).max(50).default([]),
    subject: str().trim().max(500),
    /* Newlines are part of a message, and `str()` refuses control characters. */
    text: z.string().max(200_000).refine((v) => !v.includes("\u0000"), "control-character"),
    /* Sent beside `text`, which is then its plain fallback. */
    html: z.string().max(500_000).refine((v) => !v.includes("\u0000"), "control-character").optional(),
    inReplyTo: SourceRef.optional(),
    forwardOf: SourceRef.optional(),
    /* The caller's own draft, dropped once the message is accepted. */
    draftId: str().regex(/^mdrf_[A-Za-z0-9]{8,40}$/u, "draft id").optional(),
  })
  .strict()
  .refine((b) => b.to.length + b.cc.length + b.bcc.length > 0, { message: "recipient", path: ["to"] })
  .refine((b) => !(b.inReplyTo && b.forwardOf), { message: "reply-or-forward", path: ["forwardOf"] });

/* ─────────────────────────────── contacts ────────────────────────────── */

/*
 * The composer's address book: whoever this mailbox has heard from (Inbox From
 * and Cc) and written to (Sent To and Cc). Hostinger has no contacts API, so it
 * is harvested from recent mail into `mail_contacts`, one row per mailbox, and
 * topped up from the newest messages once it is ten minutes old. Each folder's
 * highest uid read is kept, so a top-up stops where the last one began.
 */

interface ContactsDoc {
  _id: string;
  address: string;
  contacts: MailContact[];
  highWater: Record<string, number>;
  harvestedAt: number;
}

const CONTACTS_TTL_MS = 10 * 60_000;
const HARVEST_PAGES = 3;
const MAX_CONTACTS = 2000;
const NOT_PEOPLE = /^(mailer-daemon|postmaster)@/iu;

function contactRows(db: Db) {
  return collection<ContactsDoc>(db, COLLECTIONS.mailContacts);
}

function addContact(book: Map<string, MailContact>, a: MailAddress, at: number, skip: Set<string>): void {
  const key = a.address.toLowerCase();
  if (skip.has(key) || NOT_PEOPLE.test(key)) return;
  const had = book.get(key);
  if (!had) {
    book.set(key, { name: a.name, address: key, count: 1, lastAt: at });
    return;
  }
  had.count += 1;
  if (at >= had.lastAt) {
    had.lastAt = at;
    if (a.name) had.name = a.name;
  } else if (!had.name && a.name) {
    had.name = a.name;
  }
}

function trimBook(book: Map<string, MailContact>): MailContact[] {
  return [...book.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_CONTACTS);
}

const harvesting = new Map<string, Promise<MailContact[]>>();

async function harvest(db: Db, key: string, mailbox: string, doc: ContactsDoc | null): Promise<MailContact[]> {
  const account = await hostingerAccount(key);
  const own = account.mailboxes.find((m) => m.resourceId === mailbox);
  if (!own) throw new NotFoundError("mailbox");
  const skip = new Set(account.mailboxes.map((m) => m.address.toLowerCase()));
  const folders = await hostingerPage<RawFolder>(key, `/mailboxes/${enc(mailbox)}/folders`, { perPage: 100 });
  const inbox = folders.data.find((f) => f.specialUse === "\\Inbox" || f.path === "INBOX")?.path ?? "INBOX";
  const sent = folders.data.find((f) => f.specialUse === "\\Sent")?.path ?? null;

  const book = new Map((doc?.contacts ?? []).map((c) => [c.address, { ...c }] as const));
  const highWater: Record<string, number> = { ...(doc?.highWater ?? {}) };

  for (const [path, outgoing] of [[inbox, false], ...(sent ? [[sent, true] as const] : [])] as const) {
    const since = highWater[path] ?? 0;
    let top = since;
    read: for (let page = 1; page <= HARVEST_PAGES; page += 1) {
      const result = await hostingerPage<RawMessage>(key, `/mailboxes/${enc(mailbox)}/folders/${enc(path)}/messages`, {
        page,
        perPage: 100,
        sort: "-date",
      });
      for (const m of result.data) {
        if (m.uid <= since) break read;
        top = Math.max(top, m.uid);
        // Never harvested, for anybody: an invitee's address is not a suggestion to hand a developer.
        if (isSignInCode(m.subject)) continue;
        const at = Date.parse(m.date) || 0;
        const people = outgoing ? [...addresses(m.to), ...addresses(m.cc)] : [address(m.from), ...addresses(m.cc)];
        for (const a of people) if (a) addContact(book, a, at, skip);
      }
      if (result.page >= result.totalPages) break;
    }
    highWater[path] = top;
  }

  const contacts = trimBook(book);
  const next: ContactsDoc = { _id: mailbox, address: own.address, contacts, highWater, harvestedAt: Date.now() };
  try {
    // Only over the row this harvest started from, so a slower instance cannot undo a faster one.
    if (doc) await contactRows(db).replaceOne({ _id: mailbox, harvestedAt: doc.harvestedAt }, next);
    else await contactRows(db).insertOne(next);
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return contacts;
}

async function contactsFor(db: Db, key: string, mailbox: string): Promise<MailContact[]> {
  const doc = await contactRows(db).findOne({ _id: mailbox });
  if (doc && Date.now() - doc.harvestedAt < CONTACTS_TTL_MS) return doc.contacts;
  let running = harvesting.get(mailbox);
  if (!running) {
    running = harvest(db, key, mailbox, doc).finally(() => harvesting.delete(mailbox));
    harvesting.set(mailbox, running);
  }
  try {
    return await running;
  } catch (err) {
    // A stale book beats none; with none, the refusal is Hostinger's.
    if (doc) return doc.contacts;
    if (err instanceof NotFoundError) throw err;
    hostingerProblem(err);
  }
}

/** Counts a console send at once, rather than at the next harvest. */
async function rememberSent(db: Db, mailbox: string, sent: string[]): Promise<void> {
  const rows = contactRows(db);
  const doc = await rows.findOne({ _id: mailbox });
  if (!doc) return;
  const book = new Map(doc.contacts.map((c) => [c.address, { ...c }] as const));
  const now = Date.now();
  for (const a of sent) addContact(book, { name: "", address: a }, now, new Set([doc.address.toLowerCase()]));
  await rows.updateOne({ _id: mailbox, harvestedAt: doc.harvestedAt }, { $set: { contacts: trimBook(book) } });
}

const ContactsQuery = z
  .object({
    q: str().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

/* ─────────────────────────────── routes ──────────────────────────────── */

export function mailboxRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/mail/mailboxes", requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const key = await keyFor(c);
    const account = await call(() => hostingerAccount(key), "account");
    const mailboxes: MailboxSummary[] = await Promise.all(
      account.mailboxes.map(async (m) => ({
        resourceId: m.resourceId,
        address: m.address,
        quota: quota(
          await hostingerRequest<RawQuota>(key, "GET", `/mailboxes/${enc(m.resourceId)}/quota`).catch(() => null),
        ),
      })),
    );
    const settings = await readMailSettings(db);
    return c.json({
      mailboxes,
      // Which one the site sends as. Empty setting means the first.
      senderMailboxId: settings.senderMailboxId || (mailboxes[0]?.resourceId ?? ""),
    });
  });

  routes.get("/admin/mail/mailboxes/:mailbox/folders", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const page = await call(() => hostingerPage<RawFolder>(key, `${base(c)}/folders`, { perPage: 100 }), "mailbox");
    return c.json({ folders: await codeGuard(c).folders(key, pathParam(c, "mailbox"), page.data.map(folder)) });
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, FolderName);
    const made = await call(
      () => hostingerRequest<RawFolder>(key, "POST", `${base(c)}/folders`, { body }),
      "mailbox",
    );
    return c.json({ folder: made ? folder(made) : null }, 201);
  });

  routes.put("/admin/mail/mailboxes/:mailbox/folders/:folder", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, FolderName);
    const renamed = await call(() => hostingerRequest<RawFolder>(key, "PUT", inFolder(c), { body }), "folder");
    return c.json({ folder: renamed ? folder(renamed) : null });
  });

  routes.delete("/admin/mail/mailboxes/:mailbox/folders/:folder", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    await call(() => hostingerRequest(key, "DELETE", inFolder(c)), "folder");
    return c.json({ ok: true });
  });

  /* Quiet by design: the rail asks on every screen, and a badge is never worth an error. */
  routes.get("/admin/mail/unread", requireAdmin(), async (c) => {
    try {
      const key = await hostingerKey(await currentDb(c));
      return c.json({ count: key ? await cachedUnread(key, codeGuard(c)) : 0 });
    } catch {
      return c.json({ count: 0 });
    }
  });

  /*
   * The addresses on this mailbox's own domain that recent inbox mail was sent
   * to. Hostinger has no alias listing, so this is how the "Sent to" filter
   * learns that arc_athanasius@ exists.
   */
  routes.get("/admin/mail/mailboxes/:mailbox/recipients", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const id = pathParam(c, "mailbox");
    const account = await call(() => hostingerAccount(key), "account");
    const own = account.mailboxes.find((m) => m.resourceId === id);
    if (!own) throw new NotFoundError("mailbox");
    const domain = own.address.split("@")[1]?.toLowerCase() ?? "";
    const recent = await call(
      () => hostingerPage<RawMessage>(key, `${base(c)}/folders/INBOX/messages`, { perPage: 100, sort: "-date" }),
      "mailbox",
    );
    const counts = new Map<string, number>([[own.address.toLowerCase(), 0]]);
    for (const m of recent.data) {
      if (isSignInCode(m.subject)) continue;
      const named = new Set(addresses([...(m.to ?? []), ...(m.cc ?? [])]).map((a) => a.address.toLowerCase()));
      for (const a of named) {
        if (a.endsWith(`@${domain}`)) counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
    const recipients: MailRecipient[] = [...counts]
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
    return c.json({ recipients });
  });

  /* Flagged mail from every folder but Trash and Junk, newest first. */
  routes.get("/admin/mail/mailboxes/:mailbox/starred", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const filters = readQuery(c, ListQuery);
    const folders = await call(() => hostingerPage<RawFolder>(key, `${base(c)}/folders`, { perPage: 100 }), "mailbox");
    const paths = folders.data
      .filter((f) => f.specialUse !== "\\Trash" && f.specialUse !== "\\Junk")
      .map((f) => f.path);
    return c.json(
      await call(() => listMessages(key, pathParam(c, "mailbox"), paths, filters, codeGuard(c), true), "mailbox"),
    );
  });

  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const filters = readQuery(c, ListQuery);
    return c.json(
      await call(
        () => listMessages(key, pathParam(c, "mailbox"), [pathParam(c, "folder")], filters, codeGuard(c)),
        "folder",
      ),
    );
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/flags", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const { uids, read, flagged } = await readJson(c, BulkFlagsBody);
    await codeGuard(c).uids(key, pathParam(c, "mailbox"), pathParam(c, "folder"), uids);
    const addFlags: string[] = [];
    const removeFlags: string[] = [];
    if (read !== undefined) (read ? addFlags : removeFlags).push("\\Seen");
    if (flagged !== undefined) (flagged ? addFlags : removeFlags).push("\\Flagged");
    if (addFlags.length + removeFlags.length === 0) throw new BadRequestError("Nothing to change.");
    const result = await call(
      () =>
        hostingerRequest<{ successful?: number[]; failed?: { uid: number; reason: string }[] }>(
          key,
          "POST",
          `${inFolder(c)}/messages/flags`,
          { body: { uids, ...(addFlags.length ? { addFlags } : {}), ...(removeFlags.length ? { removeFlags } : {}) } },
        ),
      "folder",
    );
    forgetUnread();
    return c.json({ successful: result?.successful ?? uids, failed: result?.failed ?? [] });
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/move", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, BulkMoveBody);
    await codeGuard(c).uids(key, pathParam(c, "mailbox"), pathParam(c, "folder"), body.uids);
    await call(() => hostingerRequest(key, "POST", `${inFolder(c)}/messages/move`, { body }), "folder");
    forgetUnread();
    return c.json({ ok: true });
  });

  /* Reading the body marks the message seen, the same as opening it in webmail. */
  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const path = `${inFolder(c)}/messages/${uidOf(c)}`;
    // Before the body is read, which is what marks a message seen.
    await codeGuard(c).uid(key, path);
    forgetUnread();
    const [meta, body] = await call(
      () =>
        Promise.all([
          hostingerRequest<RawMessage & { bcc?: RawAddress[] }>(key, "GET", path),
          hostingerRequest<{ text?: string | null; html?: string | null }>(key, "GET", `${path}/text`),
        ]),
      "message",
    );
    if (!meta) throw new NotFoundError("message");
    const detail: MailMessageDetail = {
      ...summary(meta),
      unseen: false,
      bcc: addresses(meta.bcc),
      text: body?.text ?? "",
      html: body?.html ?? "",
    };
    return c.json({ message: detail });
  });

  routes.patch("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, FlagsBody);
    await codeGuard(c).uid(key, `${inFolder(c)}/messages/${uidOf(c)}`);
    const addFlags: string[] = [];
    const removeFlags: string[] = [];
    if (body.read !== undefined) (body.read ? addFlags : removeFlags).push("\\Seen");
    if (body.flagged !== undefined) (body.flagged ? addFlags : removeFlags).push("\\Flagged");
    const updated = await call(
      () =>
        hostingerRequest<RawMessage>(key, "PATCH", `${inFolder(c)}/messages/${uidOf(c)}`, {
          body: { addFlags, removeFlags },
        }),
      "message",
    );
    forgetUnread();
    return c.json({ message: updated ? summary(updated) : null });
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid/move", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, MoveBody);
    await codeGuard(c).uid(key, `${inFolder(c)}/messages/${uidOf(c)}`);
    await call(
      () => hostingerRequest(key, "POST", `${inFolder(c)}/messages/${uidOf(c)}/move`, { body }),
      "message",
    );
    forgetUnread();
    return c.json({ ok: true });
  });

  /* Permanent. The console moves to Trash first and only offers this inside Trash. */
  routes.delete("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    await codeGuard(c).uid(key, `${inFolder(c)}/messages/${uidOf(c)}`);
    await call(() => hostingerRequest(key, "DELETE", `${inFolder(c)}/messages/${uidOf(c)}`), "message");
    forgetUnread();
    return c.json({ ok: true });
  });

  routes.get(
    "/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid/attachments/:attachment",
    requireAdmin(),
    async (c) => {
      const key = await keyFor(c);
      await codeGuard(c).uid(key, `${inFolder(c)}/messages/${uidOf(c)}`);
      const upstream = await call(
        () =>
          hostingerFetch(
            key,
            "GET",
            `${inFolder(c)}/messages/${uidOf(c)}/attachments/${enc(pathParam(c, "attachment"))}`,
            { timeoutMs: 45_000 },
          ),
        "attachment",
      );
      const name = safeFilename(c.req.query("name") ?? "attachment");
      return new Response(upstream.body, {
        headers: {
          // Always a download, never rendered on our origin: an attachment is somebody else's file.
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${name}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "private, no-store",
        },
      });
    },
  );

  routes.post("/admin/mail/mailboxes/:mailbox/send", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, SendBody);
    const db = await currentDb(c);
    const settings = await readMailSettings(db);
    const html = body.html?.trim() ? sanitizeEmailHtml(body.html) : "";
    const text = body.text.trim() !== "" || !html ? body.text : htmlToText(html);
    await call(
      () =>
        hostingerRequest(key, "POST", `${base(c)}/send`, {
          body: {
            ...(body.to.length ? { to: body.to } : {}),
            ...(body.cc.length ? { cc: body.cc } : {}),
            ...(body.bcc.length ? { bcc: body.bcc } : {}),
            subject: body.subject,
            text,
            ...(html ? { html } : {}),
            ...(settings.displayName ? { displayName: settings.displayName } : {}),
            ...(body.inReplyTo ? { inReplyTo: body.inReplyTo } : {}),
            ...(body.forwardOf ? { forwardOf: body.forwardOf } : {}),
          },
          timeoutMs: 45_000,
        }),
      "mailbox",
    );
    const mailbox = pathParam(c, "mailbox");
    // Bookkeeping after the fact: the message is already out, so neither may fail the send.
    await Promise.all([
      body.draftId ? dropDraft(db, currentUser(c).id, body.draftId) : null,
      rememberSent(db, mailbox, [...body.to, ...body.cc, ...body.bcc]),
    ]).catch((err: unknown) => {
      console.error("[mail]", JSON.stringify({ after: "send", message: err instanceof Error ? err.message : String(err) }));
    });
    return c.json({ sent: true });
  });

  routes.get("/admin/mail/mailboxes/:mailbox/contacts", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const { q, limit } = readQuery(c, ContactsQuery);
    const contacts = await contactsFor(await currentDb(c), key, pathParam(c, "mailbox"));
    return c.json({ contacts: rankContacts(contacts, q ?? "", limit ?? 8) });
  });

  return routes;
}
