"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Sharing from the phone: the native share sheet when there is one, WhatsApp
 * when there is not, and a copy that still works on a plain http address.
 */

const NEVER = () => () => {};

/** This site's origin once the client owns the tree; empty on the server. */
export function useOrigin(): string {
  return useSyncExternalStore(
    NEVER,
    () => window.location.origin,
    () => "",
  );
}

/** True when the browser has a share sheet. Desktop Chrome and Firefox do not. */
export function useCanShare(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => typeof navigator.share === "function",
    () => false,
  );
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(text: string): void {
  window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
}

/**
 * The share sheet, falling back to WhatsApp. `text` is sent with the link
 * already in it, because WhatsApp drops a separate `url`.
 */
export async function shareOrWhatsApp(share: { title: string; text: string; url: string }) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: share.title, text: share.text, url: share.url });
      return;
    } catch (err) {
      // Closing the sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  openWhatsApp(`${share.text} ${share.url}`);
}

/** The Clipboard API needs a secure origin; a phone testing on a LAN address has none. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** A copy button's state: true for a moment after a copy lands. */
export function useCopy(ms = 1800): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    (text: string) => {
      void writeClipboard(text).then((ok) => {
        if (!ok) return;
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), ms);
      });
    },
    [ms],
  );

  return [copied, copy];
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function onHashChange(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

/** The address's `#part`, for a screen an alert links into with an anchor. */
export function useHash(): string {
  return useSyncExternalStore(
    onHashChange,
    () => window.location.hash,
    () => "",
  );
}

/**
 * Brings an element into view and rings it once, for a link that points at
 * one card: an update about a listing, an alert about the bank.
 *
 * A ref callback rather than an effect, so it runs the moment the element
 * exists, which is after its data has loaded. The key is remembered so a
 * remount (switching tabs and back) does not ring it again. Without motion the
 * ring holds still for the same time and then goes.
 */
export function useSpotlight(
  key: string | null,
  block: ScrollLogicalPosition = "center",
): (node: HTMLElement | null) => void {
  const done = useRef<string | null>(null);

  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || key === null || done.current === key) return;
      done.current = key;
      const reduced = window.matchMedia(REDUCED).matches;
      node.scrollIntoView({ block, behavior: reduced ? "auto" : "smooth" });
      if (typeof node.animate !== "function") return;

      // The card keeps its own edge while the ring is on it.
      const own = getComputedStyle(node).boxShadow;
      const over = (ring: string) => (own && own !== "none" ? `${ring}, ${own}` : ring);
      const on = over("0 0 0 2px #ff8fa3, 0 0 34px -2px rgb(255 110 150 / 0.55)");
      const off = over("0 0 0 2px rgb(255 143 163 / 0), 0 0 34px -2px rgb(255 110 150 / 0)");
      node.animate(
        reduced
          ? [{ boxShadow: on }, { boxShadow: on, offset: 0.999 }, { boxShadow: off }]
          : [{ boxShadow: off }, { boxShadow: on, offset: 0.12 }, { boxShadow: on, offset: 0.62 }, { boxShadow: off }],
        { duration: 2800, easing: reduced ? "linear" : "ease-out" },
      );
    },
    [key, block],
  );
}
