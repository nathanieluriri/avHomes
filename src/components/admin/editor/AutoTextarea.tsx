"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A textarea that grows with its content. No scrollbar, no fixed rows.
 *
 * The title is a textarea rather than an input because a long title has to wrap
 * rather than scroll sideways: a writer must be able to see the whole thing
 * while they are choosing it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MEASURING IS THE WHOLE DIFFICULTY, AND IT HAS TO HAPPEN AFTER LAYOUT.
 *
 * Reading `scrollHeight` straight from an effect measured a title at 1290px and
 * a one-line subtitle at 462px, and the wrong value STUCK: the inline height is
 * what the next measurement resets from, so a single bad reading is permanent
 * and it pushed the entire document below the fold.
 *
 * Three things make the reading trustworthy:
 *
 *   1. It runs inside requestAnimationFrame, after the browser has laid out.
 *   2. It runs again when webfonts finish loading. These fields are set in a
 *      serif that is not preloaded on this route, and a metric swap under a
 *      measured element changes the height it needed.
 *   3. A ResizeObserver re-measures when the column width changes, because
 *      wrapping is what decides the line count.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  maxLength,
  ariaLabel,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  ariaLabel: string;
  /** Enter moves to the next field rather than inserting a newline. */
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Reset first: without it the box only ever grows, because the scrollHeight
    // of an already-tall element never reports the smaller size it now needs.
    el.style.height = "auto";
    const next = el.scrollHeight;
    // A zero reading means the element is not laid out yet (hidden, or measured
    // before its first paint). Leaving it alone beats writing a collapsed box.
    if (next > 0) el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // After layout, not during the commit that queued this effect.
    const frame = requestAnimationFrame(measure);

    // The serif on these fields is not preloaded on the admin routes, so the
    // first measurement can happen against a fallback with different metrics.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    // Wrapping decides the line count, so a width change is a height change.
    const observer = new ResizeObserver(() => measure());
    if (el.parentElement) observer.observe(el.parentElement);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, measure]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      spellCheck
      onChange={(e) => {
        onChange(e.target.value);
        // Measured synchronously too, so typing never lags the box by a frame.
        measure();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
}
