import type { SpotlightPlacement } from "@/lib/admin/spotlight-steps";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius of the cutout. */
  r: number;
}

/**
 * `*` matches exactly one segment, so `/admin/posts/*` is not `/admin/posts/1/advanced`.
 * With `record`, the first `*` must be that id: a tour bound to the draft it made.
 */
export function matchPath(pattern: string, pathname: string, record?: string): boolean {
  const want = pattern.split("/").filter(Boolean);
  const have = pathname.split("/").filter(Boolean);
  if (want.length !== have.length) return false;
  const bound = record ? want.indexOf("*") : -1;
  return want.every(
    (segment, index) => (segment === "*" && (index !== bound || have[index] === record)) || segment === have[index],
  );
}

/** The segment the first `*` stands for in `pathname`, such as the id a create just opened. */
export function wildcardOf(pattern: string, pathname: string): string | undefined {
  if (!matchPath(pattern, pathname)) return undefined;
  const at = pattern.split("/").filter(Boolean).indexOf("*");
  return at < 0 ? undefined : pathname.split("/").filter(Boolean)[at];
}

/** `pattern` with its `*` filled in, for a link back to the bound record. */
export function fillPath(pattern: string, record: string): string {
  return pattern.replace("*", encodeURIComponent(record));
}

/** The first match that is actually laid out: a DataTable draws each row twice and hides one copy by breakpoint. */
export function findAnchor(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-spotlight="${name}"]`);
  for (const element of all) {
    if (element.closest("[data-spotlight-root]")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (getComputedStyle(element).visibility === "hidden") continue;
    return element;
  }
  return null;
}

const SINGLE_LINE = new Set(["", "text", "search", "email", "url", "tel", "number", "password"]);

export function isSingleLine(node: Element): boolean {
  return node instanceof HTMLInputElement && SINGLE_LINE.has(node.type);
}

/** Something being typed into, which the tour never pulls focus out of. */
export function isEditable(node: Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return node.isContentEditable || node instanceof HTMLTextAreaElement || isSingleLine(node);
}

/** Where focus goes when the tour's own card closes under it: the console's content, never a control. */
export function landFocus() {
  document.getElementById("c-content")?.focus({ preventScroll: true });
}

export function isLive(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/** A square wrapper hugging one rounded child, such as a pill button in a layout span, takes the child's corners. */
function radiusOf(element: HTMLElement, rect: DOMRect): number {
  const own = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  if (own > 0 || element.childElementCount !== 1) return own;
  const child = element.firstElementChild as HTMLElement;
  const inner = child.getBoundingClientRect();
  const hugs =
    Math.abs(inner.left - rect.left) < 1.5 &&
    Math.abs(inner.top - rect.top) < 1.5 &&
    Math.abs(inner.width - rect.width) < 1.5 &&
    Math.abs(inner.height - rect.height) < 1.5;
  return hugs ? parseFloat(getComputedStyle(child).borderTopLeftRadius) || 0 : own;
}

/** The element's own box, grown by `pad`, with a radius that follows its corners. */
export function boxOf(element: HTMLElement, pad: number): Box {
  const rect = element.getBoundingClientRect();
  const own = radiusOf(element, rect);
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  return {
    x: rect.left - pad,
    y: rect.top - pad,
    w,
    h,
    r: Math.min(own + pad, w / 2, h / 2),
  };
}

/** Pulled inside the window by `inset`, so a highlight on something wider than the screen keeps all four edges in view. */
export function clampBox(box: Box, view: { w: number; h: number }, inset = 3): Box {
  const x = Math.max(box.x, inset);
  const y = Math.max(box.y, inset);
  const right = Math.min(box.x + box.w, view.w - inset);
  const bottom = Math.min(box.y + box.h, view.h - inset);
  if (x === box.x && y === box.y && right === box.x + box.w && bottom === box.y + box.h) return box;
  // Only a box that really crosses an edge is pulled in; one scrolled fully off screen keeps its place.
  if (right <= x || bottom <= y) return box;
  const w = right - x;
  const h = bottom - y;
  return { x, y, w, h, r: Math.min(box.r, w / 2, h / 2) };
}

/** The smallest box holding all of them. */
export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y, r: 0 };
}

export function sameBox(a: Box | null, b: Box | null, tolerance = 0.5): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.w - b.w) < tolerance &&
    Math.abs(a.h - b.h) < tolerance
  );
}

/** `k` of the way from one box to the other. */
export function mix(from: Box, to: Box, k: number): Box {
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    w: from.w + (to.w - from.w) * k,
    h: from.h + (to.h - from.h) * k,
    r: from.r + (to.r - from.r) * k,
  };
}

export interface Placement {
  side: SpotlightPlacement;
  x: number;
  y: number;
  /** Where the caret sits along the facing edge, in px from the card's own origin. */
  caret: number;
  /** No side had room, so the card was pushed inside the window and may overlap the anchor. */
  squeezed: boolean;
}

export const GAP = 14;
export const MARGIN = 12;

/**
 * Beside the anchor, on the first side where the whole card fits. When none
 * does (an anchor that fills the window) the side with the most room wins and
 * the card is held inside the viewport, overlapping as little as it can.
 *
 * `anchor` is everything the card must stay off, which for a step with extra
 * highlights is their union; `aim` is the one the caret points at.
 */
export function place(
  anchor: Box,
  card: { w: number; h: number },
  view: { w: number; h: number },
  preferred?: SpotlightPlacement,
  aim: Box = anchor,
): Placement {
  const order: SpotlightPlacement[] = ["bottom", "top", "right", "left"];
  const sides = preferred ? [preferred, ...order.filter((side) => side !== preferred)] : order;

  const cx = aim.x + aim.w / 2;
  const cy = aim.y + aim.h / 2;
  const clampX = (x: number) => clamp(x, MARGIN, view.w - card.w - MARGIN);
  const clampY = (y: number) => clamp(y, MARGIN, view.h - card.h - MARGIN);

  const at = (side: SpotlightPlacement): Placement => {
    switch (side) {
      case "bottom": {
        const x = clampX(cx - card.w / 2);
        return { side, x, y: anchor.y + anchor.h + GAP, caret: cx - x, squeezed: false };
      }
      case "top": {
        const x = clampX(cx - card.w / 2);
        return { side, x, y: anchor.y - GAP - card.h, caret: cx - x, squeezed: false };
      }
      case "right": {
        const y = clampY(cy - card.h / 2);
        return { side, x: anchor.x + anchor.w + GAP, y, caret: cy - y, squeezed: false };
      }
      case "left": {
        const y = clampY(cy - card.h / 2);
        return { side, x: anchor.x - GAP - card.w, y, caret: cy - y, squeezed: false };
      }
    }
  };

  const fits = (p: Placement) =>
    p.x >= MARGIN - 0.5 &&
    p.y >= MARGIN - 0.5 &&
    p.x + card.w <= view.w - MARGIN + 0.5 &&
    p.y + card.h <= view.h - MARGIN + 0.5;

  for (const side of sides) {
    const p = at(side);
    if (fits(p)) return p;
  }

  const room: Record<SpotlightPlacement, number> = {
    bottom: view.h - (anchor.y + anchor.h),
    top: anchor.y,
    right: view.w - (anchor.x + anchor.w),
    left: anchor.x,
  };
  const side = order.reduce((best, next) => (room[next] > room[best] ? next : best), order[0]);
  const p = at(side);
  return { ...p, x: clampX(p.x), y: clampY(p.y), squeezed: true };
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
