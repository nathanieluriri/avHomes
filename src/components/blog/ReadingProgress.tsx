"use client";

import { useEffect, useRef } from "react";

/**
 * How far through the article the reader is, drawn as a column of marks beside
 * the text and as a hairline across the top of narrow screens.
 *
 * DECORATION, and marked as such. The scrollbar already tells an assistive
 * technology where the page is, and a progressbar whose value changes on every
 * scroll frame is a screen reader talking over the article it is measuring. So
 * the whole thing is `aria-hidden` and carries no role.
 */

/** Marks in the column. Enough to read as a scale, few enough to stay quiet. */
const TICKS = 32;

/**
 * Under this much scrollable article, the indicator hides itself.
 *
 * A short post fits on one screen, so its progress is 0 and then 1 with nothing
 * in between: a rail that only ever shows empty or full is furniture that
 * reports nothing.
 */
const MIN_SCROLLABLE_PX = 320;

export default function ReadingProgress({
  /** The element being read. Every template renders exactly one `.tpl`. */
  target = ".tpl",
}: {
  target?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const article = document.querySelector<HTMLElement>(target);
    if (!el || !article) return;

    /** Document offset of the article's top edge. */
    let top = 0;
    /** Scroll distance between "top of article at top of screen" and "bottom at bottom". */
    let span = 0;
    let frame = 0;

    /*
     * Bounds are read on LAYOUT changes only, never per scroll.
     *
     * getBoundingClientRect forces a synchronous layout, and calling it from a
     * scroll handler does that on every frame of every scroll. Reading it here
     * and doing arithmetic in the handler is the difference between a rail that
     * is free and one that makes the article stutter on a mid-range phone.
     */
    const measure = () => {
      const rect = article.getBoundingClientRect();
      top = rect.top + window.scrollY;
      span = rect.height - window.innerHeight;
      el.toggleAttribute("data-idle", span < MIN_SCROLLABLE_PX);
    };

    /*
     * Writes ONE custom property and nothing else.
     *
     * Every mark's opacity and width is a calc over `--read` and its own index,
     * so 32 marks and the top bar all move from a single style write. Setting
     * React state here would re-render the component tree on every frame for a
     * value no component reads.
     */
    const paint = () => {
      frame = 0;
      const read = span > 0 ? (window.scrollY - top) / span : 0;
      el.style.setProperty("--read", String(Math.min(1, Math.max(0, read))));
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(paint);
    };

    const remeasure = () => {
      measure();
      schedule();
    };

    measure();
    paint();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);

    /*
     * The article's height is not settled at mount. A cover image without
     * intrinsic dimensions, an embed, or a web font swapping in all change it
     * AFTER this effect runs, and bounds measured before that describe an
     * article that no longer exists.
     */
    const observer = new ResizeObserver(remeasure);
    observer.observe(article);
    // Fonts land outside the observed box when they only reflow inline text.
    document.fonts?.ready.then(remeasure).catch(() => {});

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      observer.disconnect();
    };
  }, [target]);

  return (
    // pointer-events: none in the stylesheet. This is a full-viewport fixed
    // layer, and without it the whole page would be unclickable.
    <div ref={root} className="rail" aria-hidden="true">
      <div className="rail__bar">
        <span className="rail__fill" />
      </div>
      <div className="rail__ticks">
        {Array.from({ length: TICKS }, (_, i) => (
          <span key={i} className="rail__tick" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
