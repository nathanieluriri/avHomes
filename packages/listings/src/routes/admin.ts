import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  PreconditionFailedError,
  assertCursorSort,
  clampLimit,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  readJsonOrEmpty,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type PropertyStatus,
  type SiteStat,
  type Testimonial,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { assertAuthorized } from "../authorize";
import {
  countProperties,
  createProperty,
  deleteSiteStat,
  deleteTestimonial,
  getPropertyById,
  listProperties,
  listSiteStats,
  listTestimonials,
  saveProperty,
  transitionProperty,
  trashProperty,
  upsertSiteStat,
  upsertTestimonial,
  type LifecycleOp,
} from "../repo";
import { PROPERTY_SORT_NAMES } from "../schema";

/**
 * `slug`, `status`, `publishedAt` and `revision` are ABSENT on purpose.
 *
 * The slug is server-authoritative and derived at publish; status moves only
 * through the lifecycle routes. The schema is `.strict()`, so a body carrying
 * one is REFUSED rather than accepted and discarded, which would otherwise leave
 * the caller believing it had set something it had not.
 */
const PatchBody = z
  .object({
    title: str().min(1).max(300),
    tagline: str().max(300),
    description: str().max(20_000),
    priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: str().length(3).toUpperCase(),
    type: z.enum(PROPERTY_TYPES),
    location: str().max(200),
    city: str().max(120),
    address: str().max(300),
    bedrooms: z.number().int().min(0).max(100),
    bathrooms: z.number().int().min(0).max(100),
    areaSqft: z.number().int().min(0).max(10_000_000),
    parkingSpaces: z.number().int().min(0).max(100),
    yearBuilt: z.number().int().min(1800).max(2200),
    featured: z.boolean(),
    amenities: z.array(str().max(120)).max(60),
    images: z.array(str().max(2000)).max(40),
    agent: z
      .object({
        id: str().max(120),
        name: str().max(200),
        role: str().max(120),
        phone: str().max(60),
        email: str().max(320),
        avatarUrl: str().max(2000),
      })
      .strict(),
    agentUserId: str().max(120).nullable(),
  })
  .partial()
  .strict();

const SaveBody = z
  .object({
    patch: PatchBody,
    /** The CAS token the form was loaded with. Absent is a 400, never a blind write. */
    baseRevision: z.number().int().min(0),
  })
  .strict();

const CreateBody = z.object({ title: str().min(1).max(300).default("Untitled listing") }).strict();

const AdminListQuery = z
  .object({
    sort: z.enum(PROPERTY_SORT_NAMES).default("updated"),
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(PROPERTY_STATUSES).optional(),
    mine: z.enum(["1", "0"]).optional(),
    q: str().max(200).optional(),
    withTotal: z.enum(["1", "0"]).optional(),
  })
  .strict();

/** Which lifecycle ops carry a listing from one status to the next. */
const TRANSITIONS: Record<LifecycleOp, PropertyStatus> = {
  publish: "for-sale",
  unpublish: "draft",
  archive: "archived",
  unarchive: "draft",
  restore: "draft",
};

