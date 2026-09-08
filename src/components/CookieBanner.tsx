"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

export const CONSENT_KEY = "avhomes.cookie-consent";

/**
 * Dispatched on every choice. localStorage fires no `storage` event in the tab
 * that wrote it, so anything gated on consent in THIS tab would otherwise wait
 * for a reload to notice the visitor said yes.
 */
export const CONSENT_EVENT = "avhomes:cookie-consent";

type Choice = "accepted" | "rejected";

/**
 * Cookie consent notice. Accept and Reject carry equal visual weight, and
 * nothing beyond the strictly necessary cookies is switched on unless the
 * visitor accepts. The choice is kept in localStorage so it survives reloads.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /*
     * Never inside a frame. The console's dashboard embeds this page to draw its
     * storefront preview, and a consent notice rendered in there is one the
     * operator cannot dismiss and was never being asked to answer. The visitor's
     * real banner is unaffected: the site is only ever framed by the console.
     */
    if (window.top !== window.self) return;

    // Reading storage in an effect keeps the server and client markup identical.
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CONSENT_KEY);
    } catch {
      // Storage can be blocked entirely, in which case just show the notice.
    }
    if (stored !== "accepted" && stored !== "rejected") {
      const timer = window.setTimeout(() => setVisible(true), 600);
      return () => window.clearTimeout(timer);
    }
  }, []);

  function choose(choice: Choice) {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      // A blocked store just means the notice returns next visit.
    }
    // Announced even when the write failed, so the choice is honoured for this
    // visit either way.
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-body"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-mist-200 bg-white p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50 text-wine-600">
          <Cookie className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p id="cookie-title" className="text-sm font-semibold text-plum-950">
            We use cookies
          </p>
          <p id="cookie-body" className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Strictly necessary cookies keep the site working. We would also like
            to set analytics cookies to understand how listings are browsed.
            Read the{" "}
            <Link
              href="/privacy#cookies"
              className="font-medium text-wine-600 underline underline-offset-2 hover:text-wine-700"
            >
              cookie policy
            </Link>
            .
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="flex-1 rounded-full border border-mist-200 px-5 py-2.5 text-sm font-semibold text-plum-950 transition-colors hover:border-wine-600 hover:text-wine-600 sm:flex-none"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="flex-1 rounded-full bg-wine-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 sm:flex-none"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => choose("rejected")}
            aria-label="Dismiss and reject non essential cookies"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-mist-100 hover:text-plum-950"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
