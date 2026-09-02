import type { Filter } from "mongodb";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  DuplicateError,
  NotFoundError,
  PreconditionFailedError,
  StaleWriteError,
  disambiguateSlug,
  keysetFilter,
  keysetSort,
  newId,
  slugify,
  takePage,
} from "@avhomes/core";
import {
  docToText,
  emptyDoc,
  readingMinutes,
  summarise,
  wordCount,
  type Category,
  type Page,
  type Post,
  type PostStatus,
  type PublicPost,
  type PublicPostDetail,
} from "@avhomes/contracts";
import {
  POST_SORTS,
  toCategory,
  toPost,
  toPublicPost,
  toPublicPostDetail,
  type CategoryDoc,
  type PostDoc,
  type PostRevisionDoc,
  type PostSort,
} from "./schema";

function posts(db: Db) {
  return collection<PostDoc>(db, COLLECTIONS.posts);
}

/**
 * Author names are resolved through a live lookup, never denormalised onto the
 * post.
 *
 * A renamed writer is then correct on every post, every list and every feed as
 * soon as the update commits. Denormalising would owe a backfill to the profile
 * route, and that backfill is the one nobody remembers to write.
 */
async function authorNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await collection<{ _id: string; displayName: string }>(db, COLLECTIONS.users)
    .find({ _id: { $in: [...new Set(ids)] } }, { projection: { _id: 1, displayName: 1 } })
    .toArray();
  return new Map(rows.map((r) => [r._id, r.displayName]));
}

const UNKNOWN_AUTHOR = "AVHomes";

export interface PostListQuery {
  sort: PostSort;
  limit: number;
  cursor?: string | undefined;
  status?: PostStatus | undefined;
  category?: string | undefined;
  tag?: string | undefined;
  authorId?: string | undefined;
  q?: string | undefined;
  includeHidden?: boolean;
}

function buildFilter(query: PostListQuery): Filter<PostDoc> {
  const and: Filter<PostDoc>[] = [];
  if (query.includeHidden) {
    if (query.status) and.push({ status: query.status });
  } else {
    and.push({ status: "published", deletedAt: null, publishedAt: { $ne: null } });
  }
  if (query.category) and.push({ category: query.category });
  if (query.tag) and.push({ tags: query.tag });
  if (query.authorId) and.push({ authorId: query.authorId });
  if (query.q) and.push({ $text: { $search: query.q } } as Filter<PostDoc>);

  const keyset = keysetFilter<PostDoc>(POST_SORTS[query.sort], query.cursor, query.sort);
  if (Object.keys(keyset).length > 0) and.push(keyset);
  return and.length === 0 ? {} : { $and: and };
}

export async function listPublicPosts(db: Db, query: PostListQuery): Promise<Page<PublicPost>> {
  const spec = POST_SORTS[query.sort];
  const docs = await posts(db)
    .find(buildFilter({ ...query, includeHidden: false }), {
      // The list carries no document body: it is the largest field on the row
      // and no card renders it.
      projection: { content: 0, contentText: 0 },
      sort: query.q ? { score: { $meta: "textScore" } } : keysetSort(spec),
      limit: query.limit + 1,
    })
    .toArray();

  const { items, nextCursor } = takePage(docs, query.limit, spec, query.sort);
  const names = await authorNames(db, items.map((d) => d.authorId));
  return {
    items: items.map((d) => toPublicPost(d, names.get(d.authorId) ?? UNKNOWN_AUTHOR)),
    nextCursor: query.q ? null : nextCursor,
  };
}

export async function getPublicPostBySlug(db: Db, slug: string): Promise<PublicPostDetail | null> {
  const doc = await posts(db).findOne({
    slug,
    status: "published",
    deletedAt: null,
  });
  if (!doc) return null;
  const names = await authorNames(db, [doc.authorId]);
  return toPublicPostDetail(doc, names.get(doc.authorId) ?? UNKNOWN_AUTHOR);
}