const TestimonialBody = z
  .object({
    name: str().min(1).max(200),
    role: str().max(200).default(""),
    quote: str().min(1).max(2000),
    rating: z.number().int().min(1).max(5),
    initials: str().max(4).default(""),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();

const StatBody = z
  .object({
    value: z.number().int().min(0),
    label: str().min(1).max(120),
    suffix: str().max(12).optional(),
    prefix: str().max(12).optional(),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export function listingsAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/properties", requireAuth(), async (c) => {
    const q = readQuery(c, AdminListQuery);
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, q.sort);

    const db = await currentDb(c);
    const user = currentUser(c);
    const query = {
      sort: q.sort,
      limit,
      cursor: q.cursor,
      status: q.status,
      q: q.q,
      agentUserId: q.mine === "1" ? user.id : undefined,
      includeHidden: true,
    };
    const page = await listProperties(db, query);
    // Only when asked. Paging deliberately avoids the count, and a screen that
    // wants a total is asking the server to pay for one on purpose.
    const total = q.withTotal === "1" ? await countProperties(db, query) : undefined;
    return c.json(total === undefined ? page : { ...page, total });
  });

  routes.post("/admin/properties", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const { title } = await readJsonOrEmpty(c, CreateBody);
    const property = await createProperty(db, {
      title,
      agentUserId: user.id,
      // Seeded from the creating account so a new listing is never agent-less on
      // screen. Every field stays editable afterwards.
      agent: {
        id: user.id,
        name: user.displayName,
        role: "Sales agent",
        phone: "",
        email: user.email,
        avatarUrl: "",
      },
    });
    return c.json({ property }, 201);
  });

  routes.get("/admin/properties/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const property = await getPropertyById(await currentDb(c), id);
    if (!property) throw new NotFoundError(`property ${id}`);
    return c.json({ property });
  });

  /** Read first, then authorize, then act. An absent id is a 404 before a 403. */
  routes.patch("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, SaveBody);

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    assertAuthorized(current, currentUser(c), "write");

    const property = await saveProperty(db, id, body.patch, body.baseRevision);
    // Every mutation answers with the entity, so the client adopts the bumped
    // revision without a second request.
    return c.json({ property });
  });

  routes.post("/admin/properties/:id/:op", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const op = pathParam(c, "op");
    if (!(op in TRANSITIONS)) {
      throw new BadRequestError("op", [
        { path: "op", message: `unknown operation, expected one of ${Object.keys(TRANSITIONS).join(", ")}` },
      ]);
    }
    const operation = op as LifecycleOp;

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    assertAuthorized(current, currentUser(c), "write");

    // Refusals name the operation, so a screen can say what is wrong rather than
    // printing a status code.
    if (operation === "restore" && current.deletedAt === null) {
      throw new PreconditionFailedError("not_in_trash", {
        propertyId: id,
        detail: "This listing is not in the trash.",
      });
    }
    if (operation === "publish" && current.title.trim() === "") {
      throw new PreconditionFailedError("no_title", {
        propertyId: id,
        detail: "Give the listing a title before publishing. The slug is derived from it.",
      });
    }

    const property = await transitionProperty(db, id, operation, TRANSITIONS[operation]);
    return c.json({ property });
  });

  /** SOFT delete. There is no hard-delete route, on purpose. */
  routes.delete("/admin/properties/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const base = readQuery(c, z.object({ baseRevision: z.coerce.number().int().min(0) }).strict());

    const current = await getPropertyById(db, id);
    if (!current) throw new NotFoundError(`property ${id}`);
    assertAuthorized(current, currentUser(c), "write");

    const property = await trashProperty(db, id, base.baseRevision);
    return c.json({ property });
  });

  /* ────────────────────── testimonials and counters ─────────────────── */

  routes.get("/admin/testimonials", requireAuth(), async (c) =>
    c.json({ items: await listTestimonials(await currentDb(c)) }),
  );

  routes.put("/admin/testimonials/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, TestimonialBody);
    const item = await upsertTestimonial(await currentDb(c), id === "new" ? null : id, body as Omit<Testimonial, "id">);
    return c.json({ testimonial: item });
  });

  routes.delete("/admin/testimonials/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    if (!(await deleteTestimonial(await currentDb(c), id))) throw new NotFoundError(id);
    return c.json({ ok: true });
  });

  routes.get("/admin/stats", requireAuth(), async (c) =>
    c.json({ items: await listSiteStats(await currentDb(c)) }),
  );

  routes.put("/admin/stats/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, StatBody);
    const item = await upsertSiteStat(await currentDb(c), id === "new" ? null : id, body as Omit<SiteStat, "id">);
    return c.json({ stat: item });
  });

  routes.delete("/admin/stats/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    if (!(await deleteSiteStat(await currentDb(c), id))) throw new NotFoundError(id);
    return c.json({ ok: true });
  });

  return routes;
}
