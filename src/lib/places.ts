import { estateSummary, formatPriceShort, isEstate, toHandle, type Property } from "@avhomes/contracts";

/**
 * The places this agency actually has stock in, derived rather than configured.
 *
 * NOT `locations.ts`. That file is the universe a buyer can TYPE: a few hundred
 * neighbourhoods that exist whether or not we have anything in them. This one is
 * the much shorter list of places with a listing on them today, and the
 * difference is the whole reason a page per place is worth serving at all. Built
 * from the typeahead list it would be four hundred empty rooms, which is the
 * textbook doorway pattern and the fastest way to get the rest of the site
 * discounted along with it.
 *
 * DERIVED ON EVERY READ, from the same properties the listings index shows. A
 * place page can therefore never disagree with the grid it was reached from, and
 * a place that sells out stops having a page without anybody remembering to go
 * and delete one.
 */

export interface PlaceSummary {
  /** The URL segment, made by `toHandle` so it matches how a listing slug is made. */
  slug: string;
  /** As written on the listings, which is how a reader expects to see it. */
  name: string;
  /**
   * The next place out. Empty when there is nothing above it but the country,
   * which is what makes a city a city here rather than a stored flag.
   */
  within: string;
  count: number;
  forSale: number;
  forRent: number;
  /**
   * The cheapest thing you could BUY here, an estate counted at its cheapest
   * option. Sales only: mixing a yearly rent into the same figure gives a "from"
   * price that is true of nothing on the page.
   */
  fromMinor: number;
  /** The currency of that cheapest sale, so the figure can be formatted without a second lookup. */
  currency: string;
}

/**
 * A listing's places, narrowest first.
 *
 * `location` is a COMMA TRAIL rather than one name. The stock carries
 * "Banana Island, Ikoyi, Lagos" and "Chevron Drive, Lekki", so splitting it is
 * not tidying, it is the only way the two listings written as
 * "Banana Island, Ikoyi, Lagos" and "Banana Island, Ikoyi" land on one page
 * instead of two.
 *
 * `city` is appended when the trail does not already end in it, which is how a
 * bare "Maitama" still reaches Abuja. Compared by handle, because "Abuja" and
 * "abuja" are the same city and a duplicated tier would double every count.
 */
export function placeTrail(p: Pick<Property, "location" | "city">): string[] {
  const parts = (p.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const city = (p.city ?? "").trim();
  if (city !== "" && parts.every((part) => toHandle(part) !== toHandle(city))) parts.push(city);
  return parts;
}

/** Sales only, and 0 for anything with no price on it yet. See `fromMinor`. */
function saleFrom(p: Property): number {
  if (p.listingType !== "sale") return 0;
  return isEstate(p.type) ? estateSummary(p.prototypes ?? []).fromMinor : p.priceMinor;
}

export function placesWithStock(properties: readonly Property[]): PlaceSummary[] {
  const rows = new Map<string, PlaceSummary>();

  for (const p of properties) {
    const trail = placeTrail(p);
    // A trail that repeats a name counts the listing once for that place, not twice.
    const counted = new Set<string>();

    trail.forEach((name, i) => {
      const slug = toHandle(name);
      if (slug === null || counted.has(slug)) return;
      counted.add(slug);

      const row = rows.get(slug) ?? {
        slug,
        name,
        within: "",
        count: 0,
        forSale: 0,
        forRent: 0,
        fromMinor: 0,
        currency: p.currency,
      };
      // First listing to place it wins. A later one saying nothing does not
      // demote a city page back to having no parent, and vice versa.
      if (row.within === "") row.within = trail[i + 1] ?? "";
      row.count += 1;
      if (p.listingType === "sale") row.forSale += 1;
      else row.forRent += 1;

      const from = saleFrom(p);
      if (from > 0 && (row.fromMinor === 0 || from < row.fromMinor)) {
        row.fromMinor = from;
        row.currency = p.currency;
      }

      rows.set(slug, row);
    });
  }

  // Busiest first, so the hub reads as a map of where the company actually
  // works rather than an alphabet nobody asked for.
  return [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The cheapest thing you could buy here, formatted, or nothing.
 *
 * SALE-ONLY, so the shape it builds carries no rent period and the figure never
 * comes out as "from N/yr" on a page whose cheapest sale is a house. Here rather
 * than at the two call sites, because a "from" price that means one thing on the
 * hub and another on a place page is worse than no price at all.
 */
export function fromPriceLabel(place: PlaceSummary): string | null {
  if (place.fromMinor === 0) return null;
  return formatPriceShort(place.fromMinor, {
    currency: place.currency,
    listingType: "sale",
    rentPeriod: null,
  });
}

/** Everything on the market in a place, by the same trail rule that built the page. */
export function listingsIn(properties: readonly Property[], slug: string): Property[] {
  return properties.filter((p) => placeTrail(p).some((name) => toHandle(name) === slug));
}

/**
 * The links that make a place page worth crawling rather than a dead end.
 *
 * A city offers what is inside it; a neighbourhood offers its siblings and the
 * city above it. Without these every place page is reachable only from the hub,
 * and a tree one link deep is a tree a crawler walks once and forgets.
 */
export function nearbyPlaces(
  all: readonly PlaceSummary[],
  place: PlaceSummary,
  limit = 10,
): PlaceSummary[] {
  return all
    .filter((other) => {
      if (other.slug === place.slug) return false;
      if (place.within === "") return other.within === place.name;
      return other.within === place.within || other.name === place.within;
    })
    .slice(0, limit);
}
