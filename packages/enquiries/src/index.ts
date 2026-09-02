import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  NotFoundError,
  StaleWriteError,
  clampLimit,
  clientIp,
  currentDb,
  currentUser,
  email,
  getEnv,
  keysetFilter,
  keysetSort,
  newId,
  pathParam,
  readJson,
  readQuery,
  siteOrigin,
  str,
  takePage,
  trySend,
  type AppEnv,
  type Mailer,
  type SortSpec,
} from "@avhomes/core";
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryStatus } from "@avhomes/contracts";
import { ENQUIRY_IP_LIMIT, ENQUIRY_WINDOW_MS, limit, requireAuth } from "@avhomes/identity";

/**
 * @avhomes/enquiries
 *
 * The contact form's intake and the inbox that works it. One public mutation and
 * a small admin surface.
 */

interface EnquiryDoc {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  propertyId: string | null;
  propertySlug: string | null;
  status: EnquiryStatus;
  createdAt: number;
  updatedAt: number;
  handledBy: string | null;
  note: string | null;
  /** Kept for abuse triage. NEVER returned on the wire. */
  sourceIp: string | null;
  revision: number;
}

/** Enumerated, so `sourceIp` cannot arrive in a response by default. */
const WIRE_PROJECTION = {
  _id: 1,
  name: 1,
  email: 1,
  phone: 1,
  message: 1,
  propertyId: 1,
  propertySlug: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
  handledBy: 1,
  note: 1,
  revision: 1,
} as const;

const SORT: SortSpec = { field: "createdAt", direction: -1 };
const SORT_NAME = "newest";

function enquiries(db: Db) {
  return collection<EnquiryDoc>(db, COLLECTIONS.enquiries);
}

function toEnquiry(doc: EnquiryDoc, handlerName: string | null): Enquiry {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    message: doc.message,
    propertyId: doc.propertyId,
    propertySlug: doc.propertySlug,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    handledBy: doc.handledBy,
    handledByName: handlerName,
    note: doc.note,
    revision: doc.revision,
  };
}

async function handlerNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const real = ids.filter((id): id is string => id !== null);
  if (real.length === 0) return new Map();
  const rows = await collection<{ _id: string; displayName: string }>(db, COLLECTIONS.users)
    .find({ _id: { $in: [...new Set(real)] } }, { projection: { _id: 1, displayName: 1 } })
    .toArray();
  return new Map(rows.map((r) => [r._id, r.displayName]));
}

const SubmitBody = z
  .object({
    name: str().min(1).max(200).trim(),
    email: email(),
    phone: str().max(60).trim().optional(),
    message: str().min(1).max(5000).trim(),
    propertyId: str().max(120).optional(),
    propertySlug: str().max(200).optional(),
    /**
     * A honeypot. Bots fill every field they find; a human never sees this one,
     * so a non-empty value is a bot and the response is a normal 201 telling it
     * nothing. Refusing loudly just teaches the next attempt.
     */
    website: str().max(200).optional(),
  })
  .strict();

/**
 * The public intake.
 *
 * A public MUTATION, so it is mounted BELOW the origin guard and deliberately
 * NOT in the cacheable `/public/*` router. That router's whole safety property
 * is that a shared cache may store its responses; putting a write in it would
 * put "may be handed to another reader" and "creates a document" in one file.
 */
export function enquiriesPublicRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/enquiries", async (c) => {
    /*
     * PARSED BEFORE THE LIMITER, and the order is the point.
     *
     * Validation is free: a JSON parse and a schema check, no I/O. The limiter
     * is a database write. Checking the cheap thing first means a malformed body
     * never costs a round trip to Atlas, and it still cannot be used to flood
     * anything, because every WELL-FORMED request below is still counted.
     */
    const body = await readJson(c, SubmitBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    // Bounds the deployment, not one warm instance, because the counter is a
    // document rather than a variable.
    await limit(db, `enquiry:${ip}`, ENQUIRY_IP_LIMIT, ENQUIRY_WINDOW_MS);

    if (body.website !== undefined && body.website.trim() !== "") {
      // Answers exactly like a success, and stores nothing.
      return c.json({ ok: true }, 201);
    }

    const now = Date.now();
    const doc: EnquiryDoc = {
      _id: newId("enq", now),
      name: body.name,
      email: body.email,
      phone: body.phone?.trim() || null,
      message: body.message,
      propertyId: body.propertyId ?? null,
      propertySlug: body.propertySlug ?? null,
      status: "new",
      createdAt: now,
      updatedAt: now,
      handledBy: null,
      note: null,
      sourceIp: ip === "unknown" ? null : ip,
      revision: 1,
    };
    await enquiries(db).insertOne(doc);

    const notifyTo = getEnv().ENQUIRY_NOTIFY_TO;
    if (notifyTo !== "") {
      await trySend(
        deps.mailer,
        {
          to: notifyTo,
          subject: `New enquiry from ${doc.name}`,
          text: [
            `${doc.name} <${doc.email}>${doc.phone ? ` / ${doc.phone}` : ""}`,
            doc.propertySlug ? `About: ${siteOrigin()}/listings/${doc.propertySlug}` : "",
            "",
            doc.message,
            "",
            `Open the inbox: ${siteOrigin()}/admin/enquiries`,
          ]
            .filter(Boolean)
            .join("\n"),
          // So hitting reply in a mail client answers the person, not the site.
          replyTo: doc.email,
        },
        { requestId: c.get("requestId"), route: "POST /enquiries" },
      );
    }

    // The id is returned so a client can reference it in a support conversation.
    // Nothing else is: the caller wrote it, they do not need it read back.
    return c.json({ ok: true, id: doc._id }, 201);
  });

  return routes;
}

