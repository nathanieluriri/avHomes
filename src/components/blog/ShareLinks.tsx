"use client";

import { useSyncExternalStore } from "react";
import { SITE_DOMAIN } from "@/lib/blog/config";

/**
 * Snapshot functions live at module scope so their identity is stable across
 * renders. The store never changes during a page's life, so subscribe returns
 * a no-op unsubscriber.
 */
const subscribeToNothing = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => SITE_DOMAIN;

function XGlyph() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.8 11.8 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.688 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413" />
    </svg>
  );
}

function RedditGlyph() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="11.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9.1" cy="12.4" r="1.25" />
      <circle cx="14.9" cy="12.4" r="1.25" />
      <path d="M8.2 15.6c1 .85 2.35 1.28 3.8 1.28s2.8-.43 3.8-1.28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17.9" cy="8.2" r="1.6" />
      <path d="M12 8.4 12.9 4.5l3.3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ShareLinks({ title, slug }: { title: string; slug: string }) {
  // The reader must share the page they are actually looking at. A hardcoded
  // domain hands out production links from preview deploys and localhost.
  const origin = useSyncExternalStore(subscribeToNothing, clientOrigin, serverOrigin);
  const url = `${origin}/posts/${slug}`;

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    {
      name: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      Glyph: XGlyph,
    },
    {
      name: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      Glyph: WhatsAppGlyph,
    },
    {
      name: "Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      Glyph: RedditGlyph,
    },
  ];

  return (
    <div className="share">
      <span className="share__label">Share on:</span>
      <ul className="share__list">
        {targets.map(({ name, href, Glyph }) => (
          <li key={name}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Share "${title}" on ${name}`}
              className="share__link"
            >
              <Glyph />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
