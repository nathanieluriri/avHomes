"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The client strip.
 *
 * Logos, not names set in the body face. A row of wordmarks all sharing our own
 * typeface reads as a list we typed, which is the one thing a proof strip must
 * not look like. A real mark is the evidence.
 *
 * Grey at rest and colour under the pointer, and the strip stops while it is
 * hovered. Five marks in five different brand palettes, all lit at once and all
 * sliding past, is the loudest band on the page competing with the thing it is
 * supposed to support. Desaturated they read as one texture; colour then means
 * "this is the one you are looking at" rather than being the default state.
 *
 * `logo` names a file that MAY NOT BE THERE YET, and that is deliberate: a
 * missing file falls back to the wordmark this component used to render, so the
 * page is never broken by an asset that has not been supplied, and dropping the
 * file in is the whole of the work.
 */

interface Client {
  name: string;
  /** A file in `public/brand/clients/`. Anything the browser draws is fine. */
  logo: string;
}

const CLIENTS: readonly Client[] = [
  { name: "Sahara Group", logo: "/brand/clients/sahara-group.png" },
  { name: "Comfort Agba Foundation", logo: "/brand/clients/comfort-agba-foundation.png" },
  { name: "Greenville LNG", logo: "/brand/clients/greenville-lng.png" },
  { name: "Lenzo Homes", logo: "/brand/clients/lenzo-homes.png" },
  { name: "Up Ltd", logo: "/brand/clients/up-ltd.png" },
];

export default function LogoMarquee() {
  return (
    <section className="border-y border-mist-200 bg-mist-50 py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <p className="text-center text-xs uppercase tracking-[0.18em] text-slate-500">
          Trusted by leading brands and visionary homeowners
        </p>

        <div
          className="relative mt-6 overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div className="marquee-track animate-marquee items-center">
            {[0, 1].map((rep) => (
              <div
                key={rep}
                aria-hidden={rep === 1 ? "true" : undefined}
                className="flex shrink-0 items-center gap-10 pl-10"
              >
                {CLIENTS.map((client) => (
                  <span key={client.name} className="flex shrink-0 items-center gap-10">
                    <ClientLogo client={client} />
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-wine-600"
                      aria-hidden="true"
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
      <span className="whitespace-nowrap text-lg font-semibold text-slate-500 transition-colors duration-300 hover:text-plum-950">
        {client.name}
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
      className="h-8 w-auto max-w-40 shrink-0 object-contain opacity-70 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0 pointer-coarse:opacity-100 pointer-coarse:grayscale-0"
      onError={() => setMissing(true)}
    />
  );
}
