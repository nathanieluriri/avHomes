import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  ForbiddenError,
  PreconditionFailedError,
  NotFoundError,
  auditEntityId,
  clampLimit,
  currentDb,
  currentUser,
  keysetFilter,
  keysetSort,
  newId,
  pathParam,
  readJson,
  readQuery,
  str,
  takePage,
  type AppEnv,
  type SortSpec,
} from "@avhomes/core";
import {
  DEFAULT_MEDIA_QUOTA_BYTES,
  formatBytes,
  isScopedRole,
  NO_PARTNER,
  partnerScopeOf,
  type ImageRecord,
  type MediaUsage,
  type NotificationInput,
  type QuotaRequest,
  type QuotaRequestStatus,
  type Role,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import { sniffImage } from "./sniff";
import type { StoragePort } from "./storage";

interface ImageDoc {
  _id: string;
  url: string;
  alt: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  pathname: string;
  createdAt: number;
  updatedAt: number;
  uploadedBy: string;
  /** The company that uploaded it. Null for AV Homes' own. */
  partnerId?: string | null;
}

const SORT: SortSpec = { field: "createdAt", direction: -1 };
const SORT_NAME = "newest";

function images(db: Db) {
  return collection<ImageDoc>(db, COLLECTIONS.images);
}

/**
 * The rows this caller may see and touch: all of them, or its company's.
 *
 * By company rather than by uploader, so a partner's staff share one library.
 * Merged into the query, so another company's id is simply not found.
 */
function ownedBy(user: { role: Role; partnerId: string | null }): Partial<ImageDoc> {
  const scope = partnerScopeOf(user);
  return scope === null ? {} : { partnerId: scope };
}

function toImageRecord(doc: ImageDoc): ImageRecord {
  return {
    id: doc._id,
    url: doc.url,
    alt: doc.alt,
    contentType: doc.contentType,
    width: doc.width,
    height: doc.height,
    bytes: doc.bytes,
    createdAt: doc.createdAt,
    uploadedBy: doc.uploadedBy,
  };
}

const ListQuery = z
  .object({ limit: str().optional(), cursor: str().max(600).optional() })
  .strict();

const AltBody = z.object({ alt: str().max(500) }).strict();

/** Delivers a notification to every developer. Injected so media imports no other feature package. */
export type Notifier = (db: Db, input: NotificationInput) => Promise<void>;

/* ─────────────────────────────── quota ─────────────────────────────── */

const QUOTA_DOC_ID = "media-quota";
const GB = 1024 * 1024 * 1024;
const MAX_QUOTA_BYTES = 1024 * GB;

interface QuotaDoc {
  _id: string;
  limitBytes: number;
  updatedAt: number;
}

interface QuotaRequestDoc {
  _id: string;
  requestedBytes: number;
  message: string;
  status: QuotaRequestStatus;
  requestedBy: string;
  requestedByName: string;
  createdAt: number;
  updatedAt: number;
  decidedAt: number | null;
  decidedByName: string | null;
}

function quotaRequests(db: Db) {
  return collection<QuotaRequestDoc>(db, COLLECTIONS.quotaRequests);
}

function toQuotaRequest(doc: QuotaRequestDoc): QuotaRequest {
  return {
    id: doc._id,
    requestedBytes: doc.requestedBytes,
    message: doc.message,
    status: doc.status,
    requestedBy: doc.requestedBy,
    requestedByName: doc.requestedByName,
    createdAt: doc.createdAt,
    decidedAt: doc.decidedAt,
    decidedByName: doc.decidedByName,
  };
}

// Kept in the settings collection under its own id; the site settings document is untouched.
async function readLimit(db: Db): Promise<number> {
  const doc = await collection<QuotaDoc>(db, COLLECTIONS.settings).findOne({ _id: QUOTA_DOC_ID });
  return doc?.limitBytes ?? DEFAULT_MEDIA_QUOTA_BYTES;
}

async function writeLimit(db: Db, limitBytes: number): Promise<void> {
  await collection<QuotaDoc>(db, COLLECTIONS.settings).updateOne(
    { _id: QUOTA_DOC_ID },
    { $set: { limitBytes, updatedAt: Date.now() } },
    { upsert: true },
  );
}

export async function mediaUsage(db: Db): Promise<MediaUsage> {
  const [totals] = await images(db)
    .aggregate<{ used: number; count: number }>([
      { $group: { _id: null, used: { $sum: "$bytes" }, count: { $sum: 1 } } },
    ])
    .toArray();
  const pending = await quotaRequests(db).findOne({ status: "pending" }, { sort: { createdAt: -1 } });
  return {
    usedBytes: totals?.used ?? 0,
    limitBytes: await readLimit(db),
    fileCount: totals?.count ?? 0,
    pendingRequest: pending ? toQuotaRequest(pending) : null,
  };
}

function refuseOverQuota(usage: MediaUsage, incoming: number): void {
  if (usage.usedBytes + incoming <= usage.limitBytes) return;
  throw new PreconditionFailedError("media_quota_exceeded", {
    detail: `Storage is full: ${formatBytes(usage.usedBytes)} of ${formatBytes(
      usage.limitBytes,
    )} used. Delete files from the library, or ask the owner to request more space.`,
    usedBytes: usage.usedBytes,
    limitBytes: usage.limitBytes,
  });
}

const QuotaRequestBody = z
  .object({
    requestedBytes: z.number().int().min(1).max(MAX_QUOTA_BYTES),
    message: str().max(1000).trim().default(""),
  })
  .strict();

const DecisionBody = z
  .object({
    decision: z.enum(["approve", "decline"]),
    /** Overrides the requested size on approve. */
    limitBytes: z.number().int().min(1).max(MAX_QUOTA_BYTES).optional(),
  })
  .strict();

const LimitBody = z.object({ limitBytes: z.number().int().min(1).max(MAX_QUOTA_BYTES) }).strict();

/**
 * The image library.
 *
 * Uploads go through the server rather than a signed client-side PUT with a
 * completion callback. The callback shape would need a route mounted ABOVE the
 * origin guard (a provider POST carries no Origin), and buying that exemption is
 * not worth saving one hop for files this size. If uploads ever outgrow the
 * function's body limit, that is the moment to add it, and the mount slot is
 * already documented in the composition root.
 */
/**
 * Serves locally stored images.
 *
 * Mounted in the PUBLIC router, above the session middleware, so it is
 * cookieless by construction like every other public read. It exists only when
 * the active store implements `read`: a CDN-backed store hands out absolute
 * URLs the browser fetches directly, and this route would be dead weight in
 * front of it.
 */
export function mediaPublicRoutes(deps: { storage: StoragePort }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/public/images/:file", async (c) => {
    const read = deps.storage.read;
    // A store with no read path means these URLs were never minted by us.
    if (!read) throw new NotFoundError("local image serving is not enabled");

    const name = pathParam(c, "file");
    const file = await read.call(deps.storage, name);
    if (!file) throw new NotFoundError(`image ${name}`);

    return new Response(file.body, {
      status: 200,
      headers: {
        "content-type": file.contentType,
        // Safe as immutable: an id names one committed upload, so replacing a
        // photo produces a new id and a new URL.
        "cache-control": "public, max-age=31536000, immutable",
        // The bytes were sniffed on the way in, but a browser must not be
        // allowed to second-guess the type on the way out either.
        "x-content-type-options": "nosniff",
        // Belt and braces for a store that ever accepts SVG: served from our
        // own origin, an SVG is a script document.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  });

  return routes;
}

export function mediaRoutes(deps: { storage: StoragePort; notify?: Notifier }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/images/quota", requireAuth(), async (c) => {
    return c.json({ usage: await mediaUsage(await currentDb(c)) });
  });

  // The owner asks; a developer decides. One open request at a time.
  routes.post("/admin/images/quota/requests", requireAuth(), async (c) => {
    const user = currentUser(c);
    if (user.role !== "owner") throw new ForbiddenError("only the owner can request more storage");
    const body = await readJson(c, QuotaRequestBody);
    const db = await currentDb(c);

    const pending = await quotaRequests(db).findOne({ status: "pending" });
    if (pending) {
      throw new PreconditionFailedError("quota_request_pending", {
        detail: "A request for more storage is already waiting for the developer.",
      });
    }

    const now = Date.now();
    const doc: QuotaRequestDoc = {
      _id: newId("qreq", now),
      requestedBytes: body.requestedBytes,
      message: body.message,
      status: "pending",
      requestedBy: user.id,
      requestedByName: user.displayName,
      createdAt: now,
      updatedAt: now,
      decidedAt: null,
      decidedByName: null,
    };
    await quotaRequests(db).insertOne(doc);
    auditEntityId(c, doc._id);

    const usage = await mediaUsage(db);
    await deps.notify?.(db, {
      kind: "quota-request",
      title: `${user.displayName} asked for ${formatBytes(body.requestedBytes)} of storage`,
      body: `Currently ${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used.${
        body.message ? ` "${body.message}"` : ""
      }`,
      href: "/admin/notifications",
      subjectId: doc._id,
      actorId: user.id,
      actorName: user.displayName,
    });

    return c.json({ request: toQuotaRequest(doc), usage }, 201);
  });

  routes.get("/admin/images/quota/requests", requireAuth(), async (c) => {
    // The owner's notes to the developer about AV Homes' storage bill: nothing a partner reads.
    if (isScopedRole(currentUser(c).role)) return c.json({ items: [] });
    const docs = await quotaRequests(await currentDb(c))
      .find({}, { sort: { createdAt: -1 }, limit: 20 })
      .toArray();
    return c.json({ items: docs.map(toQuotaRequest) });
  });

  routes.patch("/admin/images/quota/requests/:id", requireAuth(), async (c) => {
    const user = currentUser(c);
    if (user.role !== "developer") throw new ForbiddenError("only a developer can decide a storage request");
    const id = pathParam(c, "id");
    const body = await readJson(c, DecisionBody);
    const db = await currentDb(c);
    const now = Date.now();

    const after = await quotaRequests(db).findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        $set: {
          status: body.decision === "approve" ? "approved" : "declined",
          decidedAt: now,
          decidedByName: user.displayName,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!after) {
      const current = await quotaRequests(db).findOne({ _id: id });
      if (!current) throw new NotFoundError(`quota request ${id}`);
      throw new PreconditionFailedError("quota_request_decided", {
        detail: `That request was already ${current.status}.`,
      });
    }
    if (body.decision === "approve") await writeLimit(db, body.limitBytes ?? after.requestedBytes);
    return c.json({ request: toQuotaRequest(after), usage: await mediaUsage(db) });
  });

  routes.put("/admin/images/quota", requireAuth(), async (c) => {
    const user = currentUser(c);
    if (user.role !== "developer") throw new ForbiddenError("only a developer can change the storage limit");
    const { limitBytes } = await readJson(c, LimitBody);
    const db = await currentDb(c);
    await writeLimit(db, limitBytes);
    return c.json({ usage: await mediaUsage(db) });
  });

  routes.get("/admin/images", requireAuth(), async (c) => {
    const q = readQuery(c, ListQuery);
    const limit = clampLimit(q.limit);
    const docs = await images(await currentDb(c))
      .find({ ...keysetFilter<ImageDoc>(SORT, q.cursor, SORT_NAME), ...ownedBy(currentUser(c)) }, {
        sort: keysetSort(SORT),
        limit: limit + 1,
      })
      .toArray();
    const { items, nextCursor } = takePage(docs, limit, SORT, SORT_NAME);
    return c.json({ items: items.map(toImageRecord), nextCursor });
  });

  routes.post("/admin/images", requireAuth(), async (c) => {
    // Asked BEFORE the body is read, so an unconfigured deployment answers 501
    // immediately instead of after buffering twelve megabytes.
    deps.storage.assertConfigured();

    const user = currentUser(c);
    const scope = partnerScopeOf(user);
    // Never written: NO_PARTNER is the sentinel a companyless account scopes to,
    // and stamping it on a row would let every other companyless account match it.
    if (scope === NO_PARTNER) throw new ForbiddenError("this partner account has no company");

    const db = await currentDb(c);
    // Checked against the declared length first, so a full store does not buffer a 90MB video to say no.
    const usageBefore = await mediaUsage(db);
    refuseOverQuota(usageBefore, Number(c.req.header("content-length") ?? 0) * 0.98);

    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new BadRequestError("content-type", [
        { path: "content-type", message: "expected multipart/form-data with a file field" },
      ]);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw new BadRequestError("body", [{ path: "<body>", message: "malformed multipart body" }]);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new BadRequestError("file", [{ path: "file", message: "missing file field" }]);
    }
    const alt = form.get("alt");

    const buffer = await file.arrayBuffer();
    // The declared type is ignored entirely. These are the bytes.
    const sniffed = sniffImage(buffer);
    refuseOverQuota(usageBefore, buffer.byteLength);

    const now = Date.now();
    const id = newId("img", now);

    const stored = await deps.storage.put(
      `images/${id}.${sniffed.extension}`,
      buffer,
      sniffed.contentType,
    );

    const doc: ImageDoc = {
      _id: id,
      url: stored.url,
      alt: typeof alt === "string" ? alt.slice(0, 500) : "",
      contentType: sniffed.contentType,
      width: sniffed.width,
      height: sniffed.height,
      bytes: stored.bytes,
      pathname: stored.pathname,
      createdAt: now,
      updatedAt: now,
      uploadedBy: user.id,
      partnerId: scope,
    };
    await images(db).insertOne(doc);
    auditEntityId(c, doc._id);
    return c.json({ image: toImageRecord(doc) }, 201);
  });

  routes.patch("/admin/images/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const { alt } = await readJson(c, AltBody);
    const after = await images(await currentDb(c)).findOneAndUpdate(
      { _id: id, ...ownedBy(currentUser(c)) },
      { $set: { alt, updatedAt: Date.now() } },
      { returnDocument: "after" },
    );
    if (!after) throw new NotFoundError(`image ${id}`);
    return c.json({ image: toImageRecord(after) });
  });

  /**
   * Removes the row, then the object.
   *
   * In that order deliberately: a row pointing at a missing object renders as a
   * broken image on every page that used it, while an orphaned object costs
   * storage and nothing else. Being wrong in the cheaper direction is the whole
   * choice here.
   */
  routes.delete("/admin/images/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    // Not found rather than forbidden for someone else's upload: a partner learns nothing about ids they do not own.
    const doc = await images(db).findOne({ _id: id, ...ownedBy(currentUser(c)) });
    if (!doc) throw new NotFoundError(`image ${id}`);

    await images(db).deleteOne({ _id: id });
    try {
      await deps.storage.remove(doc.pathname);
    } catch (err) {
      // The row is gone and the caller's intent is satisfied. An orphaned object
      // is a cleanup task, not a failed request.
      console.error(
        "[api]",
        JSON.stringify({
          requestId: c.get("requestId"),
          route: "DELETE /admin/images/:id",
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          orphanedPathname: doc.pathname,
        }),
      );
    }
    return c.json({ ok: true });
  });

  return routes;
}
