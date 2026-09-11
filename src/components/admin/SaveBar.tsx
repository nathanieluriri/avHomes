"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, RotateCw } from "lucide-react";

/**
 * The unsaved-changes bar.
 *
 * An editor whose only Save sits in the page header is an editor that loses
 * work, and this console made that worse rather than better: the shell puts
 * three effortless exits within reach of that same header (the breadcrumb
 * beside it, the rail, Ctrl+K), and a long form pushes Save hundreds of pixels
 * above the fold. So the bar follows the work instead of the work chasing the
 * bar.
 *
 * PORTALLED TO `document.body`, not fixed inside the page. `.c-sheet` carries a
 * transform for the length of the rise animation, and a transformed ancestor
 * becomes the containing block for a fixed child, which would anchor this bar
 * to the page rather than to the viewport for those 460ms. `console-float` is
 * the class that keeps its shadow through the marketing site's box-shadow
 * reset.
 *
 * `beforeunload` is wired to EXACTLY the condition that shows the bar, so the
 * browser's own "leave site?" prompt and this pill can never disagree about
 * whether anything is at stake. It covers a closed tab or a typed URL; an
 * in-app navigation is deliberately not blocked, because a modal that
 * interrupts every click is worse than a bar that is impossible to miss.
 *
 * ON A PHONE the bar had the opposite problem from the one it was built to
 * solve. It was pinned to the bottom edge of the LAYOUT viewport, which on iOS
 * does not move for the keyboard, so the bar spent every editing session drawn
 * underneath it; the part that was visible sat inside the home indicator's
 * gesture strip; and Discard and Save were two 32px targets 12px apart, which
 * is a mis-tap that throws the work away. All three are addressed here:
 *
 *  - `bottom: var(--c-kb)` lifts the bar over the on-screen keyboard. That
 *    variable is published once by `useKeyboardInset` in the shell and is 0
 *    unless iOS Safari has a keyboard up, so this is not a second correction on
 *    top of Android's `interactiveWidget: "resizes-content"`, where the layout
 *    viewport has already shrunk and the variable stays 0. `bottom` rather than
 *    a transform because the value arrives as a discrete jump rather than as an
 *    animation, and keeping the box where it is painted means the wrapper's
 *    padding, its shadow and the `body:has(.c-savebar)` reserve in console.css
 *    all describe the same rectangle.
 *  - `--safe-b` pads the two buttons out of the gesture strip. While the
 *    keyboard is up that pad is redundant (the keyboard covers the strip) and
 *    it costs an unnoticeable 34px of gap, which is cheaper than teaching every
 *    reader a `max()` expression.
 *  - Below `sm` the pill is a column: the sentence on its own line, the two
 *    buttons in a row of their own at a real 44px with 8px between them. Save
 *    takes the rest of the row so the safe action is the big one and Discard is
 *    a fixed block on the left. From `sm` up the button row is `contents`, so
 *    the desktop pill is the same single flex row it has always been.
 */
export function SaveBar({
  when,
  saving,
  disabled = false,
  onDiscard,
  onSave,
}: {
  /** Dirty. The bar shows on exactly this, and so does the unload prompt. */
  when: boolean;
  saving: boolean;
  /** Blocks Save WITHOUT hiding the bar: a validation problem is something the
   *  bar should show, not something it should vanish over. */
  disabled?: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    if (!when) return;
    function guard(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [when]);

  if (!when || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      /* `pointer-events-none` on the strip, `auto` on the pill. The wrapper runs
         the full width of the viewport and is now two rows tall on a phone, so
         without this it is a dead band across the bottom of every editor that
         eats taps on the content it is only padding away from. */
      className="c-savebar console-float pointer-events-none fixed inset-x-0 bottom-[var(--c-kb)] z-[60] flex justify-center px-3 pt-3 pb-[calc(0.75rem+var(--safe-b))] sm:px-4 sm:pt-4 sm:pb-[calc(1rem+var(--safe-b))]"
    >
      {/* NARROW AND SHORT, never short alone. A phone whose on-screen keyboard
          has eaten most of the window has no height to spend on a sentence the
          operator has already read, so the pill drops to its content width and
          keeps only its two buttons (the icon is already gone below `sm`).
          Height on its own also matches a 1280px desktop window with a docked
          devtools panel under it, or a short split screen, where there is width
          to spare and collapsing the bar would only hide its own status. */}
      <div className="pointer-events-auto flex w-full max-w-lg flex-col gap-2 rounded-2xl bg-plum-950 p-3 shadow-pop sm:flex-row sm:items-center sm:gap-3 sm:py-2 sm:pl-4 sm:pr-2 [@media(max-width:39.99rem)_and_(max-height:30rem)]:w-auto">
        <AlertCircle className="hidden h-4 w-4 shrink-0 text-wine-100 sm:block" aria-hidden="true" />
        {/* `sr-only` rather than `hidden`, so the collapsed pill still announces
            what it is: this is a live region and the sentence is the whole
            announcement. */}
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-white [@media(max-width:39.99rem)_and_(max-height:30rem)]:sr-only">
          Unsaved changes
        </p>
        <div className="flex gap-2 sm:contents">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="c-tap h-11 shrink-0 rounded-lg px-4 text-[13px] font-semibold text-wine-100 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:h-8 sm:px-3"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || disabled}
            data-spotlight="savebar-save"
            className="c-tap c-bevel-primary inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-wine-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-wine-600/50 sm:h-8 sm:flex-none sm:px-3.5"
          >
            {saving && <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
