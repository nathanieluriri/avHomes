import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  assertCursorSort,
  clampLimit,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  readJsonOrEmpty,
  readQuery,
  slugString,
  str,
  type AppEnv,
} from "@avhomes/core";
import {
  POST_STATUSES,
  READING_TEMPLATES,
  isAdminRole,
  validateDoc,
  type Category,
} from "@avhomes/contracts";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { ForbiddenError } from "@avhomes/core";
import {
  createPost,
  deleteCategory,
  getPostById,
  getPublicPostBySlug,
  listAdminPosts,
  listCategories,
  listPublicPosts,
  listRevisions,
  restoreRevision,
  savePost,
  transitionPost,
  trashPost,
  upsertCategory,
  type PostLifecycleOp,
  type PostPatch,
} from "./repo";
import { POST_SORT_NAMES } from "./schema";

const LIST_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const DETAIL_CACHE = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

const PublicListQuery = z
  .object({
    limit: str().optional(),
    cursor: str().max(600).optional(),
    category: str().max(120).optional(),
    tag: str().max(120).optional(),
    q: str().max(200).optional(),
  })
  .strict();

/**
 * The public reading API.
 *
 * Mounted above sessionMiddleware, like the listing reads, so it is cookieless
 * by construction rather than by review.
 */
export function contentPublicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/public/posts", async (c) => {
    const q = readQuery(c, PublicListQuery);
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, "newest");

    const page = await listPublicPosts(await currentDb(c), {
      sort: "newest",
      limit,
      cursor: q.cursor,
      category: q.category,
      tag: q.tag,
      q: q.q,
    });
    c.header("cache-control", LIST_CACHE);
    return c.json(page);
  });

  routes.get("/public/posts/:slug", async (c) => {
    const slug = pathParam(c, "slug");
    const post = await getPublicPostBySlug(await currentDb(c), slug);
    // Absent and unpublished are ONE 404. Telling them apart would let anyone
    // enumerate which drafts exist by their eventual URL.
    if (!post) throw new NotFoundError(`post ${slug}`);
    c.header("cache-control", DETAIL_CACHE);
    return c.json({ post });
  });

  routes.get("/public/categories", async (c) => {
    c.header("cache-control", DETAIL_CACHE);
    return c.json({ items: await listCategories(await currentDb(c)) });
  });

  return routes;
}

/* ─────────────────────────────── admin ────────────────────────────────── */

