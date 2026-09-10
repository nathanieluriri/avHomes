import {
  normalizeFees,
  readRentPeriod,
  type Agent,
  type BuildStage,
  type EstatePrototype,
  type Furnishing,
  type ListingFee,
  type ListingType,
  type PaymentPlan,
  type PriceChange,
  type Property,
  type PropertyStatus,
  type PropertyType,
  type RentPeriod,
  type SiteStat,
  type Testimonial,
  type TitleDocument,
} from "@avhomes/contracts";

/**
 * The stored shape.
 *
 * Almost the wire shape, because there is nothing secret on a listing and no
 * derived column worth hiding. The two differences are `_id` versus `id`, and
 * `sourceIp` style fields that do not exist here at all.
 *
 * Images are stored as resolved URL strings rather than image ids behind a port.
 * A port would buy alt text and dimensions, which a property gallery does not
 * use, at the cost of a join on the hottest read on the site. The admin picker
 * resolves the URL once, at the moment somebody chooses the photo.
 */
export interface PropertyDoc {
  _id: string;
  slug: string | null;
  title: string;
  tagline: string;
  description: string;
  priceMinor: number;
  currency: string;
  status: PropertyStatus;
  listingType: ListingType;
  /**
   * Optional, unlike Property's. Legacy rows carry none of these three: a row
   * this migration touched has `listingType` but was never rewritten to add
   * `rentPeriod`, `fees` or `priceHistory`, so the doc type says so and
   * `toProperty` below is where that absence gets resolved, not up here.
   */
  rentPeriod?: RentPeriod | null;
  fees?: ListingFee[];
  priceHistory?: PriceChange[];
  type: PropertyType;
  location: string;
  city: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  parkingSpaces: number;
  yearBuilt: number;
  featured: boolean;
  amenities: string[];
  images: string[];
  /**
   * Optional for the same reason as the three above: 0009 added them without
   * rewriting a single row. Absence reads as "not an estate, nothing stated",
   * which is exactly what a listing written before these fields existed means.
   */
  prototypes?: EstatePrototype[];
  paymentPlan?: PaymentPlan | null;
  buildStage?: BuildStage | null;
  titleDocument?: TitleDocument | null;
  furnishing?: Furnishing | null;
  serviced?: boolean;
  availableFrom?: number | null;
  minStay?: number | null;
  agent: Agent;
  agentUserId: string | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  deletedAt: number | null;
  revision: number;
}

export interface TestimonialDoc {
  _id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  initials: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface SiteStatDoc {
  _id: string;
  value: number;
  label: string;
  suffix: string | null;
  prefix: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Stops being a spread and becomes a field-by-field mapper, the same idiom
 * `toEnquiry` in @avhomes/enquiries uses. A spread carries absence straight
 * through: `rentPeriod`, `fees` and `priceHistory` do not exist on a row this
 * migration backfilled, so Property.fees would be `undefined` at runtime and
 * the first `.map` over it in the UI would throw. This is the one file where
 * that optionality exists; the three lines below resolve it, and nothing past
 * this function ever sees an undefined in its place. 0009's estate and rent
 * term fields are resolved the same way, below `images`.
 */
export function toProperty(doc: PropertyDoc): Property {
  return {
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    tagline: doc.tagline,
    description: doc.description,
    priceMinor: doc.priceMinor,
    currency: doc.currency,
    status: doc.status,
    listingType: doc.listingType,
    rentPeriod: readRentPeriod(doc.rentPeriod, doc.listingType),
    fees: normalizeFees(doc.fees ?? []),
    priceHistory: doc.priceHistory ?? [],
    type: doc.type,
    location: doc.location,
    city: doc.city,
    address: doc.address,
    bedrooms: doc.bedrooms,
    bathrooms: doc.bathrooms,
    areaSqft: doc.areaSqft,
    parkingSpaces: doc.parkingSpaces,
    yearBuilt: doc.yearBuilt,
    featured: doc.featured,
    amenities: doc.amenities,
    images: doc.images,
    prototypes: doc.prototypes ?? [],
    paymentPlan: doc.paymentPlan ?? null,
    buildStage: doc.buildStage ?? null,
    titleDocument: doc.titleDocument ?? null,
    furnishing: doc.furnishing ?? null,
    serviced: doc.serviced ?? false,
    availableFrom: doc.availableFrom ?? null,
    minStay: doc.minStay ?? null,
    agent: doc.agent,
    agentUserId: doc.agentUserId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    publishedAt: doc.publishedAt,
    deletedAt: doc.deletedAt,
    revision: doc.revision,
  };
}

export function toTestimonial(doc: TestimonialDoc): Testimonial {
  return {
    id: doc._id,
    name: doc.name,
    role: doc.role,
    quote: doc.quote,
    rating: doc.rating,
    initials: doc.initials,
    position: doc.position,
  };
}

export function toSiteStat(doc: SiteStatDoc): SiteStat {
  return {
    id: doc._id,
    value: doc.value,
    label: doc.label,
    position: doc.position,
    ...(doc.suffix ? { suffix: doc.suffix } : {}),
    ...(doc.prefix ? { prefix: doc.prefix } : {}),
  };
}

/**
 * The sorts the list routes offer, and the field each orders on.
 *
 * Named here because the NAME is what a cursor carries. Spending a cursor minted
 * under one of these under another is refused by `keysetFilter`, and it has to be
 * refused: BSON orders across types, so comparing a price against a timestamp
 * returns a wrong page rather than an error.
 */
export const PROPERTY_SORTS = {
  newest: { field: "publishedAt", direction: -1 },
  updated: { field: "updatedAt", direction: -1 },
  "price-high": { field: "priceMinor", direction: -1 },
  "price-low": { field: "priceMinor", direction: 1 },
} as const;

export type PropertySort = keyof typeof PROPERTY_SORTS;
export const PROPERTY_SORT_NAMES = Object.keys(PROPERTY_SORTS) as [PropertySort, ...PropertySort[]];
