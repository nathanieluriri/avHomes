"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

interface GalleryProps {
  images: string[];
  title: string;
}

export default function Gallery({ images, title }: GalleryProps) {
  const count = images.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isOpen = openIndex !== null;

  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreIndexRef = useRef<number | null>(null);

  const openAt = (index: number) => {
    restoreIndexRef.current = index;
    setOpenIndex(index);
  };
  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) =>
        current === null ? current : (current + delta + count) % count
      ),
    [count]
  );

  // Lock body scroll, move focus into the dialog, wire up keyboard nav while
  // open, and restore scroll and focus to the triggering thumbnail on close.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    // Captured now so cleanup does not read a ref that may have changed.
    const triggers = triggerRefs.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const restoreIndex = restoreIndexRef.current;
      if (restoreIndex !== null) triggers[restoreIndex]?.focus();
    };
  }, [isOpen, close, step]);

  if (count === 0) return null;

  const rest = images.slice(1);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <button
          type="button"
          ref={(el) => {
            triggerRefs.current[0] = el;
          }}
          onClick={() => openAt(0)}
          aria-label={`Open photo 1 of ${count}`}
          className="group relative block h-[300px] w-full overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:h-[560px]"
        >
          <Image
            src={images[0]}
            alt={`${title} photo 1 of ${count}`}
            fill
            priority
            sizes="(min-width: 1024px) 66vw, 100vw"
            className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
          />
          <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-navy-950 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        </button>

        <div
          className="grid gap-3 md:h-[560px]"
          style={{ gridTemplateRows: `repeat(${rest.length}, 1fr)` }}
        >
          {rest.map((src, i) => (
            <button
              key={src + i}
              type="button"
              ref={(el) => {
                triggerRefs.current[i + 1] = el;
              }}
              onClick={() => openAt(i + 1)}
              aria-label={`Open photo ${i + 2} of ${count}`}
              className="group relative block h-[220px] w-full overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:h-auto"
            >
              <Image
                src={src}
                alt={`${title} photo ${i + 2} of ${count}`}
                fill
                sizes="(min-width: 1024px) 34vw, 100vw"
                className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
              />
              <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-navy-950 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} gallery`}
          className="fixed inset-0 z-[100] bg-navy-950/95"
          onClick={close}
        >
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close gallery"
            className="absolute right-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors duration-200 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous photo"
                className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors duration-200 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next photo"
                className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors duration-200 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}

          <div
            className="relative flex h-full w-full items-center justify-center p-6 md:p-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full w-full max-w-5xl">
              <Image
                src={images[openIndex]}
                alt={`${title} photo ${openIndex + 1} of ${count}`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>

          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            {openIndex + 1} / {count}
          </div>
        </div>
      )}
    </>
  );
}
