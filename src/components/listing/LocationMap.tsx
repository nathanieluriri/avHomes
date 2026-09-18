"use client";

import { useState, useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";
import { CONSENT_EVENT, CONSENT_KEY } from "@/components/CookieBanner";

/**
 * The map, loaded when the visitor is ready for it.
 *
 * A Google Maps frame is a third party on a page that promises, in as many
 * words on /privacy, that nothing beyond the strictly necessary loads without
 * consent. So it is not in the markup on arrival: a visitor who has already
 * accepted cookies gets it immediately, and everybody else gets a panel with a
 * button that loads it on the one tap. Nothing about the listing is hidden
 * behind that tap. The address sits above it and Get directions beside it, and
 * both work with no frame at all.
 *
 * The weight is the other half. The frame is around a megabyte of script and
 * tiles for a panel most visitors scroll past, on a site whose traffic is
 * nearly all phones on Nigerian mobile data. `loading="lazy"` covers the
 * accepted case; the button covers the rest.
 */
export default function LocationMap({ src, address }: { src: string; address: string }) {
  const accepted = useSyncExternalStore(subscribeToConsent, readConsent, () => false);
  const [asked, setAsked] = useState(false);

  if (!accepted && !asked) {
    return (
      <div className="mt-5 overflow-hidden rounded-xl border border-mist-200 bg-mist-50">
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <MapPin className="h-6 w-6 text-wine-600" strokeWidth={2} aria-hidden="true" />
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            The map is loaded from Google, which sets its own cookies.
          </p>
          <button
            type="button"
            onClick={() => setAsked(true)}
            className="inline-flex items-center rounded-full bg-plum-950 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-wine-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
          >
            Show the map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-mist-200">
      <iframe
        src={src}
        title={address === "" ? "Map of this property" : `Map of ${address}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-72 w-full sm:h-80"
      />
    </div>
  );
}

/**
 * Consent read as what it is: a value owned by something outside React.
 *
 * `useSyncExternalStore` rather than an effect that sets state, because the
 * server renders this with no answer at all and the first client paint has to
 * agree with it. The snapshot is a boolean, so React compares it by value and
 * re-renders only when the visitor actually decides something.
 */
function subscribeToConsent(onChange: () => void): () => void {
  // The banner announces its own choice: localStorage fires no `storage` event
  // in the tab that wrote it, and `storage` covers a choice made in another.
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    // Storage blocked entirely. That is not consent, so the button stays.
    return false;
  }
}
