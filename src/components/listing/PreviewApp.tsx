"use client";

import { useEffect, useRef, useState } from "react";
import type { Property } from "@/lib/types";
import PropertyCard from "@/components/PropertyCard";
import Reveal from "@/components/Reveal";
import ListingDetail from "@/components/listing/ListingDetail";
import { isPreviewMessage, type PreviewMessage, type PreviewView } from "@/lib/preview";

/** Stands in for a listing with no photo yet, since the card and gallery need one. */
const NO_PHOTO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#eef0f4"/><text x="600" y="460" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#8a93a6">No photo yet</text></svg>',
)}`;

function post(message: PreviewMessage) {
  window.parent.postMessage(message, window.location.origin);
}

/**
 * The listing as the site shows it, driven by the editor.
 *
 * It opens on the listings grid with this listing first among real ones, and
 * its card opens the detail page, exactly as a visitor would move. Every other
 * link is caught before it navigates, so the frame never leaves the preview.
 */
export default function PreviewApp() {
  const [draft, setDraft] = useState<Property | null>(null);
  // Real neighbours for the grid, read in the browser so they are never a stale build's.
  const [others, setOthers] = useState<Property[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/properties?limit=8", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ items: Property[] }>) : { items: [] }))
      .then((page) => setOthers(page.items))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [view, setView] = useState<PreviewView>("grid");
  const [note, setNote] = useState(false);
  const noteTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      if (e.data.type === "avhomes-preview:draft") setDraft(e.data.property);
      if (e.data.type === "avhomes-preview:view") {
        setView(e.data.view);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "avhomes-preview:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const property: Property | null = draft && {
    ...draft,
    images: draft.images.length > 0 ? draft.images : [NO_PHOTO],
  };
  const own = property ? `/listings/${property.slug}` : null;

  /* Capture phase on the document runs before React's own handler, so a Link
     sees the default already prevented and does not navigate. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a") : null;
      if (!anchor) return;
      e.preventDefault();
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === own) {
        setView("detail");
        window.scrollTo({ top: 0 });
        post({ type: "avhomes-preview:view", view: "detail" });
        return;
      }
      if (url.origin === window.location.origin && url.pathname === "/listings") {
        setView("grid");
        window.scrollTo({ top: 0 });
        post({ type: "avhomes-preview:view", view: "grid" });
        return;
      }
      setNote(true);
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(false), 2200);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [own]);

  if (!property) {
    return (
      <p className="mx-auto max-w-md px-6 py-24 text-center text-sm text-muted-foreground">
        Open this from a listing&apos;s editor to preview it.
      </p>
    );
  }

  const neighbours = others.filter((p) => p.id !== property.id && p.slug !== null);
  const similar = neighbours
    .filter((p) => p.type === property.type || p.city === property.city)
    .slice(0, 3);

  return (
    <>
      {view === "grid" ? (
        <>
          <section className="border-b border-mist-200 bg-mist-50">
            <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">Listings</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
                Find A Home That <span className="accent">Fits You</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                Your listing leads the grid here so you can see its card next to real ones. Open it to see its page.
              </p>
            </div>
          </section>
          <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[property, ...neighbours.slice(0, 5)].map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 80}>
                  <PropertyCard property={p} priority={i < 3} />
                </Reveal>
              ))}
            </div>
          </div>
        </>
      ) : (
        <ListingDetail property={property} similar={similar} />
      )}

      <p
        role="status"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-[90] mx-auto w-fit rounded-full bg-plum-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity duration-200 ${
          note ? "opacity-100" : "opacity-0"
        }`}
      >
        Only this listing opens in the preview.
      </p>
    </>
  );
}