/* ─────────────────────────────── admin ────────────────────────────────── */

const ListQuery = z
  .object({
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(ENQUIRY_STATUSES).optional(),
  })
  .strict();

const UpdateBody = z
  .object({
    status: z.enum(ENQUIRY_STATUSES).optional(),
    note: str().max(4000).nullable().optional(),
    baseRevision: z.number().int().min(0),
  })
  .strict();

export function enquiriesAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/enquiries", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const q = readQuery(c, ListQuery);
    const size = clampLimit(q.limit);

    const and: Record<string, unknown>[] = [];
    if (q.status) and.push({ status: q.status });
    const keyset = keysetFilter<EnquiryDoc>(SORT, q.cursor, SORT_NAME);
    if (Object.keys(keyset).length > 0) and.push(keyset);

    const docs = await enquiries(db)
      .find(and.length === 0 ? {} : { $and: and }, {
        projection: WIRE_PROJECTION,
        sort: keysetSort(SORT),
        limit: size + 1,
      })
      .toArray();

    const { items, nextCursor } = takePage(docs, size, SORT, SORT_NAME);
    const names = await handlerNames(db, items.map((d) => d.handledBy));
    return c.json({
      items: items.map((d) => toEnquiry(d, d.handledBy ? (names.get(d.handledBy) ?? null) : null)),
      nextCursor,
    });
  });

  routes.get("/admin/enquiries/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const doc = await enquiries(db).findOne({ _id: id }, { projection: WIRE_PROJECTION });
    if (!doc) throw new NotFoundError(`enquiry ${id}`);
    const names = await handlerNames(db, [doc.handledBy]);
    return c.json({
      enquiry: toEnquiry(doc, doc.handledBy ? (names.get(doc.handledBy) ?? null) : null),
    });
  });

  routes.patch("/admin/enquiries/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, UpdateBody);
    const user = currentUser(c);
    const now = Date.now();

    const set: Partial<EnquiryDoc> = { updatedAt: now };
    if (body.status !== undefined) {
      set.status = body.status;
      // Whoever moved it off "new" owns it. Recorded here rather than asked for,
      // because an inbox where everyone has to remember to claim a row is an
      // inbox where nobody does.
      set.handledBy = body.status === "new" ? null : user.id;
    }
    if (body.note !== undefined) set.note = body.note;

    const after = await enquiries(db).findOneAndUpdate(
      { _id: id, revision: body.baseRevision },
      { $set: set, $inc: { revision: 1 } },
      { returnDocument: "after", projection: WIRE_PROJECTION },
    );
    if (!after) {
      const current = await enquiries(db).findOne({ _id: id }, { projection: WIRE_PROJECTION });
      if (!current) throw new NotFoundError(`enquiry ${id}`);
      const names = await handlerNames(db, [current.handledBy]);
      throw new StaleWriteError(
        "enquiry",
        body.baseRevision,
        current.revision,
        toEnquiry(current, current.handledBy ? (names.get(current.handledBy) ?? null) : null),
      );
    }

    const names = await handlerNames(db, [after.handledBy]);
    return c.json({
      enquiry: toEnquiry(after, after.handledBy ? (names.get(after.handledBy) ?? null) : null),
    });
  });

  return routes;
}

/** Counts by status, for the dashboard. One aggregation, not five counts. */
export async function enquiryCounts(db: Db): Promise<Record<EnquiryStatus, number>> {
  const rows = await enquiries(db)
    .aggregate<{ _id: EnquiryStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    .toArray();
  const out: Record<EnquiryStatus, number> = { new: 0, open: 0, closed: 0, spam: 0 };
  for (const row of rows) {
    if (row._id in out) out[row._id] = row.count;
  }
  return out;
}
