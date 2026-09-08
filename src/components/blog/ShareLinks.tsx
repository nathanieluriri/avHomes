"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaRedditAlien,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { Check, Link2, TriangleAlert } from "lucide-react";

import { SITE_DOMAIN } from "@/lib/blog/config";

/**
 * Snapshot functions live at module scope so their identity is stable across
 * renders. The store never changes during a page's life, so subscribe returns
 * a no-op unsubscriber.
 */
const subscribeToNothing = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => SITE_DOMAIN;

/**
 * Marks come from an icon package, not from paths pasted into this file.
 *
 * The hand-drawn set they replace was not a style that went stale: the Reddit
 * glyph was an approximation from memory and rendered as a smiley face, which
 * is what happens whenever a brand mark is redrawn by eye. A maintained package
 * is also the only thing that survives a brand changing its logo, as Twitter
 * did.
 *
 * `react-icons/fa6` and not Simple Icons, for one concrete reason: Simple Icons
 * no longer carries LinkedIn, and LinkedIn is where a post about buying property
 * actually travels. One package covering all five beats two packages, and
 * `react-icons/*` is on Next's default `optimizePackageImports` list, so the
 * five named imports below do not drag a barrel of thousands behind them.
 */

/**
 * Each builder takes RAW values and encodes what it needs.
 *
 * WhatsApp is the reason. It carries one `text` parameter holding both the
 * title and the URL, so it has to encode the pair; handing it a pre-encoded URL
 * would either double-encode the link or force it to decode first, and a title
 * containing a percent sign makes that round trip throw.
 */
const TARGETS = [
  {
    name: "X",
    brand: "#0f172a",
    Glyph: FaXTwitter,
    href: (url: string, title: string) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    name: "WhatsApp",
    brand: "#128c4a",
    Glyph: FaWhatsapp,
    href: (url: string, title: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
  },
  {
    name: "LinkedIn",
    brand: "#0a66c2",
    Glyph: FaLinkedinIn,
    href: (url: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Facebook",
    brand: "#0866ff",
    Glyph: FaFacebookF,
    href: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: "Reddit",
    brand: "#d93a00",
    Glyph: FaRedditAlien,
    href: (url: string, title: string) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
] as const;

/** Long enough to read, short enough that the row is never stuck mid-state. */
const COPIED_MS = 2200;

type CopyState = "idle" | "copied" | "failed";

/**
 * The pre-Clipboard-API copy, kept as the fallback rather than as history.
 *
 * `navigator.clipboard.writeText` rejects with NotAllowedError on plain http,
 * in some Firefox configurations, and anywhere the clipboard-write permission
 * has been denied. `execCommand` has none of those conditions and is still
 * implemented everywhere despite being deprecated, so the pair covers browsers
 * that neither one covers alone.
 *
 * The textarea is readonly and off screen: selecting a visible, editable field
 * shows the reader a flash of highlighted text in a box they could type into.
 */
function copyByExecCommand(text: string): boolean {
  const restore = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.append(field);
  field.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  field.remove();
  // select() took focus off the button. Without this the reader's next Tab
  // starts from the top of the document.
  if (restore instanceof HTMLElement) restore.focus();
  return ok;
}

export default function ShareLinks({ title, slug }: { title: string; slug: string }) {
  // The reader must share the page they are actually looking at. A hardcoded
  // domain hands out production links from preview deploys and localhost.
  const origin = useSyncExternalStore(subscribeToNothing, clientOrigin, serverOrigin);
  const url = `${origin}/posts/${slug}`;

  const [copy, setCopy] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  // Cleared on unmount, because the reader can navigate away inside the window
  // above and a setState on a gone component is a warning in every log.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Absent (insecure context, so the property itself is undefined) or
      // refused. Neither is a reason to give up: the older path has different
      // conditions and often works where this one just failed.
      ok = copyByExecCommand(url);
    }

    /*
     * A FAILURE IS SHOWN, not swallowed.
     *
     * The first version of this returned to idle when both paths failed, which
     * is a button that looks like it works and does nothing at all. A reader
     * who presses it twice and sees no tick has no way to learn that the
     * clipboard is blocked rather than that their click missed.
     */
    setCopy(ok ? "copied" : "failed");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), COPIED_MS);
  }, [url]);

  return (
    <div className="share">
      <span className="share__label">Share on:</span>
      <ul className="share__list">
        {TARGETS.map(({ name, brand, Glyph, href }) => (
          <li key={name}>
            <a
              href={href(url, title)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Share "${title}" on ${name}`}
              className="share__link"
              style={{ "--brand": brand } as React.CSSProperties}
            >
              {/* The anchor's label already names the target, so the glyph is
                  decoration and stays out of the accessibility tree. */}
              <Glyph size={18} aria-hidden="true" focusable="false" />
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy the link to "${title}"`}
            className="share__link share__link--copy"
            data-copy={copy === "idle" ? undefined : copy}
          >
            {copy === "copied" ? (
              <Check size={18} strokeWidth={2.5} aria-hidden="true" />
            ) : copy === "failed" ? (
              <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Link2 size={18} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </li>
      </ul>
      {/*
        Polite, so the confirmation reaches a screen reader without cutting off
        whatever it was already saying. The failure carries the way out with it,
        because "copy failed" on its own leaves the reader with no next move.
      */}
      <span className="share__status" role="status">
        {copy === "copied"
          ? "Link copied"
          : copy === "failed"
            ? "Could not copy. The link is in your address bar."
            : ""}
      </span>
    </div>
  );
}
