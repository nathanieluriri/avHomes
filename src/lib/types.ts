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
  BuildStage,
  Category,
  CoverImage,
  DocNode,
  Enquiry,
  EnquiryStatus,
  EstatePrototype,
  EstateSummary,
  FeeKind,
  Furnishing,
  ImageRecord,
  ListingFee,
  ListingType,
  Page,
  PaymentPlan,
  Post,
  PostStatus,
  PriceChange,
  Property,
  PropertyStatus,
  PropertyType,
  PrototypeKind,
  PublicPost,
  PublicPostDetail,
  PublicPostList,
  ReadingTemplate,
  RentPeriod,
  SiteStat,
  Testimonial,
  TitleDocument,
} from "@avhomes/contracts";

export {
  AUDIT_ENTITIES,
  ESTATE_TYPE,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PUBLIC_PROPERTY_STATUSES,
  RECURRING_FEE_KINDS,
  POST_STATUSES,
  READING_TEMPLATES,
  ENQUIRY_STATUSES,
} from "@avhomes/contracts";
