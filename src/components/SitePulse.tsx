"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, CONSENT_KEY } from "./CookieBanner";

const SID_KEY = "avhomes.sid";
const PULSE_URL = "/api/public/pulse";
const HEARTBEAT_MS = 60_000;

/**
 * The visit beacon. Renders nothing.
 *
 * It fires ONLY on a stored "accepted", because the cookie notice promises the
 * visitor that analytics are off until they say yes. Absent and unreadable both
 * mean no, not "probably fine": a default of on would make the banner a lie for
 * everyone who ignored it.
 */
export default function SitePulse() {
  const pathname = usePathname();
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const fromStorage = () => setConsented(readStored(CONSENT_KEY) === "accepted");
    const fromEvent = (event: Event) => {
      // The banner reports its own choice, so an accept is honoured even on a
      // browser that refused to store it.
      const choice = (event as CustomEvent<unknown>).detail;
      if (typeof choice === "string") setConsented(choice === "accepted");
      else fromStorage();
    };

    fromStorage();
    window.addEventListener(CONSENT_EVENT, fromEvent);
    // `storage` covers the other direction: a choice made in another tab.
    window.addEventListener("storage", fromStorage);
    return () => {
      window.removeEventListener(CONSENT_EVENT, fromEvent);
      window.removeEventListener("storage", fromStorage);
    };
  }, []);

  // One on mount, one per navigation. `pathname` is the whole dependency: the
  // route changed, so this is a page view, and it says so on the wire.
  useEffect(() => {
    if (consented) pulse({ arrived: true });
  }, [consented, pathname]);

  useEffect(() => {
    if (!consented) return;
    const timer = window.setInterval(() => {
      // A backgrounded tab that keeps beating inflates "live visitors" with
      // people who left an hour ago and never closed the window.
      //
      // `arrived: false` is the other half of that. A heartbeat says the tab is
      // still open, not that anybody looked at a new page, and counting it as
      // one turns ten quiet minutes into eleven page views.
      if (document.visibilityState === "visible") pulse({ arrived: false });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [consented]);

  return null;
}

/**
 * One listing's own counter. Renders nothing.
 *
 * A SECOND component rather than a prop on the one above, because that one lives
 * in the site layout and the layout wraps every route, so it cannot know which
 * listing a page is. Sending both from one place would mean either the layout
 * knowing about listings or one arrival counting as two page views.
 *
 * It obeys the same consent rule, for the same reason: this is analytics, and the
 * banner promised it was off until the visitor said yes.
 */
export function ListingPulse({ id }: { id: string }) {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const fromStorage = () => setConsented(readStored(CONSENT_KEY) === "accepted");
    const fromEvent = (event: Event) => {
      const choice = (event as CustomEvent<unknown>).detail;
      if (typeof choice === "string") setConsented(choice === "accepted");
      else fromStorage();
    };
    fromStorage();
    window.addEventListener(CONSENT_EVENT, fromEvent);
    window.addEventListener("storage", fromStorage);
    return () => {
      window.removeEventListener(CONSENT_EVENT, fromEvent);
      window.removeEventListener("storage", fromStorage);
    };
  }, []);

  /* No heartbeat. "Still on this page" is the session beacon's job; this one
     answers "how many people reached this listing", which happens once. */
  useEffect(() => {
    if (consented) pulse({ arrived: true, listing: id });
  }, [consented, id]);

  return null;
}

/**
 * Safari in private mode THROWS on storage rather than returning null, so an
 * unguarded read here would blank the whole site behind an error boundary.
 */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The session id, minted once per tab.
 *
 * sessionStorage and not localStorage, because "session" in the number the
 * dashboard shows means a visit, and a localStorage id would make one person's
 * six months of visits a single eternal session.
 */
function sessionId(): string | null {
  try {
    const existing = window.sessionStorage.getItem(SID_KEY);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    window.sessionStorage.setItem(SID_KEY, minted);
    return minted;
  } catch {
    // No storage means no stable id, and an id minted fresh per page view would
    // report every reader as a crowd. Better to count nothing.
    return null;
  }
}

const SEEN_PREFIX = "avhomes.seen.";

/**
 * Is this the first time this visit has reached this listing?
 *
 * Remembered per tab beside the session id, so a reader who refreshes a listing
 * eleven times is one interested buyer rather than eleven. When storage throws it
 * answers TRUE: a slight over-count of sessions is a better failure than a listing
 * that silently reports none, and the page-view figure beside it is unaffected
 * either way.
 */
function firstForListing(listing: string): boolean {
  const key = `${SEEN_PREFIX}${listing}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

function pulse({ arrived, listing }: { arrived: boolean; listing?: string }): void {
  /*
   * Never from inside a frame. The console's dashboard embeds this page to draw
   * its storefront preview, and a preview the operator is looking at is not a
   * visitor. Without this the traffic figure becomes a count of how often
   * somebody opened the dashboard, which is the one number it must not be.
   */
  if (window.top !== window.self) return;

  const sid = sessionId();
  if (!sid) return;
  /* `only: "listing"` is what keeps the two beacons from both counting one
     arrival as a page view. See the route. */
  const body = JSON.stringify(
    listing
      ? { sid, listing, first: firstForListing(listing), only: "listing" }
      : arrived
        ? { sid, nav: true }
        : { sid },
  );

  try {
    /*
     * sendBeacon survives the page being torn down mid-navigation, which a
     * plain fetch does not.
     */
    if (typeof navigator.sendBeacon === "function") {
      // A Blob, because the queued content type is taken from it and the route
      // refuses anything that is not application/json.
      if (navigator.sendBeacon(PULSE_URL, new Blob([body], { type: "application/json" }))) return;
    }
    void fetch(PULSE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A counter is never worth an error the visitor can see.
  }
}
