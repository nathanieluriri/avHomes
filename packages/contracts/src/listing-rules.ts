import { formatPrice, formatPriceShort, listingLabel } from "./money";
import {
  ESTATE_TYPE,
  FEATURABLE_STATUSES,
  type BuildStage,
  type EstatePrototype,
  type Furnishing,
  type ListingType,
  type PaymentPlan,
  type Property,
  type PropertyStatus,
  type PropertyType,
  type PrototypeKind,
  type RentPeriod,
  type TitleDocument,
} from "./types";

/**
 * Which fields a listing of a given shape can carry.
 *
 * The one table the editor, the server and the public pages all read, so a field
 * hidden in the form is also cleared on save and never rendered on the site.
 * A rent has no title document, a sale has no furnishing, and an estate has no
 * bedroom count of its own because each prototype carries one.
 */
export interface ListingFields {
  /** The Sale/Rent choice. An estate is always a sale. */
  dealChoice: boolean;
  /** A typed price. An estate's price is derived from its prototypes. */
  price: boolean;
  rentPeriod: boolean;
  /** Bedrooms, bathrooms, parking. */
  rooms: boolean;
  area: boolean;
  yearBuilt: boolean;
  prototypes: boolean;
  paymentPlan: boolean;
  buildStage: boolean;
  titleDocument: boolean;
  /** Furnishing, serviced, available from, minimum stay. */
  rentTerms: boolean;
}

export function isEstate(type: PropertyType): boolean {
  return type === ESTATE_TYPE;
}

export function fieldsFor(shape: { type: PropertyType; listingType: ListingType }): ListingFields {
  const estate = isEstate(shape.type);
  const rent = !estate && shape.listingType === "rent";
  return {
    dealChoice: !estate,
    price: !estate,
    rentPeriod: rent,
    rooms: !estate,
    area: !estate,
    yearBuilt: !estate,
    prototypes: estate,
    paymentPlan: estate,
    buildStage: estate,
    titleDocument: !rent,
    rentTerms: rent,
  };
}

/**
 * Featured is only meaningful while the public can still act on the listing.
 * Pass `type` and `prototypes` to also rule out an estate with every option sold.
 */
export function canFeature(listing: {
  status: PropertyStatus;
  deletedAt: number | null;
  type?: PropertyType;
  prototypes?: readonly EstatePrototype[];
}): boolean {
  if (listing.deletedAt !== null || !FEATURABLE_STATUSES.includes(listing.status)) return false;
  if (listing.type !== undefined && isEstate(listing.type)) {
    return !estateSummary(listing.prototypes ?? []).soldOut;
  }
  return true;
}

/* Area is stored in square feet; every screen shows square metres. */
const SQM_PER_SQFT = 0.09290304;

export function sqftToSqm(sqft: number): number {
  return Math.round(sqft * SQM_PER_SQFT);
}

export function sqmToSqft(sqm: number): number {
  return Math.round(sqm / SQM_PER_SQFT);
}

/* ─────────────────────────────── estates ─────────────────────────────── */

export interface EstateSummary {
  count: number;
  availableCount: number;
  /** Cheapest available priced option, else cheapest priced option, else 0. */
  fromMinor: number;
  toMinor: number;
  /** Over house prototypes only. Both 0 when the estate sells plots alone. */
  bedroomsMin: number;
  bedroomsMax: number;
  bathroomsMax: number;
  hasHouses: boolean;
  hasPlots: boolean;
  /** Over plot prototypes only. */
  plotSqmMin: number;
  plotSqmMax: number;
  /** Has options, and none of them is available. */
  soldOut: boolean;
}

