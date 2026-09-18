/**
 * The Google Maps link a listing can carry, and what the site is allowed to do
 * with it.
 *
 * ONE FILE, because this string ends up in two places that must not disagree: a
 * button a buyer taps to get directions, and an `iframe src` on a public page.
 * The first is a link; the second is a document this site asks a browser to
 * load inside its own. Deciding what counts as a map link in the form, in the
 * API and at render time from three different tests is how one of the three
 * ends up accepting something the others refuse.
 */

/**
 * Hosts a map link may name.
 *
 * `google.com` has a country domain per market and the Nigerian share sheet
 * hands out `google.com.ng`, so the test is the registrable stem plus a
 * suffix, not a fixed list. `app.goo.gl` and `goo.gl` are the short links the
 * Share button now produces by default, which is the common case rather than
 * the exception.
 */
const HOST_PATTERNS: readonly RegExp[] = [
  /^(?:www\.|maps\.)?google\.[a-z.]{2,8}$/u,
  /^maps\.app\.goo\.gl$/u,
  /^goo\.gl$/u,
];

/** A share link that names no place until it is followed. */
export function isShortMapLink(link: string): boolean {
  const url = parse(link);
  if (!url) return false;
  return url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl";
}

function parse(raw: string): URL | null {
  const value = raw.trim();
  if (value === "") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * What was pasted, as a bare URL.
 *
 * People paste what the Share sheet gave them, and one of its two buttons gives
 * a whole `<iframe>` tag. Pulling the `src` out of it is three lines here and a
 * support conversation everywhere else. Anything else is returned trimmed and
 * judged by `mapLinkRefusal`.
 */
export function normalizeMapLink(raw: string): string {
  const value = raw.trim();
  const iframe = /<iframe[^>]*\ssrc=["']([^"']+)["']/iu.exec(value);
  return (iframe?.[1] ?? value).trim();
}

/** The one sentence the form and the API both say when a link is refused. */
export function mapLinkRefusal(raw: string): string | null {
  const value = normalizeMapLink(raw);
  if (value === "") return null;
  if (value.length > MAP_LINK_MAX) return "That link is too long to store.";
  const url = parse(value);
  if (!url) {
    return "Paste a Google Maps link. Open the place in Google Maps, tap Share, and copy the link.";
  }
  return null;
}

export const MAP_LINK_MAX = 2000;

/** `6.4474`, `3.4553`, and the zoom if the link carried one. */
interface Pin {
  lat: string;
  lng: string;
  zoom: string | null;
}

/**
 * Where the pin is, read out of whichever shape the link happens to be.
 *
 * Google writes the same place four ways depending on which button produced the
 * link, and none of them is documented. `@lat,lng,17z` is the map's own viewport
 * and rides along on nearly every desktop URL; `!3dlat!4dlng` is the place's
 * real position inside the `data=` blob and is the more accurate of the two when
 * both exist, because the viewport can be anywhere the operator had scrolled to.
 * So the data blob is read FIRST, and `@` is the fallback.
 */
function pinOf(url: URL): Pin | null {
  const path = decodeURIComponent(url.pathname);
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/u.exec(path);
  const data = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/u.exec(`${path}${url.search}`);

  const source = data ?? at;
  if (!source) {
    // `?q=6.44,3.45` and `?ll=`, which the older share links and every
    // hand-written map URL use.
    const query = url.searchParams.get("q") ?? url.searchParams.get("ll") ?? url.searchParams.get("center");
    const pair = query ? /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(query) : null;
    if (!pair) return null;
    return { lat: pair[1], lng: pair[2], zoom: url.searchParams.get("z") };
  }
  return { lat: source[1], lng: source[2], zoom: at?.[3] ?? url.searchParams.get("z") };
}

/** "Lekki Phase 1" out of `/maps/place/Lekki+Phase+1/@6.4,3.4,15z`. */
function placeOf(url: URL): string | null {
  const match = /\/maps\/place\/([^/@]+)/u.exec(url.pathname);
  if (!match) return null;
  const name = decodeURIComponent(match[1].replace(/\+/gu, " ")).trim();
  return name === "" ? null : name;
}

/**
 * What a browser may load in a frame, or null when the link cannot say.
 *
 * A Google Maps page refuses to be framed, so the pasted link is never the
 * embed: `output=embed` is, and it takes a query rather than a place id. The
 * pin is preferred over every other reading because it is the thing the
 * operator actually chose; a short link that was never expanded names nothing,
 * so it answers null and the caller decides what to show instead.
 *
 * `hl=en` so the map is captioned the same way for every visitor rather than
 * following whatever Google infers about them.
 */
export function mapEmbedSrc(link: string): string | null {
  const url = parse(normalizeMapLink(link));
  if (!url) return null;

  // The Share sheet's other button hands over a ready-made embed. It is already
  // the frameable form, so it is passed through untouched.
  if (url.pathname.startsWith("/maps/embed")) return url.toString();

  const pin = pinOf(url);
  if (pin) {
    const zoom = pin.zoom ?? "16";
    return `https://www.google.com/maps?q=${pin.lat},${pin.lng}&z=${zoom}&hl=en&output=embed`;
  }

  const place = placeOf(url) ?? url.searchParams.get("q");
  if (place && place.trim() !== "") {
    return `https://www.google.com/maps?q=${encodeURIComponent(place)}&hl=en&output=embed`;
  }
  return null;
}

/**
 * What to search for when there is no link: the address, and the city only if
 * the address has not already said it.
 *
 * Every address on this site is written the local way and ends with its city,
 * so appending one produced "Block 4, Fara Park, Sangotedo, Lagos, Lagos".
 * Google forgives that; a person reading the directions button's destination
 * does not.
 */
function addressQuery(listing: { address: string; city: string }): string {
  const address = listing.address.trim();
  const city = listing.city.trim();
  if (address === "") return city;
  if (city === "" || address.toLowerCase().includes(city.toLowerCase())) return address;
  return `${address}, ${city}`;
}

/**
 * A frameable map for a listing, falling back to its address.
 *
 * The fallback is what makes the feature degrade rather than disappear: a link
 * that could not be expanded still leaves a map of the street somebody typed,
 * which is the same place the Get directions button has always searched for.
 */
export function listingMapEmbedSrc(listing: { mapUrl: string; address: string; city: string }): string | null {
  const fromLink = mapEmbedSrc(listing.mapUrl);
  if (fromLink) return fromLink;
  const query = addressQuery(listing);
  if (query === "") return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&hl=en&output=embed`;
}

/**
 * Where "Get directions" goes.
 *
 * The operator's own link wins when there is one, because they chose the exact
 * building. The address search is what every listing had before this field
 * existed and is still right for one without it.
 */
export function mapDirectionsHref(listing: { mapUrl: string; address: string; city: string }): string {
  const link = normalizeMapLink(listing.mapUrl);
  if (parse(link)) return link;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery(listing))}`;
}
