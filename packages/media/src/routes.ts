import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
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
import type { ImageRecord } from "@avhomes/contracts";
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
}

const SORT: SortSpec = { field: "createdAt", direction: -1 };
const SORT_NAME = "newest";

function images(db: Db) {
  return collection<ImageDoc>(db, COLLECTIONS.images);
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

export function mediaRoutes(deps: { storage: StoragePort }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/images", requireAuth(), async (c) => {
    const q = readQuery(c, ListQuery);
    const limit = clampLimit(q.limit);
    const docs = await images(await currentDb(c))
      .find(keysetFilter<ImageDoc>(SORT, q.cursor, SORT_NAME), {
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

    const db = await currentDb(c);
    const user = currentUser(c);
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
    };
    await images(db).insertOne(doc);
    auditEntityId(c, doc._id);
    return c.json({ image: toImageRecord(doc) }, 201);
  });

  routes.patch("/admin/images/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const { alt } = await readJson(c, AltBody);
    const after = await images(await currentDb(c)).findOneAndUpdate(
      { _id: id },
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
    const doc = await images(db).findOne({ _id: id });
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
