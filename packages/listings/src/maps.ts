import { isShortMapLink, normalizeMapLink } from "@avhomes/contracts";

/**
 * A share link, followed once so the listing stores the place rather than a
 * redirect.
 *
 * `maps.app.goo.gl/XXXX` is what the Share button hands out by default now, and
 * it names nothing: no coordinates, no place, nothing a map can be built from
 * until somebody follows it. Following it HERE, once, at the moment an operator
 * saves, is the difference between a listing that can draw a map and one that
 * falls back to searching its own address forever. The alternative is following
 * it on every public page view, which is a request to Google on the hot path
 * of the most-visited screen on the site.
 *
 * MANUAL redirects, so this reads a `Location` header rather than downloading a
 * map page. Chained, because the short host answers with another short URL
 * often enough to matter, and capped so a redirect loop cannot hold a save open.
 *
 * Best effort by design: a failure returns what was pasted. The link still
 * works as a button, the map still falls back to the address, and a save must
 * not fail because a third party was slow.
 *
 * Three hops at two and a half seconds each. A share link redirects once, so
 * the ceiling is what a save pays when Google does not answer at all, and a
 * save is a person waiting at a keyboard.
 */
const MAX_HOPS = 3;
const TIMEOUT_MS = 2500;

export async function expandMapLink(raw: string): Promise<string> {
  let link = normalizeMapLink(raw);
  if (link === "" || !isShortMapLink(link)) return link;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const next = await hopOnce(link);
    if (next === null) return link;
    link = next;
    if (!isShortMapLink(link)) return link;
  }
  return link;
}

async function hopOnce(link: string): Promise<string | null> {
  try {
    const response = await fetch(link, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Google hands a bare fetch a consent interstitial. A browser-shaped
      // request gets the 302 that the share link exists to serve.
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en",
      },
    });
    const location = response.headers.get("location");
    if (!location) return null;
    // Relative redirects are legal and Google uses them on consent hops.
    return new URL(location, link).toString();
  } catch {
    // Offline, blocked, timed out. The pasted link is still the answer.
    return null;
  }
}
