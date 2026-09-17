/**
 * The app's own illustrations, drawn here rather than shipped as files.
 *
 * Four flat shapes in wine tints, no faces and no emoji. They exist because an
 * empty screen is the first thing a new marketer sees on most of this app, and
 * a grey ring with an icon in it is what the owner sent back. Each one is built
 * from the palette tokens, so a change to the brand red reaches them.
 */

const WRAP = "h-auto w-full";

/** Deals: a house with a tag on it. */
export function HouseArt() {
  return (
    <svg viewBox="0 0 132 108" className={WRAP} aria-hidden focusable="false">
      <ellipse cx="66" cy="96" rx="48" ry="7" fill="var(--wine-100)" />
      <path d="M22 50 66 18l44 32v40a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4Z" fill="var(--wine-50)" />
      <path
        d="M14 52 66 13l52 39"
        fill="none"
        stroke="var(--wine-600)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 52v38a4 4 0 0 0 4 4h80a4 4 0 0 0 4-4V52"
        fill="none"
        stroke="var(--wine-600)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="55" y="66" width="22" height="28" rx="3" fill="var(--wine-600)" />
      <rect x="32" y="60" width="16" height="14" rx="3" fill="var(--wine-300)" />
      <rect x="84" y="60" width="16" height="14" rx="3" fill="var(--wine-300)" />
      <circle cx="104" cy="28" r="13" fill="var(--wine-500)" />
      <path
        d="m98 28 4.5 4.5L110 24"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Money: a bank card with a note behind it. */
export function PayArt() {
  return (
    <svg viewBox="0 0 132 108" className={WRAP} aria-hidden focusable="false">
      <ellipse cx="66" cy="96" rx="46" ry="7" fill="var(--wine-100)" />
      <rect
        x="24"
        y="20"
        width="84"
        height="48"
        rx="8"
        fill="var(--wine-50)"
        stroke="var(--wine-300)"
        strokeWidth="4"
      />
      <rect x="16" y="36" width="92" height="52" rx="9" fill="var(--wine-600)" />
      <rect x="16" y="48" width="92" height="9" fill="var(--wine-700)" />
      <rect x="26" y="68" width="30" height="7" rx="3.5" fill="var(--wine-300)" />
      <circle cx="88" cy="72" r="8" fill="var(--wine-300)" />
      <circle cx="78" cy="72" r="8" fill="#fff" opacity="0.45" />
    </svg>
  );
}

/** Team: one person with two under them, which is the shape of the levels. */
export function TeamArt() {
  return (
    <svg viewBox="0 0 132 108" className={WRAP} aria-hidden focusable="false">
      <ellipse cx="66" cy="98" rx="44" ry="6" fill="var(--wine-100)" />
      <path
        d="M66 40v16M66 56H34v12M66 56h32v12"
        fill="none"
        stroke="var(--wine-300)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="66" cy="24" r="17" fill="var(--wine-600)" />
      <circle cx="66" cy="20" r="6" fill="#fff" />
      <path d="M55 34a11 11 0 0 1 22 0Z" fill="#fff" />
      <circle cx="34" cy="80" r="14" fill="var(--wine-50)" stroke="var(--wine-500)" strokeWidth="4" />
      <circle cx="34" cy="76" r="5" fill="var(--wine-500)" />
      <path d="M25 88a9 9 0 0 1 18 0Z" fill="var(--wine-500)" />
      <circle cx="98" cy="80" r="14" fill="var(--wine-50)" stroke="var(--wine-500)" strokeWidth="4" />
      <circle cx="98" cy="76" r="5" fill="var(--wine-500)" />
      <path d="M89 88a9 9 0 0 1 18 0Z" fill="var(--wine-500)" />
    </svg>
  );
}

/** Search with nothing in it: a magnifier over a flat plan. */
export function SearchArt() {
  return (
    <svg viewBox="0 0 132 108" className={WRAP} aria-hidden focusable="false">
      <rect x="20" y="22" width="76" height="60" rx="8" fill="var(--wine-50)" />
      <rect x="32" y="36" width="40" height="6" rx="3" fill="var(--wine-300)" />
      <rect x="32" y="50" width="52" height="6" rx="3" fill="var(--wine-100)" />
      <rect x="32" y="64" width="30" height="6" rx="3" fill="var(--wine-100)" />
      <circle
        cx="88"
        cy="66"
        r="21"
        fill="#fff"
        stroke="var(--wine-600)"
        strokeWidth="5"
      />
      <path
        d="m103 81 11 11"
        stroke="var(--wine-600)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
