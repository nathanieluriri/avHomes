/**
 * @avhomes/listings
 *
 * Properties, testimonials and the site counters. It may not import
 * @avhomes/content, @avhomes/media or @avhomes/enquiries. Any crossing goes
 * through a port injected at @avhomes/api.
 */
export { listingsPublicRoutes } from "./routes/public";
export { listingsAdminRoutes } from "./routes/admin";
export { authorize, assertAuthorized, type Action } from "./authorize";
export {
  listProperties,
  countProperties,
  getPropertyById,
  getPropertyBySlug,
  getSimilarProperties,
  listTestimonials,
  listSiteStats,
  LISTING_KINDS,
  type ListingKind,
  type ListQuery,
  type PropertyPatch,
  type LifecycleOp,
} from "./repo";
export {
  PROPERTY_SORTS,
  PROPERTY_SORT_NAMES,
  toProperty,
  type PropertyDoc,
  type PropertySort,
  type TestimonialDoc,
  type SiteStatDoc,
} from "./schema";
