/**
 * The site's domain types now live in @avhomes/contracts, which is the one
 * package both the browser bundle and the API compile.
 *
 * This file stays as a re-export so existing imports keep working and so there
 * is never a second, drifting definition of Property in the tree.
 */
export type {
  Agent,
  AuditEntity,
  AuditEntry,
  Category,
  CoverImage,
  DocNode,
  Enquiry,
  EnquiryStatus,
  FeeKind,
  ImageRecord,
  ListingFee,
  ListingType,
  Page,
  Post,
  PostStatus,
  PriceChange,
  Property,
  PropertyStatus,
  PropertyType,
  PublicPost,
  PublicPostDetail,
  PublicPostList,
  ReadingTemplate,
  RentPeriod,
  SiteStat,
  Testimonial,
} from "@avhomes/contracts";

export {
  AUDIT_ENTITIES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PUBLIC_PROPERTY_STATUSES,
  RECURRING_FEE_KINDS,
  POST_STATUSES,
  READING_TEMPLATES,
  ENQUIRY_STATUSES,
} from "@avhomes/contracts";
