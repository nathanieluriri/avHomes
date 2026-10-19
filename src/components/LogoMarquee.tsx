"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The client strip.
 *
 * Logos, not names set in the body face. A row of wordmarks all sharing our own
 * typeface reads as a list we typed, which is the one thing a proof strip must
 * not look like. A real mark is the evidence.
 *
 * Full colour on white cards, with the name under each. A handful sit centred
 * and still; past that they scroll, and the scroll pauses under the pointer.
 *
 * `logo` names a file that MAY NOT BE THERE YET, and that is deliberate: a
 * missing file falls back to the wordmark this component used to render, so the
 * page is never broken by an asset that has not been supplied, and dropping the
 * file in is the whole of the work.
 */

interface Client {
  name: string;
  /** An uploaded image. Empty is filtered out before this component sees it. */
  logo: string;
}

/**
 * NAMES COME FROM SETTINGS, not from a constant in this file.
 *
 * The list used to be hardcoded against five files in `public/brand/clients/`
 * that were never added, so the band rendered as plain scrolling text on the
 * one section of the homepage whose entire job is credibility. Worse, it named
 * five companies the site could not show. Now an empty list renders NOTHING:
 * a missing section is invisible, and an empty one is an admission.
 */
/* Up to this many sit still, centred. A scroller showing four logos is mostly empty track. */
const STILL_MAX = 6;

export default function LogoMarquee({ clients }: { clients: readonly Client[] }) {
  if (clients.length === 0) return null;
  const still = clients.length <= STILL_MAX;
  /* Each half of the track must be wider than the screen, or the loop shows a gap. */
  const half = still ? [] : Array.from({ length: Math.ceil(12 / clients.length) }, () => clients).flat();

  return (
    <section className="border-y border-mist-200 bg-mist-50 py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">Our clients</p>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
          Trusted by leading brands and visionary homeowners
        </h2>

        {still ? (
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-6">
            {clients.map((client) => (
              <li key={client.name}>
                <ClientCard client={client} />
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="group relative mt-10 overflow-hidden"
            style={{
              maskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
            }}
          >
            <div className="marquee-track animate-marquee group-hover:[animation-play-state:paused]">
              {[0, 1].map((rep) => (
                <ul key={rep} aria-hidden={rep === 1 ? "true" : undefined} className="flex shrink-0 gap-6 pr-6">
                  {half.map((client, i) => (
                    <li key={`${client.name}-${i}`}>
                      <ClientCard client={client} />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ClientCard({ client }: { client: Client }) {
  return (
    <figure className="flex h-36 w-full min-w-40 flex-col items-center justify-center gap-3 rounded-2xl border border-mist-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md sm:h-40 sm:w-52 sm:min-w-0">
      <div className="flex h-20 w-full items-center justify-center">
        <ClientLogo client={client} />
      </div>
      <figcaption className="line-clamp-1 text-center text-[13px] font-semibold text-plum-950">{client.name}</figcaption>
    </figure>
  );
}

/**
 * One mark, or its name if the file is not there.
 *
 * The fallback is what makes the manifest above safe to write ahead of the
 * assets. Without it a missing file is a broken-image glyph repeated across the
 * strip, which is worse than the plain text it replaced.
 */
function ClientLogo({ client }: { client: Client }) {
  const ref = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);

  /*
   * `onError` ALONE IS NOT ENOUGH, and the gap is the whole reason this exists.
   * The img is server rendered, so the browser starts fetching it while the
   * page is still HTML: a 404 has usually landed before React hydrates, and the
   * error event it fired went to nobody. The handler below then never runs and
   * the strip shows a row of broken-image glyphs, which is the exact failure the
   * fallback was written to prevent. A finished image with no intrinsic width is
   * how that already-failed state reads afterwards.
   */
  useEffect(() => {
    const node = ref.current;
    if (node?.complete && node.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    return (
      <span className="grid h-16 w-16 place-items-center rounded-full bg-wine-50 text-xl font-bold text-wine-700">
        {client.name
          .split(/\s+/u)
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase() ?? "")
          .join("")}
      </span>
    );
  }

  return (
    /*
     * A plain img. These are supplier-provided files of unknown intrinsic size,
     * and `next/image` wants both dimensions up front: normalising on HEIGHT and
     * letting the width follow is the only thing that makes a square mark and a
     * long lockup sit on one line together. `max-w` is the guard for a file that
     * turns out to be a banner.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={client.logo}
      alt={client.name}
      /* Grey and recessive at rest, full colour under the pointer.
         `pointer-coarse` is the touch answer: a phone has no hover to give, so
         holding every mark grey there would be a state with no way out of it. */
      className="max-h-20 w-auto max-w-full object-contain"
      onError={() => setMissing(true)}
    />
  );
}
