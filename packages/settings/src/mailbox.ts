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
  MailMessageSummary,
  MailQuota,
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

/* ─────────────────────────────── bodies ──────────────────────────────── */

const FolderName = z.object({ name: str().trim().min(1).max(100) }).strict();

const ListQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    q: str().trim().max(200).optional(),
  })
  .strict();

const FlagsBody = z
  .object({ read: z.boolean().optional(), flagged: z.boolean().optional() })
  .strict();

const MoveBody = z.object({ targetFolder: str().trim().min(1).max(200) }).strict();

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

  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const { page = 1, q } = readQuery(c, ListQuery);
    const query = { page, perPage: 25, sort: "-date" };
    const result = await call(
      () =>
        q
          ? hostingerPage<RawMessage>(key, `${inFolder(c)}/messages/search`, query, {
              method: "POST",
              body: { text: q },
            })
          : hostingerPage<RawMessage>(key, `${inFolder(c)}/messages`, query),
      "folder",
    );
    return c.json({
      items: result.data.map(summary),
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  });

  /* Reading the body marks the message seen, the same as opening it in webmail. */
  routes.get("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
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
    return c.json({ message: updated ? summary(updated) : null });
  });

  routes.post("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid/move", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    const body = await readJson(c, MoveBody);
    await call(
      () => hostingerRequest(key, "POST", `${inFolder(c)}/messages/${uidOf(c)}/move`, { body }),
      "message",
    );
    return c.json({ ok: true });
  });

  /* Permanent. The console moves to Trash first and only offers this inside Trash. */
  routes.delete("/admin/mail/mailboxes/:mailbox/folders/:folder/messages/:uid", requireAdmin(), async (c) => {
    const key = await keyFor(c);
    await call(() => hostingerRequest(key, "DELETE", `${inFolder(c)}/messages/${uidOf(c)}`), "message");
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
