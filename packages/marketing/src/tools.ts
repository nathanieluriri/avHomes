/**
 * Marketing tools: the guides, trainings and merch partners are given, and the
 * merch they ask for.
 *
 * The four lists share one document in `settings`, saved a list at a time, so a
 * reorder is one write and the partner app reads everything in one go.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import {
  BadRequestError,
  NotFoundError,
  auditBefore,
  currentDb,
  currentUser,
  newId,
  pathParam,
  readJson,
  str,
  type AppEnv,
} from "@avhomes/core";
import { requireAuth } from "@avhomes/identity";
import { findMarketerById } from "./repo";
import {
  DEFAULT_MARKETING_TOOLS,
  GUIDE_KINDS,
  MERCH_REQUEST_STATUSES,
  TOOL_BODY_MAX,
  TOOL_LISTS,
  TOOL_LIST_MAX,
  TOOL_SUMMARY_MAX,
  TOOL_TITLE_MAX,
  TOOL_URL_MAX,
  gradeAllows,
  gradeFor,
  type Marketer,
  type MarketingTools,
  type MerchRequest,
  type MerchRequestStatus,
  type PartnerTools,
  type PushMessage,
  type ToolList,
} from "@avhomes/contracts";

const DOC_ID = "marketing-tools";

type ToolsDoc = Partial<MarketingTools> & { _id: string; updatedAt?: number };

interface RequestDoc extends Omit<MerchRequest, "id"> {
  _id: string;
}

function settingsRows(db: Db) {
  return collection<ToolsDoc>(db, COLLECTIONS.settings);
}

function requests(db: Db) {
  return collection<RequestDoc>(db, COLLECTIONS.merchRequests);
}

function toRequest({ _id, ...rest }: RequestDoc): MerchRequest {
  return { id: _id, ...rest };
}

/** Every list, the defaults standing in for any never saved. */
export async function readTools(db: Db): Promise<MarketingTools> {
  const doc = await settingsRows(db).findOne({ _id: DOC_ID });
  return {
    guides: doc?.guides ?? DEFAULT_MARKETING_TOOLS.guides,
    trainings: doc?.trainings ?? DEFAULT_MARKETING_TOOLS.trainings,
    grades: doc?.grades ?? DEFAULT_MARKETING_TOOLS.grades,
    merch: doc?.merch ?? DEFAULT_MARKETING_TOOLS.merch,
  };
}

export async function writeToolList<K extends ToolList>(db: Db, list: K, items: MarketingTools[K]): Promise<MarketingTools> {
  await settingsRows(db).updateOne(
    { _id: DOC_ID },
    { $set: { [list]: items, updatedAt: Date.now() } },
    { upsert: true },
  );
  return readTools(db);
}

/** Approved deals a partner closed or reported, which is what a merch grade is reached by. */
export async function approvedDealCount(db: Db, marketerId: string): Promise<number> {
  return collection(db, COLLECTIONS.marketingDeals).countDocuments({
    status: "approved",
    $or: [{ closerId: marketerId }, { reporterId: marketerId }],
  });
}