export async function listAdminPosts(db: Db, query: PostListQuery): Promise<Page<Post>> {
  const spec = POST_SORTS[query.sort];
  const docs = await posts(db)
    .find(buildFilter({ ...query, includeHidden: true }), {
      projection: { content: 0, contentText: 0 },
      sort: query.q ? { score: { $meta: "textScore" } } : keysetSort(spec),
      limit: query.limit + 1,
    })
    .toArray();
  const { items, nextCursor } = takePage(docs, query.limit, spec, query.sort);
  const names = await authorNames(db, items.map((d) => d.authorId));
  return {
    // A list projection has no content; the empty doc keeps the shape honest
    // rather than letting `undefined` reach a renderer.
    items: items.map((d) => toPost({ ...d, content: emptyDoc() }, names.get(d.authorId) ?? UNKNOWN_AUTHOR)),
    nextCursor: query.q ? null : nextCursor,
  };
}

export async function getPostById(db: Db, id: string): Promise<Post | null> {
  const doc = await posts(db).findOne({ _id: id });
  if (!doc) return null;
  const names = await authorNames(db, [doc.authorId]);
  return toPost(doc, names.get(doc.authorId) ?? UNKNOWN_AUTHOR);
}

/* ────────────────────────────── mutations ─────────────────────────────── */

export async function createPost(db: Db, authorId: string, title: string): Promise<Post> {
  const now = Date.now();
  // The DEFAULT the application actually writes: a doc with one empty paragraph.
  // An empty content array is invalid under ProseMirror and locks the editor.
  const content = emptyDoc();
  const doc: PostDoc = {
    _id: newId("post", now),
    slug: null,
    title,
    subtitle: "",
    excerpt: "",
    excerptSource: "derived",
    content,
    contentText: "",
    coverImage: null,
    category: "Insights",
    tags: [],
    template: null,
    status: "draft",
    wordCount: 0,
    readingTime: 1,
    authorId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    deletedAt: null,
    revision: 1,
  };
  await posts(db).insertOne(doc);
  return toPost(doc, UNKNOWN_AUTHOR);
}

export type PostPatch = Partial<
  Pick<PostDoc, "title" | "subtitle" | "excerpt" | "content" | "coverImage" | "category" | "tags" | "template">
>;

/**
 * Saves a patch under a CAS, re-deriving everything that is derived.
 *
 * `contentText`, `wordCount`, `readingTime` and a derived excerpt are computed
 * HERE rather than trusted from the request, because they are the fields a
 * client has no authority over and every one of them would otherwise be a way to
 * lie to the search index.
 */