const PatchBody = z
  .object({
    title: str().min(1).max(300),
    subtitle: str().max(400),
    excerpt: str().max(2000),
    // z.unknown() DELIBERATELY. validateDoc is the single authority on what a
    // document may contain; a second, weaker Zod copy would answer 400 where the
    // contract says 422, and would drift the first time a node type is added.
    content: z.unknown(),
    coverImage: z
      .object({
        url: str().max(2000),
        alt: str().max(500),
        focalPoint: str().max(40),
        width: z.number().int().min(0),
        height: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    category: str().max(120),
    tags: z.array(str().max(80)).max(30),
    template: z.enum(READING_TEMPLATES).nullable(),
  })
  .partial()
  .strict();

const SaveBody = z
  .object({
    patch: PatchBody,
    baseRevision: z.number().int().min(0),
    kind: z.enum(["autosave", "manual", "publish"]).default("manual"),
    note: str().max(300).nullable().default(null),
  })
  .strict();

const AdminListQuery = z
  .object({
    sort: z.enum(POST_SORT_NAMES).default("updated"),
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(POST_STATUSES).optional(),
    mine: z.enum(["1", "0"]).optional(),
    q: str().max(200).optional(),
  })
  .strict();

const CategoryBody = z
  .object({
    slug: slugString(),
    name: str().min(1).max(120),
    blurb: str().max(500).default(""),
    accent: str().max(20).default("#983c53"),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();

const LIFECYCLE_OPS: readonly PostLifecycleOp[] = ["publish", "unpublish", "archive", "restore"];

/** Author or admin, the same shape listings uses for its agents. */
function assertMayWrite(post: { authorId: string }, user: { id: string; role: Parameters<typeof isAdminRole>[0] }): void {
  if (post.authorId !== user.id && !isAdminRole(user.role)) {
    throw new ForbiddenError("this post was written by someone else");
  }
}

export function contentAdminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/posts", requireAuth(), async (c) => {
    const q = readQuery(c, AdminListQuery);
    const limit = clampLimit(q.limit);
    assertCursorSort(q.cursor, q.sort);

    const user = currentUser(c);
    const page = await listAdminPosts(await currentDb(c), {
      sort: q.sort,
      limit,
      cursor: q.cursor,
      status: q.status,
      authorId: q.mine === "1" ? user.id : undefined,
      q: q.q,
      includeHidden: true,
      // The console's box is a filter that narrows as a writer types, not the
      // site's whole-word search. See `substring` in the repo.
      substring: true,
    });
    return c.json(page);
  });

  routes.post("/admin/posts", requireAuth(), async (c) => {
    const { title } = await readJsonOrEmpty(
      c,
      z.object({ title: str().min(1).max(300).default("Untitled post") }).strict(),
    );
    const post = await createPost(await currentDb(c), currentUser(c).id, title);
    return c.json({ post }, 201);
  });

  routes.get("/admin/posts/:id", requireAuth(), async (c) => {
    const id = pathParam(c, "id");
    const post = await getPostById(await currentDb(c), id);
    if (!post) throw new NotFoundError(`post ${id}`);
    return c.json({ post });
  });

  routes.patch("/admin/posts/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, SaveBody);
    const user = currentUser(c);

    const current = await getPostById(db, id);
    if (!current) throw new NotFoundError(`post ${id}`);
    assertMayWrite(current, user);

    // The 422 comes from here, and only from here.
    const patch: PostPatch = { ...body.patch } as PostPatch;
    if (body.patch.content !== undefined) patch.content = validateDoc(body.patch.content);

    const post = await savePost(db, id, patch, body.baseRevision, body.kind, user.id, body.note);
    return c.json({ post });
  });

  routes.post("/admin/posts/:id/:op", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const op = pathParam(c, "op");
    if (!LIFECYCLE_OPS.includes(op as PostLifecycleOp)) {
      throw new BadRequestError("op", [
        { path: "op", message: `unknown operation, expected one of ${LIFECYCLE_OPS.join(", ")}` },
      ]);
    }
    const current = await getPostById(db, id);
    if (!current) throw new NotFoundError(`post ${id}`);
    assertMayWrite(current, currentUser(c));

    const post = await transitionPost(db, id, op as PostLifecycleOp, currentUser(c).id);
    return c.json({ post });
  });

  routes.delete("/admin/posts/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const { baseRevision } = readQuery(
      c,
      z.object({ baseRevision: z.coerce.number().int().min(0) }).strict(),
    );
    const current = await getPostById(db, id);
    if (!current) throw new NotFoundError(`post ${id}`);
    assertMayWrite(current, currentUser(c));
    const post = await trashPost(db, id, baseRevision);
    return c.json({ post });
  });

  routes.get("/admin/revisions/:postId", requireAuth(), async (c) => {
    const postId = pathParam(c, "postId");
    const items = await listRevisions(await currentDb(c), postId);
    return c.json({
      items: items.map((r) => ({
        id: r._id,
        revision: r.revision,
        kind: r.kind,
        note: r.note,
        authorId: r.authorId,
        createdAt: r.createdAt,
        // The title as it stood, so a writer choosing between two entries has
        // something to recognise other than a number and a timestamp.
        title: r.snapshot.title,
      })),
    });
  });

  /**
   * Puts a snapshot back, as a new revision rather than by rewinding.
   *
   * Author or admin, the same rule every other write on a post obeys. It is not
   * admin-only: restoring is less destructive than the ordinary save a writer
   * can already make, because the state it replaces is snapshotted first.
   */
  routes.post("/admin/revisions/:postId/:revisionId/restore", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const postId = pathParam(c, "postId");
    const revisionId = pathParam(c, "revisionId");

    const current = await getPostById(db, postId);
    if (!current) throw new NotFoundError(`post ${postId}`);
    assertMayWrite(current, currentUser(c));

    const post = await restoreRevision(db, postId, revisionId, currentUser(c).id);
    return c.json({ post });
  });

  routes.get("/admin/categories", requireAuth(), async (c) =>
    c.json({ items: await listCategories(await currentDb(c)) }),
  );

  routes.put("/admin/categories/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, CategoryBody);
    const category = await upsertCategory(
      await currentDb(c),
      id === "new" ? null : id,
      body as Omit<Category, "id">,
    );
    return c.json({ category });
  });

  routes.delete("/admin/categories/:id", requireAdmin(), async (c) => {
    const id = pathParam(c, "id");
    if (!(await deleteCategory(await currentDb(c), id))) throw new NotFoundError(`category ${id}`);
    return c.json({ ok: true });
  });

  return routes;
}
