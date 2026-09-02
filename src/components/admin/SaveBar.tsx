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
      className="console-float fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4"
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl bg-navy-950 py-2 pl-4 pr-2 shadow-pop">
        <AlertCircle className="hidden h-4 w-4 shrink-0 text-blue-100 sm:block" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
          Unsaved changes
        </p>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold text-blue-100 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disabled}
          className="c-bevel-primary inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-600/50"
        >
          {saving && <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