export async function savePost(
  db: Db,
  id: string,
  patch: PostPatch,
  baseRevision: number,
  kind: PostRevisionDoc["kind"],
  actorId: string,
  note: string | null,
): Promise<Post> {
  const now = Date.now();
  const current = await posts(db).findOne({ _id: id });
  if (!current || current.deletedAt !== null) throw new NotFoundError(`post ${id}`);

  const merged = { ...current, ...patch };
  const text = docToText(merged.content);
  const words = wordCount(text);

  const set: Partial<PostDoc> = {
    ...patch,
    contentText: text,
    wordCount: words,
    readingTime: readingMinutes(words),
    updatedAt: now,
  };

  // An author-written excerpt survives; a derived one is re-derived. The source
  // flag is what tells the two apart, and it moves only when the excerpt is
  // explicitly set.
  if (patch.excerpt !== undefined) {
    set.excerptSource = patch.excerpt.trim() === "" ? "derived" : "author";
  }
  if ((set.excerptSource ?? current.excerptSource) === "derived") {
    set.excerpt = summarise(text, 200);
  }

  const after = await posts(db).findOneAndUpdate(
    { _id: id, revision: baseRevision, deletedAt: null },
    { $set: set, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (!after) {
    const reread = await posts(db).findOne({ _id: id });
    if (!reread) throw new NotFoundError(`post ${id}`);
    const names = await authorNames(db, [reread.authorId]);
    throw new StaleWriteError(
      "post",
      baseRevision,
      reread.revision,
      toPost(reread, names.get(reread.authorId) ?? UNKNOWN_AUTHOR),
    );
  }

  await recordRevision(db, after, kind, actorId, note);
  const names = await authorNames(db, [after.authorId]);
  return toPost(after, names.get(after.authorId) ?? UNKNOWN_AUTHOR);
}

/**
 * Snapshots the post after a successful save.
 *
 * Written after the CAS rather than inside it, because a revision row for a save
 * that lost its race would be a history entry for something that never happened.
 * Autosaves are pruned; every other kind is kept.
 */
async function recordRevision(
  db: Db,
  doc: PostDoc,
  kind: PostRevisionDoc["kind"],
  authorId: string,
  note: string | null,
): Promise<void> {
  const now = Date.now();
  await collection<PostRevisionDoc>(db, COLLECTIONS.postRevisions).insertOne({
    _id: newId("rev", now),
    postId: doc._id,
    revision: doc.revision,
    kind,
    snapshot: {
      title: doc.title,
      subtitle: doc.subtitle,
      excerpt: doc.excerpt,
      content: doc.content,
      coverImage: doc.coverImage,
      tags: doc.tags,
      category: doc.category,
    },
    note,
    authorId,
    createdAt: now,
  });

  if (kind === "autosave") {
    // Keep the twenty most recent autosaves per post. Unbounded history of
    // keystrokes is the largest collection in a blog nobody reads twice.
    const stale = await collection<PostRevisionDoc>(db, COLLECTIONS.postRevisions)
      .find({ postId: doc._id, kind: "autosave" }, { projection: { _id: 1 }, sort: { createdAt: -1 }, skip: 20 })
      .toArray();
    if (stale.length > 0) {
      await collection<PostRevisionDoc>(db, COLLECTIONS.postRevisions).deleteMany({
        _id: { $in: stale.map((r) => r._id) },
      });
    }
  }
}

export async function listRevisions(db: Db, postId: string, limit = 50): Promise<PostRevisionDoc[]> {
  return collection<PostRevisionDoc>(db, COLLECTIONS.postRevisions)
    .find({ postId }, { sort: { createdAt: -1 }, limit })
    .toArray();
}

/**
 * Puts a stored snapshot back, as a NEW revision rather than by rewinding.
 *
 * Nothing is destroyed: restoring writes the old content forward, so the state
 * it replaced is itself snapshotted first and appears in the list one row above.
 * A restore is therefore undoable by restoring what is now the previous entry,
 * which is the property that makes the button safe to press when you are not
 * sure.
 *
 * `status`, `slug` and `publishedAt` are NOT part of a snapshot and are not
 * touched here. Restoring the words a post used to say must not also unpublish
 * it, and a slug change would break every link that already points at it.
 */
export async function restoreRevision(
  db: Db,
  postId: string,
  revisionId: string,
  actorId: string,
): Promise<Post> {
  const revision = await collection<PostRevisionDoc>(db, COLLECTIONS.postRevisions).findOne({
    _id: revisionId,
    // Scoped by post, so a revision id from another post is a 404 rather than a
    // way to graft one post's body onto another.
    postId,
  });
  if (!revision) throw new NotFoundError(`revision ${revisionId}`);

  const current = await posts(db).findOne({ _id: postId });
  if (!current || current.deletedAt !== null) throw new NotFoundError(`post ${postId}`);

  const snapshot = revision.snapshot;
  return savePost(
    db,
    postId,
    {
      title: snapshot.title,
      subtitle: snapshot.subtitle,
      excerpt: snapshot.excerpt,
      content: snapshot.content,
      coverImage: snapshot.coverImage,
      tags: snapshot.tags,
      category: snapshot.category,
    },
    current.revision,
    "manual",
    actorId,
    `restored r${revision.revision}`,
  );
}

export type PostLifecycleOp = "publish" | "unpublish" | "archive" | "restore";

export async function transitionPost(
  db: Db,
  id: string,
  op: PostLifecycleOp,
  actorId: string,
): Promise<Post> {
  const now = Date.now();
  const current = await posts(db).findOne({ _id: id });
  if (!current) throw new NotFoundError(`post ${id}`);

  const status: PostStatus =
    op === "publish" ? "published" : op === "archive" ? "archived" : "draft";

  const set: Partial<PostDoc> = { status, updatedAt: now };
  if (op === "publish") {
    set.publishedAt = current.publishedAt ?? now;
    if (current.slug === null) set.slug = await claimSlug(db, current.title, id);
  }
  if (op === "restore") set.deletedAt = null;

  const after = await posts(db).findOneAndUpdate(
    { _id: id, revision: current.revision },
    { $set: set, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (!after) {
    const reread = await posts(db).findOne({ _id: id });
    if (!reread) throw new NotFoundError(`post ${id}`);
    const names = await authorNames(db, [reread.authorId]);
    throw new StaleWriteError(
      "post",
      current.revision,
      reread.revision,
      toPost(reread, names.get(reread.authorId) ?? UNKNOWN_AUTHOR),
    );
  }
  await recordRevision(db, after, "status", actorId, op);
  const names = await authorNames(db, [after.authorId]);
  return toPost(after, names.get(after.authorId) ?? UNKNOWN_AUTHOR);
}

async function claimSlug(db: Db, title: string, id: string): Promise<string | null> {
  const base = slugify(title);
  if (!base) return null;
  for (let candidate = base, attempt = 0; attempt < 5; attempt++) {
    const taken = await posts(db).findOne({ slug: candidate, _id: { $ne: id } }, { projection: { _id: 1 } });
    if (!taken) return candidate;
    candidate = disambiguateSlug(base);
  }
  throw new DuplicateError("slug", base);
}

export async function trashPost(db: Db, id: string, baseRevision: number): Promise<Post> {
  const now = Date.now();
  const after = await posts(db).findOneAndUpdate(
    { _id: id, revision: baseRevision },
    { $set: { deletedAt: now, status: "archived", updatedAt: now }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );
  if (!after) {
    const reread = await posts(db).findOne({ _id: id });
    if (!reread) throw new NotFoundError(`post ${id}`);
    const names = await authorNames(db, [reread.authorId]);
    throw new StaleWriteError("post", baseRevision, reread.revision, toPost(reread, names.get(reread.authorId) ?? UNKNOWN_AUTHOR));
  }
  const names = await authorNames(db, [after.authorId]);
  return toPost(after, names.get(after.authorId) ?? UNKNOWN_AUTHOR);
}

/* ───────────────────────────── categories ─────────────────────────────── */

export async function listCategories(db: Db): Promise<Category[]> {
  const docs = await collection<CategoryDoc>(db, COLLECTIONS.categories)
    .find({}, { sort: { position: 1 } })
    .toArray();
  return docs.map(toCategory);
}

export async function upsertCategory(
  db: Db,
  id: string | null,
  body: Omit<Category, "id">,
): Promise<Category> {
  const now = Date.now();
  const _id = id ?? newId("cat", now);
  try {
    await collection<CategoryDoc>(db, COLLECTIONS.categories).updateOne(
      { _id },
      { $set: { ...body, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      throw new DuplicateError("slug", body.slug);
    }
    throw err;
  }
  return { id: _id, ...body };
}

export async function deleteCategory(db: Db, id: string): Promise<boolean> {
  const category = await collection<CategoryDoc>(db, COLLECTIONS.categories).findOne({ _id: id });
  if (!category) return false;
  // A category still naming posts is a refusal, not a cascade. Silently
  // orphaning them is the version of this that loses work.
  const inUse = await posts(db).countDocuments({ category: category.name });
  if (inUse > 0) {
    throw new PreconditionFailedError("category_in_use", {
      categoryId: id,
      postCount: inUse,
      detail: `${inUse} post${inUse === 1 ? "" : "s"} still use this category. Move them first.`,
    });
  }
  const result = await collection<CategoryDoc>(db, COLLECTIONS.categories).deleteOne({ _id: id });
  return result.deletedCount === 1;
}
