"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
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

/* ═══════════════════════════════════════════════════════════════ LEAVING ══ */

/** Longer than the stylesheet's way out, so a missed animationend still clears the copy. */
const LEAVE_MS = 400;

/**
 * The way out, played on a copy.
 *
 * React takes the panel out of the document the moment `open` turns false, and
 * most screens go further and stop rendering the sheet at all, so by the time
 * anything could animate there is nothing left. A clone of the DOM as it stood
 * is put back where the panel was, marked `data-leaving`, and the stylesheet
 * runs the rise in reverse on it. Nothing in the copy is live: no handlers, no
 * React, no taps, and it is gone the moment its animation ends.
 */
function leave(node: HTMLElement, scrollTop: number): void {
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.setAttribute("data-leaving", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  for (const video of ghost.querySelectorAll("video")) {
    video.removeAttribute("autoplay");
    video.removeAttribute("src");
  }
  const panel = ghost.querySelector<HTMLElement>(".m-sheet, .m-menu");
  // A drag switched the rise off inline; the copy needs the stylesheet's way out.
  panel?.style.removeProperty("animation");
  panel?.style.removeProperty("transition");
  document.body.appendChild(ghost);
  if (panel) panel.scrollTop = scrollTop;
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    ghost.remove();
  };
  panel?.addEventListener("animationend", done);
  window.setTimeout(done, LEAVE_MS);
}

/**
 * Plays the way out for whatever `root` holds, whenever it closes or unmounts.
 *
 * The copy is made a microtask late, which is still before the browser paints
 * the frame without the panel. The delay is for development, where React mounts,
 * unmounts and mounts every effect once on purpose: a copy made in that first
 * unmount would slide out from under a sheet that had only just opened.
 */
export function useLeave(
  root: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  const pending = useRef<object | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    // Only a re-run while still open cancels a copy: closing re-runs this too, and must not.
    pending.current = null;
    const node = root.current;
    const body = panel.current;
    if (!node) return;
    let scrollTop = 0;
    const onScroll = () => {
      scrollTop = body?.scrollTop ?? 0;
    };
    body?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body?.removeEventListener("scroll", onScroll);
      const token = {};
      pending.current = token;
      queueMicrotask(() => {
        if (pending.current === token) leave(node, scrollTop);
      });
    };
  }, [open, root, panel]);
}

/* ══════════════════════════════════════════════════════════════ SWIPING ══ */

/** Controls whose own vertical movement a pull must not take. */
const KEEPS_TOUCH = "textarea, input, select, [data-keeps-touch]";

/**
 * Pulling the panel down closes it, as every native sheet does.
 *
 * The gesture is only taken from the top: while the panel's own content is
 * scrolled, a downward pull is the scroll coming back, and the panel does not
 * move until it is at the top again. Sideways movement is left to a rail or a
 * slider inside. The panel follows the finger, then springs back or leaves
 * from wherever it was let go, which is what `--m-drag` carries to the way out.
 */
export function useSwipeDown(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    if (!node) return;
    let startX = 0;
    let startY = 0;
    let prevY = 0;
    let prevT = 0;
    let lastY = 0;
    let lastT = 0;
    let armed = false;
    let dragging = false;
    const settle = () => {
      node.style.transition = "";
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        armed = false;
        return;
      }
      startX = touch.clientX;
      startY = prevY = lastY = touch.clientY;
      prevT = lastT = event.timeStamp;
      const target = event.target instanceof Element ? event.target : null;
      armed = node.scrollTop <= 0 && !target?.closest(KEEPS_TOUCH);
      dragging = false;
    };
    const onMove = (event: TouchEvent) => {
      if (!armed) return;
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        armed = false;
        return;
      }
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!dragging) {
        if (dy < 10) {
          if (dy < -6 || Math.abs(dx) > 10) armed = false;
          return;
        }
        if (Math.abs(dx) > dy) {
          armed = false;
          return;
        }
        dragging = true;
        // The rise's finished frame holds `transform: none` over anything set inline.
        node.style.animation = "none";
        node.style.transition = "none";
      }
      event.preventDefault();
      const pull = Math.max(0, dy);
      node.style.setProperty("--m-drag", `${pull}px`);
      node.style.transform = `translateY(${pull}px)`;
      prevY = lastY;
      prevT = lastT;
      lastY = touch.clientY;
      lastT = event.timeStamp;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      armed = false;
      const pull = Math.max(0, lastY - startY);
      const speed = (lastY - prevY) / Math.max(1, lastT - prevT);
      if (pull > Math.min(160, node.offsetHeight * 0.35) || (speed > 0.5 && pull > 24)) {
        close();
        return;
      }
      node.style.transition = "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)";
      node.style.transform = "";
      node.style.removeProperty("--m-drag");
      node.addEventListener("transitionend", settle, { once: true });
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
      node.removeEventListener("transitionend", settle);
    };
  }, [open, panel]);
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
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panel);
  useLeave(root, panel, open);
  useSwipeDown(panel, open, onClose);

  if (!open || !mounted) return null;

  return createPortal(
    <div ref={root} className={(paper ?? inherited) ? "m-float m-paper" : "m-float"}>
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
