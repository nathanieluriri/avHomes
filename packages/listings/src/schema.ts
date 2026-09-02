import type { Agent, Property, PropertyStatus, PropertyType, SiteStat, Testimonial } from "@avhomes/contracts";

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

export function toProperty(doc: PropertyDoc): Property {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
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