export async function partnerTools(db: Db, marketer: Marketer): Promise<PartnerTools> {
  const [tools, approvedDeals, mine] = await Promise.all([
    readTools(db),
    approvedDealCount(db, marketer.id),
    requests(db).find({ marketerId: marketer.id }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  return {
    guides: tools.guides.filter((g) => !g.hidden),
    trainings: tools.trainings.filter((t) => !t.hidden),
    grades: [...tools.grades].sort((a, b) => a.minDeals - b.minDeals),
    merch: tools.merch.filter((m) => !m.hidden),
    approvedDeals,
    gradeId: gradeFor(tools.grades, approvedDeals)?.id ?? null,
    requests: mine.map(toRequest),
  };
}

/**
 * A partner asks for one item. Refused when their grade is too low, the item is
 * out of stock, or they already have an open request for it.
 */
export async function requestMerch(
  db: Db,
  marketer: Marketer,
  input: { itemId: string; size: string; note: string },
): Promise<MerchRequest> {
  const tools = await readTools(db);
  const item = tools.merch.find((m) => m.id === input.itemId && !m.hidden);
  if (!item) throw new NotFoundError(`merch ${input.itemId}`);
  const grade = tools.grades.find((g) => g.id === item.gradeId);
  const reached = gradeFor(tools.grades, await approvedDealCount(db, marketer.id));
  if (!gradeAllows(tools.grades, reached?.id ?? null, item.gradeId)) {
    throw new BadRequestError("itemId", [
      { path: "itemId", message: `This is for ${grade?.name ?? "a higher"} grade partners.` },
    ]);
  }
  if (item.stock !== null && item.stock <= 0) {
    throw new BadRequestError("itemId", [{ path: "itemId", message: "This item is out of stock." }]);
  }
  if (item.sizes.length > 0 && !item.sizes.includes(input.size)) {
    throw new BadRequestError("size", [{ path: "size", message: "Pick a size." }]);
  }
  const open = await requests(db).findOne({ marketerId: marketer.id, itemId: item.id, status: "requested" });
  if (open) {
    throw new BadRequestError("itemId", [
      { path: "itemId", message: "You have already asked for this. We will let you know when it is on its way." },
    ]);
  }

  const now = Date.now();
  const doc: RequestDoc = {
    _id: newId("mreq"),
    marketerId: marketer.id,
    marketerName: marketer.displayName,
    marketerCode: marketer.code,
    marketerPhone: marketer.phone,
    itemId: item.id,
    itemName: item.name,
    gradeName: grade?.name ?? "",
    size: item.sizes.length > 0 ? input.size : "",
    note: input.note,
    status: "requested",
    createdAt: now,
    updatedAt: now,
    handledByName: "",
  };
  await requests(db).insertOne(doc);
  return toRequest(doc);
}

export async function listMerchRequests(db: Db): Promise<MerchRequest[]> {
  const rows = await requests(db).find({}).sort({ createdAt: -1 }).limit(300).toArray();
  return rows.map(toRequest);
}

/** Marking a request sent takes one off the item's stock, when it keeps a count. */
export async function settleMerchRequest(
  db: Db,
  id: string,
  status: Exclude<MerchRequestStatus, "requested">,
  byName: string,
): Promise<MerchRequest> {
  const updated = await requests(db).findOneAndUpdate(
    { _id: id, status: "requested" },
    { $set: { status, handledByName: byName, updatedAt: Date.now() } },
    { returnDocument: "after" },
  );
  if (!updated) {
    const exists = await requests(db).findOne({ _id: id });
    if (!exists) throw new NotFoundError(`merch request ${id}`);
    throw new BadRequestError("status", [{ path: "status", message: "This request has already been handled." }]);
  }
  if (status === "sent") {
    const tools = await readTools(db);
    const item = tools.merch.find((m) => m.id === updated.itemId);
    if (item && item.stock !== null) {
      await writeToolList(
        db,
        "merch",
        tools.merch.map((m) => (m.id === item.id ? { ...m, stock: Math.max(0, (m.stock ?? 0) - 1) } : m)),
      );
    }
  }
  return toRequest(updated);
}

/* ─────────────────────────────── http ─────────────────────────────── */

const title = str().trim().min(1).max(TOOL_TITLE_MAX);
const summary = str().trim().max(TOOL_SUMMARY_MAX).default("");
const url = str().trim().max(TOOL_URL_MAX).default("");
const itemId = str().trim().min(1).max(80);

const LIST_SCHEMAS = {
  guides: z.array(
    z
      .object({
        id: itemId,
        kind: z.enum(GUIDE_KINDS),
        title,
        summary,
        body: str().trim().max(TOOL_BODY_MAX).default(""),
        url,
        hidden: z.boolean().default(false),
      })
      .strict(),
  ),
  trainings: z.array(
    z
      .object({
        id: itemId,
        title,
        summary,
        url,
        minutes: z.number().int().min(0).max(600).default(0),
        liveAt: z.number().int().positive().nullable().default(null),
        hidden: z.boolean().default(false),
      })
      .strict(),
  ),
  grades: z.array(
    z
      .object({
        id: itemId,
        name: str().trim().min(1).max(60),
        includes: summary,
        minDeals: z.number().int().min(0).max(10_000),
      })
      .strict(),
  ),
  merch: z.array(
    z
      .object({
        id: itemId,
        name: title,
        summary,
        imageUrl: url,
        gradeId: itemId,
        priceMinor: z.number().int().min(0).max(1_000_000_000_00).default(0),
        sizes: z.array(str().trim().min(1).max(20)).max(12).default([]),
        stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
        hidden: z.boolean().default(false),
      })
      .strict(),
  ),
} as const;

function checkList(list: ToolList, items: { id: string }[], tools: MarketingTools) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new BadRequestError("items", [{ path: "items", message: "Two items share an id." }]);
    ids.add(item.id);
  }
  if (list === "guides") {
    for (const guide of items as MarketingTools["guides"]) {
      if (guide.kind === "article" ? guide.body === "" : guide.url === "") {
        throw new BadRequestError("items", [
          { path: "items", message: `"${guide.title}" needs ${guide.kind === "article" ? "some text" : "a link"}.` },
        ]);
      }
    }
  }
  if (list === "merch") {
    const grades = new Set(tools.grades.map((g) => g.id));
    for (const item of items as MarketingTools["merch"]) {
      if (!grades.has(item.gradeId)) {
        throw new BadRequestError("items", [{ path: "items", message: `"${item.name}" needs a grade that exists.` }]);
      }
    }
  }
  if (list === "grades") {
    if (items.length === 0) {
      throw new BadRequestError("items", [{ path: "items", message: "Keep at least one grade." }]);
    }
    const used = tools.merch.find((m) => !ids.has(m.gradeId));
    if (used) {
      throw new BadRequestError("items", [
        { path: "items", message: `"${used.name}" is in a grade you removed. Move it to another grade first.` },
      ]);
    }
  }
}

export function toolsAdminRoutes(deps: {
  tell?: (db: Db, userIds: string[], message: PushMessage) => Promise<void>;
} = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/marketing/tools", requireAuth(), async (c) => {
    return c.json(await readTools(await currentDb(c)));
  });

  routes.put("/admin/marketing/tools/:list", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const list = pathParam(c, "list");
    if (!(TOOL_LISTS as readonly string[]).includes(list)) throw new NotFoundError(`tool list ${list}`);
    const key = list as ToolList;
    const body = await readJson(
      c,
      z.object({ items: (LIST_SCHEMAS[key] as z.ZodArray<z.ZodTypeAny>).max(TOOL_LIST_MAX) }).strict(),
    );
    const before = await readTools(db);
    checkList(key, body.items as { id: string }[], before);
    auditBefore(c, { [key]: before[key] });
    return c.json(await writeToolList(db, key, body.items as MarketingTools[typeof key]));
  });

  routes.get("/admin/marketing/merch-requests", requireAuth(), async (c) => {
    return c.json({ items: await listMerchRequests(await currentDb(c)) });
  });

  routes.patch("/admin/marketing/merch-requests/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, z.object({ status: z.enum(MERCH_REQUEST_STATUSES).exclude(["requested"]) }).strict());
    const settled = await settleMerchRequest(db, pathParam(c, "id"), body.status, currentUser(c).displayName);
    const userId = (await findMarketerById(db, settled.marketerId))?.userId;
    if (deps.tell && userId) {
      await deps
        .tell(db, [userId], {
          kind: "update",
          title: settled.status === "sent" ? "Your merch is on its way" : "About your merch request",
          body:
            settled.status === "sent"
              ? `${settled.itemName} has been sent. Thank you for selling with AV Homes.`
              : `We could not send ${settled.itemName} this time. Call the office to find out why.`,
          url: "/m/tools?tab=merch",
          tag: `merch-${settled.id}`,
        })
        .catch(() => {});
    }
    return c.json(settled);
  });

  return routes;
}

export function toolsAppRoutes(currentMarketer: (db: Db, c: Parameters<typeof currentUser>[0]) => Promise<Marketer>): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/marketing/tools", requireAuth(), async (c) => {
    const db = await currentDb(c);
    return c.json(await partnerTools(db, await currentMarketer(db, c)));
  });

  routes.post("/marketing/merch-requests", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    const body = await readJson(
      c,
      z
        .object({
          itemId,
          size: str().trim().max(20).default(""),
          note: str().trim().max(300).default(""),
        })
        .strict(),
    );
    return c.json(await requestMerch(db, marketer, body), 201);
  });

  return routes;
}