export function estateSummary(prototypes: readonly EstatePrototype[]): EstateSummary {
  // Ranges describe what can still be bought. Sold-out options only count once
  // nothing is left, so a sold-out estate still says what it was.
  const open = prototypes.some((p) => p.available) ? prototypes.filter((p) => p.available) : prototypes;
  const priced = prototypes.filter((p) => p.priceMinor > 0);
  const pricedAvailable = priced.filter((p) => p.available);
  const range = (pricedAvailable.length > 0 ? pricedAvailable : priced).map((p) => p.priceMinor);
  const houses = open.filter((p) => p.kind === "house");
  const plots = open.filter((p) => p.kind === "plot" && p.sizeSqm > 0);
  // A house row whose beds are not filled in yet says nothing about the range.
  const beds = houses.map((p) => p.bedrooms).filter((n) => n > 0);
  const availableCount = prototypes.filter((p) => p.available).length;
  return {
    count: prototypes.length,
    availableCount,
    fromMinor: range.length > 0 ? Math.min(...range) : 0,
    toMinor: range.length > 0 ? Math.max(...range) : 0,
    bedroomsMin: beds.length > 0 ? Math.min(...beds) : 0,
    bedroomsMax: beds.length > 0 ? Math.max(...beds) : 0,
    bathroomsMax: houses.length > 0 ? Math.max(...houses.map((p) => p.bathrooms)) : 0,
    hasHouses: houses.length > 0,
    hasPlots: prototypes.some((p) => p.kind === "plot"),
    plotSqmMin: plots.length > 0 ? Math.min(...plots.map((p) => p.sizeSqm)) : 0,
    plotSqmMax: plots.length > 0 ? Math.max(...plots.map((p) => p.sizeSqm)) : 0,
    soldOut: prototypes.length > 0 && availableCount === 0,
  };
}

/**
 * The stored columns an estate's prototypes decide.
 *
 * Written on every estate save so the list sort, the price filter and the
 * bedroom filter keep working on plain columns. `bedrooms` is the MAX, so
 * "3+ beds" finds an estate that offers a 3 bed alongside a 2 bed.
 */
export function derivedEstateColumns(prototypes: readonly EstatePrototype[]): {
  priceMinor: number;
  bedrooms: number;
  bathrooms: number;
} {
  const s = estateSummary(prototypes);
  return { priceMinor: s.fromMinor, bedrooms: s.bedroomsMax, bathrooms: s.bathroomsMax };
}

/** "3 bedroom" or "500 sqm plot", for a row whose name was left blank. */
export function prototypeLabel(p: Pick<EstatePrototype, "name" | "kind" | "bedrooms" | "sizeSqm">): string {
  const name = p.name.trim();
  if (name !== "") return name;
  if (p.kind === "plot") return p.sizeSqm > 0 ? `${formatSqm(p.sizeSqm)} plot` : "Plot";
  return p.bedrooms > 0 ? `${p.bedrooms} bedroom` : "House";
}

export function formatSqm(sqm: number): string {
  return `${new Intl.NumberFormat("en-NG").format(sqm)} sqm`;
}

/** Random, short, and safe in a browser and in Node alike. */
export function newPrototypeId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `pt_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Deposit and monthly instalment for one option under a plan, in minor units. */
export function paymentPlanFor(priceMinor: number, plan: PaymentPlan): { depositMinor: number; monthlyMinor: number } {
  const depositMinor = Math.round((priceMinor * plan.depositPercent) / 100);
  const monthlyMinor = plan.months > 0 ? Math.ceil((priceMinor - depositMinor) / plan.months) : 0;
  return { depositMinor, monthlyMinor };
}

/* ─────────────────────────────── rent terms ─────────────────────────────── */

/** A shortlet's minimum is in nights; a yearly or monthly rent's is in months. */
export function minStayUnit(period: RentPeriod | null): "nights" | "months" {
  return period === "night" ? "nights" : "months";
}

export function minStayLabel(minStay: number, period: RentPeriod | null): string {
  const unit = minStayUnit(period);
  return `${minStay} ${minStay === 1 ? unit.slice(0, -1) : unit} minimum`;
}

/* ─────────────────────────────── search ─────────────────────────────── */

/** What search engines show before they truncate. Longer is allowed, just cut. */
export const SEO_TITLE_ADVISED = 70;
export const SEO_DESCRIPTION_ADVISED = 160;
export const SEO_TITLE_MAX = 200;
export const SEO_DESCRIPTION_MAX = 400;
export const PREVIOUS_SLUGS_MAX = 20;

/** A web address from any text: "Kuje Garden Estate!" becomes "kuje-garden-estate". Null when nothing is left. */
export function toHandle(input: string): string | null {
  const handle = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
  return handle === "" ? null : handle;
}

/** "Banana Island, Ikoyi, Lagos" already ends with the city, so it is only added when absent. */
function whereLine(p: Pick<Property, "location" | "city">): string {
  return p.city && !p.location.includes(p.city)
    ? [p.location, p.city].filter(Boolean).join(", ")
    : p.location;
}

/** The description assembled from the facts, used whenever none was written. Price first. */
export function listingMetaDescription(p: Property): string {
  const where = whereLine(p);
  if (isEstate(p.type)) {
    const s = estateSummary(p.prototypes);
    const from = s.fromMinor > 0 ? ` from ${formatPriceShort(s.fromMinor, p)}` : "";
    const inWhere = where ? ` in ${where}` : "";
    return [`Estate Land${inWhere}. ${s.count} ${s.count === 1 ? "option" : "options"}${from}.`, p.tagline]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${listingLabel(p.listingType, p.status === "draft" || p.status === "archived" ? "live" : p.status)} at ${formatPrice(p.priceMinor, p)}.`,
    `${p.bedrooms} bed, ${p.bathrooms} bath ${p.type.toLowerCase()}${where ? ` in ${where}` : ""}.`,
    p.tagline,
  ]
    .filter(Boolean)
    .join(" ");
}

