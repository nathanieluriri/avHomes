import { referralCodeFrom } from "@avhomes/contracts";

/**
 * The marketer code a visitor arrived with, kept for the tab's session.
 *
 * A marketer shares a listing as `/listings/<slug>?ref=AV-0042`. The code is
 * read once on arrival and held here, so an enquiry sent three pages later, or
 * from the contact page, still says which link brought the buyer. Session
 * storage rather than a cookie: it never travels to the server on its own, and
 * it is only sent with an enquiry the visitor chooses to submit.
 *
 * Every storage call is guarded. A private window or blocked site data throws on
 * access, and a missing referral must never break the form that carries it.
 */

const KEY = "avhomes.ref";

/** Stores the `?ref=` in a query string, when it is a marketer code. The latest link wins. */
export function rememberReferral(search: string): void {
  const code = referralCodeFrom(new URLSearchParams(search).get("ref"));
  if (!code) return;
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    // Storage refused: the enquiry goes without it.
  }
}

/** The code to send with an enquiry, or null. */
export function readReferral(): string | null {
  try {
    return referralCodeFrom(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
