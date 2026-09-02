/**
 * The site's domain types now live in @avhomes/contracts, which is the one
 * package both the browser bundle and the API compile.
 *
 * This file stays as a re-export so existing imports keep working and so there
 * is never a second, drifting definition of Property in the tree.
 */
export type {
  Agent,
  Category,
  CoverImage,
  DocNode,
  Enquiry,
  EnquiryStatus,
  ImageRecord,
  Page,
  Post,
  PostStatus,
  Property,
  PropertyStatus,
  PropertyType,
  PublicPost,
  PublicPostDetail,
  PublicPostList,
  ReadingTemplate,
  SiteStat,
  Testimonial,
} from "@avhomes/contracts";

export {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PUBLIC_PROPERTY_STATUSES,
  POST_STATUSES,
  READING_TEMPLATES,
  ENQUIRY_STATUSES,
} from "@avhomes/contracts";