export function listingSeoTitle(p: Pick<Property, "seoTitle" | "title">): string {
  return p.seoTitle.trim() || p.title;
}

export function listingSeoDescription(p: Property): string {
  return p.seoDescription.trim() || listingMetaDescription(p);
}

/* ─────────────────────────────── labels ─────────────────────────────── */

export const PROTOTYPE_KIND_LABELS: Record<PrototypeKind, string> = {
  house: "House",
  plot: "Plot",
};

export const BUILD_STAGE_LABELS: Record<BuildStage, string> = {
  "off-plan": "Off-plan",
  "under-construction": "Under construction",
  completed: "Completed",
};

export const TITLE_DOCUMENT_LABELS: Record<TitleDocument, string> = {
  "c-of-o": "Certificate of Occupancy",
  "r-of-o": "Right of Occupancy",
  "governors-consent": "Governor's Consent",
  "deed-of-assignment": "Deed of Assignment",
  excision: "Excision",
  gazette: "Gazette",
};

/** Short forms for chips and cards, where the full name wraps. */
export const TITLE_DOCUMENT_SHORT: Record<TitleDocument, string> = {
  "c-of-o": "C of O",
  "r-of-o": "R of O",
  "governors-consent": "Governor's Consent",
  "deed-of-assignment": "Deed of Assignment",
  excision: "Excision",
  gazette: "Gazette",
};

export const FURNISHING_LABELS: Record<Furnishing, string> = {
  furnished: "Furnished",
  "semi-furnished": "Semi-furnished",
  unfurnished: "Unfurnished",
};

/* ─────────────────────────────── amenities ─────────────────────────────── */

export const AMENITY_MAX = 60;
export const AMENITY_LENGTH_MAX = 120;

/** Offered as one-tap chips in the editor. Free text is still allowed. */
export const HOME_AMENITY_SUGGESTIONS: readonly string[] = [
  "24/7 Security",
  "Backup Power",
  "Solar with Battery",
  "Borehole",
  "Gated Estate",
  "Swimming Pool",
  "Gym",
  "Fitted Kitchen",
  "Boys Quarters",
  "Staff Quarters",
  "Secure Parking",
  "Lift",
  "Concierge",
  "Fibre Internet",
  "Smart Home System",
  "Garden",
  "Balcony",
  "Air Conditioning",
  "Prepaid Meter",
  "Treatment Plant",
];

export const ESTATE_AMENITY_SUGGESTIONS: readonly string[] = [
  "Perimeter Fence",
  "Gatehouse",
  "24/7 Security",
  "Good Road Network",
  "Drainage",
  "Electricity",
  "Water Supply",
  "Street Lights",
  "Recreation Park",
  "Children's Playground",
  "Shopping Complex",
  "Place of Worship",
  "Estate Clubhouse",
  "Swimming Pool",
  "Dry Land",
];

/**
 * One amenity list, cleaned: trimmed, blanks dropped, duplicates removed
 * case-insensitively keeping the first spelling, capped at AMENITY_MAX.
 */
export function normalizeAmenities(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, AMENITY_LENGTH_MAX);
    const key = value.toLowerCase();
    if (value === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === AMENITY_MAX) break;
  }
  return out;
}
