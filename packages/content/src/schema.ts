import type {
  Category,
  CoverImage,
  DocNode,
  Post,
  PostStatus,
  PublicPost,
  PublicPostDetail,
  ReadingTemplate,
} from "@avhomes/contracts";

export interface PostDoc {
  _id: string;
  slug: string | null;
  title: string;
  subtitle: string;
  excerpt: string;
  /** "derived" means re-derive on every save; "author" means leave it alone. */
  excerptSource: "derived" | "author";
  content: DocNode;
  /**
   * Derived on write, stored, and NEVER returned on the wire. It exists for the
   * text index and the word count, both of which are server concerns.
   */
  contentText: string;
  coverImage: CoverImage | null;
  category: string;
  tags: string[];
  /** Null means "no opinion, follow the site default", which is not the same as
   *  deliberately choosing the default. Only the first should move when the
   *  default changes. */
  template: ReadingTemplate | null;
  status: PostStatus;
  wordCount: number;
  readingTime: number;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  deletedAt: number | null;
  revision: number;
}

export interface PostRevisionDoc {
  _id: string;
  postId: string;
  revision: number;
  kind: "autosave" | "manual" | "publish" | "status";
  snapshot: Pick<PostDoc, "title" | "subtitle" | "excerpt" | "content" | "coverImage" | "tags" | "category">;
  note: string | null;
  authorId: string;
  createdAt: number;
}

export interface CategoryDoc {
  _id: string;
  slug: string;
  name: string;
  blurb: string;
  accent: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** The public projection. `contentText` and `status` never appear in it. */
export function toPublicPost(doc: PostDoc, authorName: string): PublicPost {
  return {
    id: doc._id,
    slug: doc.slug ?? doc._id,
    title: doc.title,
    subtitle: doc.subtitle,
    excerpt: doc.excerpt,
    coverImage: doc.coverImage,
    category: doc.category,
    tags: doc.tags,
    template: doc.template,
    // A published post always has this. The fallback keeps a malformed row from
    // rendering as 1970 rather than crashing the page.
    publishedAt: doc.publishedAt ?? doc.createdAt,
    updatedAt: doc.updatedAt,
    wordCount: doc.wordCount,
    readingTime: doc.readingTime,
    author: { name: authorName },
  };
}

export function toPublicPostDetail(doc: PostDoc, authorName: string): PublicPostDetail {
  return { ...toPublicPost(doc, authorName), content: doc.content };
}

/** The admin projection. Carries drafts, ownership and the CAS token. */
export function toPost(doc: PostDoc, authorName: string): Post {
  return {
    ...toPublicPost(doc, authorName),
    status: doc.status,
    content: doc.content,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    deletedAt: doc.deletedAt,
    authorId: doc.authorId,
    revision: doc.revision,
  };
}

export function toCategory(doc: CategoryDoc): Category {
  return {
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    blurb: doc.blurb,
    accent: doc.accent,
    position: doc.position,
  };
}

export const POST_SORTS = {
  newest: { field: "publishedAt", direction: -1 },
  updated: { field: "updatedAt", direction: -1 },
} as const;

export type PostSort = keyof typeof POST_SORTS;
export const POST_SORT_NAMES = Object.keys(POST_SORTS) as [PostSort, ...PostSort[]];
