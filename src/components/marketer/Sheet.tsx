"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePaper } from "./paper";

/**
 * A panel that rises from the bottom edge, over a scrim.
 *
 * PORTALLED TO document.body. A sheet opened from a card is a `position: fixed`
 * element inside an ancestor that takes a `transform` while it is pressed, and
 * a transformed ancestor becomes the containing block for fixed descendants:
 * the sheet would jump and clip on the exact tap that opened it. `.m-float`
 * carries the app's palette, shadows and focus ring out there with it.
 */

/** Stable identity, or useSyncExternalStore resubscribes on every render. */
const NEVER = () => () => {};

/** False on the server, true once the client owns the tree, so a portal has a document. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getClientRects().length > 0,
  );
}

/**
 * What every modal panel in the app does while it is open: the page behind
 * stops scrolling, Escape closes, Tab stays inside, and focus goes back where
 * it came from (or to `returnTo`) when it closes.
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  panel: RefObject<HTMLElement | null>,
  returnTo?: RefObject<HTMLElement | null>,
): void {
  /* Not a dependency. Callers pass an inline arrow, and re-running this effect
     on every render pulled focus off a field after the first character. */
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = returnTo?.current ?? before;

    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusables(node);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        node.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !node.contains(active);
      if (event.shiftKey && (active === first || active === node || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      if (target && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, panel, returnTo]);
}

export function Sheet({
  open,
  onClose,
  title,
  hint,
  paper,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  /** The light palette. Follows the screen that opened it unless set. */
  paper?: boolean;
  children: ReactNode;
}) {
  const mounted = useMounted();
  const inherited = usePaper();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panel);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={(paper ?? inherited) ? "m-float m-paper" : "m-float"}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="m-scrim block w-full cursor-default"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="m-sheet px-4 pt-3 outline-none"
      >
        <div className="flex justify-center pb-3">
          <span aria-hidden className="m-sheet__grip" />
        </div>
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[19px] font-bold leading-snug text-m-text">
              {title}
            </h2>
            {hint && <p className="mt-1 text-[14px] leading-relaxed text-m-muted">{hint}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="m-press m-tap grid h-9 w-9 shrink-0 place-items-center rounded-full bg-m-raised text-m-muted active:bg-m-line"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
