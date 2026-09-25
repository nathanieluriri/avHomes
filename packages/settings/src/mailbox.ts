import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  HostingerError,
  NotFoundError,
  currentDb,
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
import type {
  MailAddress,
  MailAttachmentInfo,
  MailFolder,
  MailMessageDetail,
  MailMessagePage,
  MailMessageSummary,
  MailQuota,
  MailRecipient,
  MailboxSummary,
} from "@avhomes/contracts";
import { requireAdmin } from "@avhomes/identity";
import { hostingerKey, hostingerProblem, readMailSettings } from "./mail";

/**
 * The console's window onto the Hostinger mailboxes: quotas, folders, reading,
 * filing and sending.
 *
 * A pass-through, deliberately. Nothing here is copied into the database, so
 * the mailbox stays the one record of what was received and sent, and deleting
 * a message in Hostinger's own webmail is not contradicted by a stale copy here.
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
    return { items: result.data.map(summary), page: result.page, totalPages: result.totalPages, total: result.total };
  }

  const runs = await Promise.all(
    folders.flatMap((path) => variants.map((criteria) => scan(key, folderBase(path), criteria))),
  );
  const seen = new Map<string, MailMessageSummary>();
  for (const run of runs) {
    for (const raw of run.items) {
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
let unreadCache: { key: string; at: number; value: Promise<number> } | null = null;

function forgetUnread(): void {
  unreadCache = null;
}

async function countUnread(key: string): Promise<number> {
  const account = await hostingerAccount(key);
  const counts = await Promise.all(
    account.mailboxes.map(async (m) => {
      const page = await hostingerPage<RawFolder>(key, `/mailboxes/${enc(m.resourceId)}/folders`, { perPage: 100 });
      const inbox = page.data.find((f) => f.specialUse === "\\Inbox" || f.path === "INBOX");
      return inbox?.unreadCount ?? 0;
    }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

function cachedUnread(key: string): Promise<number> {
  const now = Date.now();
  if (unreadCache && unreadCache.key === key && now - unreadCache.at < UNREAD_TTL_MS) return unreadCache.value;
  const value = countUnread(key).catch(() => {
    // A failed read is not cached, so the next poll tries again.
    unreadCache = null;
    return 0;
  });
  unreadCache = { key, at: now, value };
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
    inReplyTo: SourceRef.optional(),
    forwardOf: SourceRef.optional(),
  })
  .strict()
  .refine((b) => b.to.length + b.cc.length + b.bcc.length > 0, { message: "recipient", path: ["to"] })
  .refine((b) => !(b.inReplyTo && b.forwardOf), { message: "reply-or-forward", path: ["forwardOf"] });

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
    return c.json({ folders: page.data.map(folder) });
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
      return c.json({ count: key ? await cachedUnread(key) : 0 });
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
    return c.json(await call(() => listMessages(key, pathParam(c, "mailbox"), paths, filters, true), "mailbox"));
  });

  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const filters = readQuery(c, ListQuery);
    return c.json(
      await call(() => listMessages(key, pathParam(c, "mailbox"), [pathParam(c, "folder")], filters), "folder"),
    );
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/flags", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const { uids, read, flagged } = await readJson(c, BulkFlagsBody);
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
    await call(() => hostingerRequest(key, "POST", `${inFolder(c)}/messages/move`, { body }), "folder");
    forgetUnread();
    return c.json({ ok: true });
  });

  /* Reading the body marks the message seen, the same as opening it in webmail. */
  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
    forgetUnread();
    const key = await keyFor(c);
    const path = `${inFolder(c)}/messages/${uidOf(c)}`;
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
    await call(() => hostingerRequest(key, "DELETE", `${inFolder(c)}/messages/${uidOf(c)}`), "message");
    forgetUnread();
    return c.json({ ok: true });
  });

  routes.get(
    "/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid/attachments/:attachment",
    requireAdmin(),
    async (c) => {
      const key = await keyFor(c);
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
    const settings = await readMailSettings(await currentDb(c));
    await call(
      () =>
        hostingerRequest(key, "POST", `${base(c)}/send`, {
          body: {
            ...(body.to.length ? { to: body.to } : {}),
            ...(body.cc.length ? { cc: body.cc } : {}),
            ...(body.bcc.length ? { bcc: body.bcc } : {}),
            subject: body.subject,
            text: body.text,
            ...(settings.displayName ? { displayName: settings.displayName } : {}),
            ...(body.inReplyTo ? { inReplyTo: body.inReplyTo } : {}),
            ...(body.forwardOf ? { forwardOf: body.forwardOf } : {}),
          },
          timeoutMs: 45_000,
        }),
      "mailbox",
    );
    return c.json({ sent: true });
  });

  return routes;
}
