/**
 * The blog's types now live in @avhomes/contracts, alongside every other domain
 * type the browser and the API both compile.
 *
 * This file stays as a re-export so the reader components keep their imports and
 * so there is never a second, drifting definition of a post in the tree.
 */
export type {
  CoverImage as PublicCoverImage,
  DocNode,
  PublicPost,
  PublicPostDetail,
  PublicPostList,
  ReadingTemplate,
} from "@avhomes/contracts";
