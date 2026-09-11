"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/admin/client";
import { useIsPhone, useIsTouch } from "@/lib/admin/hooks";
import {
  SPOTLIGHT_TOURS,
  isSpotlightTourId,
  type SpotlightSignal,
  type SpotlightStep,
  type SpotlightTour,
  type SpotlightTourId,
} from "@/lib/admin/spotlight-steps";
import { Button, ButtonLink } from "../ui";
import {
  boxOf,
  clampBox,
  fillPath,
  findAnchor,
  GAP,
  isEditable,
  isLive,
  isSingleLine,
  landFocus,
  MARGIN,
  matchPath,
  mix,
  place,
  sameBox,
  union,
  wildcardOf,
  type Box,
} from "./geometry";
import { SIGNAL_EVENT } from "./signal";
import { NoticeCard, Primary, StepCard, TutorialsLink, type Dock } from "./SpotlightCard";
import { getServerState, getState, setNotice, setRun, startRun, subscribe, trackInput } from "./store";

/**
 * The guided walkthrough that follows a tutorial video.
 *
 * "Try it now" lands on a task screen with `?spotlight=<id>`. From there this
 * dims everything but the next thing to do, says in one line what it is, and
 * moves on when the person actually does it. It never presses anything itself.
 * A last step that is public (Publish) is pointed at, never required; one that
 * is the job itself (sending a reply, saving a note) finishes when the screen
 * reports it done, and its copy says so before they press it.
 *
 * ONE LOOP PER STEP, reading layout once a frame. Observers can say when the
 * anchor resizes but not when something above it pushes it down, a sheet rises
 * under it, or a scroller several levels up moves; one `getBoundingClientRect`
 * per frame catches all of them, costs less than the paint it corrects, and is
 * written straight to the DOM so React never re-renders to follow a scroll.
 *
 * The scrim is drawn but never hit-tested. Clicks are sorted in the capture
 * phase instead: the highlighted element and the next step's element pass,
 * anything else on a click, input or route step is held back with a nudge, and
 * manual and signal steps hold nothing back at all.
 *
 * The scrim holds its level for the whole run, across screens and searches;
 * only the cutout and the card come and go. A tour that creates a record is
 * bound to it: every later step runs on that id and nowhere else.
 */

const PAD = 6;
/** Matches the console's focus outline (2px at 2px offset), so a focused field shows one ring, not two. */
const PAD_FIELD = 4;
/** How long the cutout takes to move from one step's control to the next on the same screen. */
const TWEEN_MS = 180;
const HOLD_MS = 280;
const GRACE_MS = 300;
const PENDING_MS = 60000;
const MAX_EXTRAS = 2;
/** How long bringing an anchor into view takes: quick enough that the highlight is barely gone. */
const GLIDE_MS = 220;
const FADE_MS = 160;
/** The card's width beside a highlight, and the narrowest it may go to stay off one. */
const FULL_W = 320;
const MIN_W = 240;
/** Waits before each attempt to store a completion. */
const SAVE_WAITS = [0, 1000, 3000];

type Phase = "seeking" | "arriving" | "shown" | "missing";

interface View {
  key: string;
  phase: Phase;
  /** The step's screen is not the one open. */
  wrongPage: boolean;
  hasValue: boolean;
  fieldDisabled: boolean;
  pending: boolean;
  /** Another dialog is open, so the spotlight steps out of its way. */
  aside: boolean;
  /** Pointing at the step's detour rather than its anchor. */
  detour: boolean;
  /** The step's `bodyWhen` anchor is on the page. */
  alt: boolean;
  /** The tour's record is proven to be a draft. */
  draft: boolean;
  /** The step's own action came back without the screen reporting success. */
  failed: boolean;
  /** The person is off the record the tour is bound to. */
  left: boolean;
  dock: Dock;
}

const IDLE: View = {
  key: "",
  phase: "seeking",
  wrongPage: false,
  hasValue: false,
  fieldDisabled: false,
  pending: false,
  aside: false,
  detour: false,
  alt: false,
  draft: false,
  failed: false,
  left: false,
  dock: "float",
};

const noop = () => () => {};

function stepOf(id: SpotlightTourId | undefined, index: number): SpotlightStep | undefined {
  return id ? SPOTLIGHT_TOURS[id]?.steps[index] : undefined;
}

function needsWider(tour: SpotlightTour): boolean {
  if (!tour.desktopOnly) return false;
  if (!window.matchMedia("(min-width: 64rem)").matches) return true;
  return Boolean(tour.desktopOnly.fine) && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/** The control a person types into: the anchor itself, or the first one inside it. */
function fieldOf(anchor: HTMLElement): HTMLElement | null {
  if (anchor.matches("input, textarea, select, [contenteditable='true']")) return anchor;
  return anchor.querySelector<HTMLElement>(
    "input:not([type='hidden']):not([type='file']), textarea, select, [contenteditable='true']",
  );
}

function valueOf(field: HTMLElement | null): string {
  if (!field) return "";
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return (field.textContent ?? "").trim();
}

/** A price box starts at "0", which is not a price anybody typed. */
function filled(value: string): boolean {
  return !/^[\s0.,]*$/.test(value);
}

function isInteractive(node: HTMLElement): boolean {
  return (
    node.isContentEditable ||
    Boolean(node.closest("input, textarea, select, button, a[href], summary, [role='button'], [role='textbox']"))
  );
}


const TABBABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), iframe, summary, [contenteditable='true'], [tabindex]";

/** What Tab can land on inside `root`, the root included, in document order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  const all = [root, ...root.querySelectorAll<HTMLElement>(TABBABLE)];
  return all.filter(
    (el) =>
      el.matches(TABBABLE) &&
      el.tabIndex >= 0 &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden",
  );
}

/** A dialog that is not ours and does not hold the anchor, such as the image library or the palette. */
function foreignLayerOpen(anchor: HTMLElement | null): boolean {
  const layers = document.querySelectorAll<HTMLElement>("[role='dialog'], [role='alertdialog']");
  for (const layer of layers) {
    if (layer.closest("[data-spotlight-root]")) continue;
    if (anchor && layer.contains(anchor)) continue;
    const rect = layer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
  }
  return false;
}

interface Glide {
  /** When the scrollers reach where they are going. */
  until: number;
  cancel: () => void;
}

/** Every ancestor that scrolls, the document last. */
function scrollersOf(element: HTMLElement): Element[] {
  const list: Element[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const scrolls = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflowX}`);
    if (scrolls && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) list.push(node);
  }
  const root = document.scrollingElement;
  if (root && !list.includes(root)) list.push(root);
  return list;
}

/**
 * Scrolls the anchor clear of the explanation in a short glide of known length.
 * The browser works out the destination (an instant `scrollIntoView`, read and
 * put back), then every scroller eases there together.
 */
function bringIntoView(
  element: HTMLElement,
  reserve: { top: number; bottom: number },
  reduced: boolean,
): Glide | null {
  const rect = element.getBoundingClientRect();
  const top = reserve.top + 16;
  const bottom = window.innerHeight - reserve.bottom - 16;
  if (rect.top >= top && rect.bottom <= bottom) return null;
  const scrollers = scrollersOf(element);
  const from = scrollers.map((s) => [s.scrollLeft, s.scrollTop] as const);
  const margins = { top: element.style.scrollMarginTop, bottom: element.style.scrollMarginBottom };
  element.style.scrollMarginTop = `${top}px`;
  element.style.scrollMarginBottom = `${reserve.bottom + 16}px`;
  element.scrollIntoView({ block: rect.height > bottom - top ? "start" : "center", inline: "nearest", behavior: "instant" });
  element.style.scrollMarginTop = margins.top;
  element.style.scrollMarginBottom = margins.bottom;
  const to = scrollers.map((s) => [s.scrollLeft, s.scrollTop] as const);
  if (scrollers.every((_, i) => from[i][0] === to[i][0] && from[i][1] === to[i][1])) return null;
  const start = performance.now();
  if (reduced) return { until: start, cancel: () => {} };
  const put = (k: number) =>
    scrollers.forEach((s, i) =>
      s.scrollTo({
        left: from[i][0] + (to[i][0] - from[i][0]) * k,
        top: from[i][1] + (to[i][1] - from[i][1]) * k,
        behavior: "instant",
      }),
    );
  put(0);
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, Math.max(0, now - start) / GLIDE_MS);
    put(1 - Math.pow(1 - t, 3));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    until: start + GLIDE_MS,
    cancel: () => cancelAnimationFrame(raf),
  };
}

function focusedNow(): Element {
  return document.activeElement ?? document.body;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

let saveToken = 0;

/** Stores the completion, retrying with backoff. The card says Done only once the server has it. */
function recordCompletion(id: SpotlightTourId) {
  const token = ++saveToken;
  const settle = (save: "saved" | "failed") => {
    if (token !== saveToken) return;
    const { run, notice } = getState();
    if (notice?.kind === "done" && notice.id === id) setNotice({ ...notice, save });
    // Closed while it was saving: a failure is still said, as long as nothing else has the screen.
    else if (save === "failed" && !notice && !run) setNotice({ kind: "done", id, save });
  };
  void (async () => {
    for (const wait of SAVE_WAITS) {
      if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
      if (token !== saveToken) return;
      try {
        await api.put(`/admin/tutorials/progress/${id}`, { completed: true });
        settle("saved");
        return;
      } catch {
        // Tried again after the next wait.
      }
    }
    settle("failed");
  })();
}

/**
 * Ends the run. Records completion only when no step was passed over for want
 * of its anchor. `already` says the record stopped being a draft first.
 */
function finish(id: SpotlightTourId, already = false) {
  const skipped = getState().run?.skipped === true;
  const active = document.activeElement;
  // Finished from the card, or with nothing focused: the closing card takes focus. From the page, it never does.
  const focus =
    !active || active === document.body || active.id === "c-content" || Boolean(active.closest("[data-spotlight-root]"));
  setRun(null);
  if (skipped) {
    setNotice({ kind: "partial", id });
    return;
  }
  setNotice({ kind: "done", id, save: "saving", already, focus });
  recordCompletion(id);
}

function exit() {
  setRun(null);
  setNotice(null);
}

/** Moves on from step `from`, if it is still the current one. */
function go(from: number, to = from + 1) {
  const run = getState().run;
  if (!run || run.step !== from) return;
  const tour = SPOTLIGHT_TOURS[run.id];
  if (to >= tour.steps.length) {
    finish(run.id);
    return;
  }
  setRun({ ...run, step: to });
}

/** Passes over a step whose anchor could not be found, which costs the run its completion. */
function skip(from: number) {
  const run = getState().run;
  if (!run || run.step !== from) return;
  setRun({ ...run, skipped: true });
  go(from);
}

function complete(from: number) {
  const run = getState().run;
  if (run && run.step === from) finish(run.id);
}

/** Starts a tour from `?spotlight=<id>`, then takes the parameter off the URL without a history entry. */
function Entry() {
  const params = useSearchParams();
  const wanted = params.get("spotlight");

  useEffect(() => {
    if (wanted === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("spotlight");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (!isSpotlightTourId(wanted)) return;
    const tour = SPOTLIGHT_TOURS[wanted];
    if (!needsWider(tour)) {
      startRun(wanted);
      return;
    }
    // The screen already says it needs a wider window, so a second card would only repeat it.
    if (tour.desktopOnly?.gated && matchPath(tour.start, url.pathname)) {
      setRun(null);
      setNotice(null);
      return;
    }
    startRun(wanted, { kind: "narrow", id: wanted });
  }, [wanted]);

  return null;
}

export function Spotlight() {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const { run, notice } = useSyncExternalStore(subscribe, getState, getServerState);
  const pathname = usePathname();
  const router = useRouter();
  const phone = useIsPhone();
  const touch = useIsTouch();
  // Stripped to a plain token, because a `url(#...)` reference does not survive React's punctuation.
  const maskId = `spot-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // The Done notice points at Tutorials; once there it has said its piece.
  useEffect(() => {
    if (pathname === "/admin/tutorials" && notice?.kind === "done") setNotice(null);
  }, [pathname, notice]);

  const tour = run ? SPOTLIGHT_TOURS[run.id] : undefined;
  const step = run ? stepOf(run.id, run.step) : undefined;
  const stepKey = run && step ? `${run.id}:${run.step}` : "";
  const running = run !== null;

  const [view, setView] = useState<View>(IDLE);
  /* A new step inherits the last one's overlay state until its own loop has
     looked, so moving between two fields never blinks the scrim. */
  const v: View =
    view.key === stepKey
      ? view
      : {
          ...view,
          key: stepKey,
          phase: view.phase === "missing" ? "seeking" : view.phase,
          hasValue: false,
          fieldDisabled: false,
          pending: false,
          wrongPage: false,
          detour: false,
          alt: false,
        };

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const holeRefs = useRef<(SVGRectElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** The cutout as last drawn, which the next step glides from. */
  const holeBox = useRef<Box | null>(null);
  /** Whether the last loop left a highlight on screen, and on which screen. */
  const held = useRef<{ page: string; path: string } | null>(null);
  const pendingRef = useRef<{ key: string; since: number } | null>(null);
  /** The step whose signal action came back without success, until it is tried again. */
  const failedRef = useRef<string | null>(null);
  /** The `binds` step whose own anchor was used, which is what lets its route complete it. */
  const armed = useRef<string | null>(null);
  /** Set, to what had focus then, when the person moved on by keyboard or from the card, so the next step takes focus. */
  const focusNext = useRef<Element | null>(null);
  const focusInRoot = useRef(false);
  const nudgeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => trackInput(), []);

  /* A stored tour whose id no longer exists is dropped rather than haunting the session. */
  useEffect(() => {
    if (run && !SPOTLIGHT_TOURS[run.id]) setRun(null);
  }, [run]);

  /* Route steps complete on the pathname, whichever way it changed. One that binds a record needs its own anchor used first. */
  useEffect(() => {
    if (!run || !step || step.advance !== "route" || !step.route) return;
    if (!matchPath(step.route, pathname)) return;
    if (step.binds && armed.current !== stepKey) return;
    focusNext.current = focusedNow();
    if (step.binds) setRun({ ...run, record: wildcardOf(step.route, pathname) });
    go(run.step);
  }, [run, step, stepKey, pathname]);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      focusInRoot.current = event.target instanceof Node && Boolean(rootRef.current?.contains(event.target));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  /* A card that held focus went away under it: focus goes to the page's content, not the document. */
  useEffect(() => {
    if (!focusInRoot.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    focusInRoot.current = false;
    landFocus();
  });

  /* A screen reporting the job done completes its signal step, or any earlier one: Enter in the reply box sends too. */
  useEffect(() => {
    if (!running) return;
    function onSignal(event: Event) {
      const signal = (event as CustomEvent<SpotlightSignal>).detail;
      const current = getState().run;
      if (!current) return;
      const steps = SPOTLIGHT_TOURS[current.id].steps;
      const at = steps.findIndex((s, i) => i >= current.step && s.advance === "signal" && s.signal === signal);
      if (at < 0) return;
      pendingRef.current = null;
      if (steps[at].final || at === steps.length - 1) finish(current.id);
      else setRun({ ...current, step: at + 1 });
    }
    window.addEventListener(SIGNAL_EVENT, onSignal);
    return () => window.removeEventListener(SIGNAL_EVENT, onSignal);
  }, [running]);

  useEffect(() => {
    if (!notice || run) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) setNotice(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, run]);

  /* Before paint, so a step that starts on another screen never shows the last one's cutout for a frame. */
  useLayoutEffect(() => {
    if (!isClient || !stepKey) return;
    const current = getState().run;
    if (!current) return;
    const tourNow = SPOTLIGHT_TOURS[current.id];
    const index = current.step;
    const here = tourNow.steps[index];
    const next = tourNow.steps[index + 1];
    const key = stepKey;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lookahead = here.advance === "input" || here.advance === "manual";
    const holdsNothing = here.advance === "manual" || here.advance === "signal";
    const record = current.record;
    const bindAt = tourNow.steps.findIndex((s) => s.binds);
    // Past its binding step a run is bound even without a record (one stored by an older build), and then to nothing.
    const bound = bindAt >= 0 && index > bindAt && here.page.includes("*");
    const recordPages = bound ? tourNow.steps.filter((s) => s.page.includes("*")).map((s) => s.page) : [];
    const fitsField = here.advance === "input";
    const rings = ringRefs.current;

    const t0 = performance.now();
    const carried = held.current;
    const graceUntil =
      carried && carried.page === here.page && carried.path === window.location.pathname ? t0 + GRACE_MS : t0;

    let local: View = {
      ...IDLE,
      key,
      phase: graceUntil > t0 ? "arriving" : "seeking",
      dock: window.innerWidth < 640 ? "bottom" : "float",
    };
    // The first publish always lands, replacing the state the render carried over from the last step.
    let committed = false;
    const publish = (patch: Partial<View>) => {
      const nextView = { ...local, ...patch };
      const changed = (Object.keys(nextView) as (keyof View)[]).some((k) => nextView[k] !== local[k]);
      if (!changed && committed) return;
      committed = true;
      local = nextView;
      setView(nextView);
    };

    let phase: Phase = "seeking";
    let anchor: HTMLElement | null = null;
    let viaDetour = false;
    let extras: HTMLElement[] = [];
    let seekSince = t0;
    let everShown = false;
    /** The pathname the highlight was last drawn on. A hold never outlives a change of screen. */
    let drawnPath: string | null = null;
    let arriveAt = 0;
    let stable = 0;
    let lastTarget: Box | null = null;
    let tweening = carried !== null && graceUntil > t0;
    let tweenFrom: Box | null = null;
    let tweenAt = 0;
    /** Waiting for the glide that brings the anchor into view, with the cutout closed. */
    let scrolling = false;
    let glide: Glide | null = null;
    /** A later glide that puts back an anchor something pushed or grew: the cutout stays on it, the card waits. */
    let correcting = false;
    /** The anchor's height when its place on screen was last judged. */
    let fitH: number | null = null;
    let notDraftSince = 0;
    let revealed = false;
    /** A narrower card, set when the full one fits beside no side but this one does. */
    let narrowW: number | null = null;
    /** What had focus when the person moved on; the next step takes focus from it once shown. */
    let wantFocus: Element | null = null;
    /** Where Tab came into the card from, so Shift+Tab goes back there. */
    let cameFrom: HTMLElement | null = null;
    let pendSawBusy = false;
    let kb = 0;
    let frames = 0;
    let shownAt = 0;
    let rescrolls = 0;
    let userScrolled = false;
    let raf = 0;
    let stopped = false;

    const hideCard = () => {
      const card = cardRef.current;
      if (card && revealed) card.style.visibility = "hidden";
      revealed = false;
    };

    const draw = (hole: Box | null, more: Box[]) => {
      const boxes = [hole, ...more];
      for (let i = 0; i <= MAX_EXTRAS; i++) {
        const box = boxes[i] ?? null;
        const rect = holeRefs.current[i];
        const ring = ringRefs.current[i];
        const w = box ? Math.max(0, box.w) : 0;
        const h = box ? Math.max(0, box.h) : 0;
        if (rect) {
          rect.setAttribute("x", String(box ? box.x : 0));
          rect.setAttribute("y", String(box ? box.y : 0));
          rect.setAttribute("width", String(w));
          rect.setAttribute("height", String(h));
          rect.setAttribute("rx", String(box ? Math.max(0, box.r) : 0));
        }
        if (ring) {
          ring.style.display = box ? "" : "none";
          if (box) {
            ring.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
            ring.style.width = `${w}px`;
            ring.style.height = `${h}px`;
            ring.style.borderRadius = `${Math.max(0, box.r)}px`;
          }
        }
      }
    };

    const closeHole = () => {
      draw(null, []);
      holeBox.current = null;
    };

    /* A cutout that opens where there was none fades in rather than punching through the scrim. */
    const fadeIn = (count: number) => {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const keys = [{ opacity: 0 }, { opacity: 1 }];
        holeRefs.current[i]?.animate(keys, { duration: FADE_MS, easing: "ease-out" });
        ringRefs.current[i]?.animate(keys, { duration: FADE_MS, easing: "ease-out" });
      }
    };

    if (graceUntil === t0) {
      closeHole();
      publish({});
    }

    /** Input steps fit the control itself, not the label around it. */
    const targetOf = (element: HTMLElement): Box => {
      if (fitsField && !viaDetour) {
        const field = fieldOf(element);
        if (field) return boxOf(field, PAD_FIELD);
      }
      return boxOf(element, PAD);
    };

    const chooseDock = (target: Box, card: HTMLElement): Dock => {
      const vh = window.innerHeight;
      const h = card.offsetHeight;
      const overlap = (top: number, bottom: number) =>
        Math.max(0, Math.min(bottom, target.y + target.h) - Math.max(top, target.y));
      const low = overlap(vh - kb - 8 - h, vh - kb - 8);
      const high = overlap(8, 8 + h);
      if (local.dock === "top") return low < high || low === 0 ? "bottom" : "top";
      return low > 0 && high < low - 4 ? "top" : "bottom";
    };

    /** `target` is what the caret points at; `all` is every highlighted box, which the card keeps off. */
    const placeCard = (target: Box, all: Box) => {
      const card = cardRef.current;
      if (!card) return;
      const wide = window.innerWidth >= 640;
      const dock: Dock = wide ? "float" : chooseDock(all, card);
      if (dock !== local.dock) {
        publish({ dock });
        hideCard();
        return;
      }
      if (card.dataset.dock !== dock) {
        hideCard();
        return;
      }
      if (dock === "float") {
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const full = place(all, { w: FULL_W, h: card.offsetHeight }, vp, here.placement, target);
        const room = Math.floor(Math.max(vp.w - all.x - all.w, all.x) - GAP - MARGIN);
        // Narrowed to the room beside a highlight that nearly fills the window, rather than laid over it.
        const wantW = full.squeezed && room >= MIN_W && room < FULL_W ? room : null;
        if (wantW !== narrowW) {
          narrowW = wantW;
          card.style.width = wantW === null ? "" : `${wantW}px`;
        }
        const size = { w: card.offsetWidth, h: card.offsetHeight };
        let p = place(all, size, vp, here.placement, target);
        if (p.squeezed && all !== target) {
          // No side clears every highlight: keep off the one that matters most.
          const alone = place(target, size, vp, here.placement);
          if (!alone.squeezed) p = alone;
        }
        card.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
        const caret = caretRef.current;
        if (caret) {
          const edge = p.side === "bottom" || p.side === "top" ? card.offsetWidth : card.offsetHeight;
          const at = Math.min(Math.max(p.caret, 18), edge - 18) - 6;
          caret.style.display = p.squeezed ? "none" : "";
          caret.style.left = p.side === "left" ? "" : p.side === "right" ? "-6px" : `${at}px`;
          caret.style.right = p.side === "left" ? "-6px" : "";
          caret.style.top = p.side === "top" ? "" : p.side === "bottom" ? "-6px" : `${at}px`;
          caret.style.bottom = p.side === "top" ? "-6px" : "";
          const ring = "rgb(44 27 31 / 0.07)";
          caret.style.boxShadow =
            p.side === "bottom"
              ? `-1px -1px 0 0 ${ring}`
              : p.side === "top"
                ? `1px 1px 0 0 ${ring}`
                : p.side === "right"
                  ? `-1px 1px 0 0 ${ring}`
                  : `1px -1px 0 0 ${ring}`;
        }
      } else {
        card.style.transform = "";
      }
      if (!revealed) {
        card.style.visibility = "visible";
        revealed = true;
        if (!reduced) {
          const rise = dock === "top" ? "-6px" : "6px";
          innerRef.current?.animate(
            [
              { opacity: 0, transform: `translateY(${rise})` },
              { opacity: 1, transform: "none" },
            ],
            { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          );
        }
      }
    };

    const primary = () =>
      cardRef.current?.querySelector<HTMLElement>("[data-primary] button:not(:disabled)") ?? null;

    /** Where focus goes when the person moved on by keyboard: the field, the card's Next, or the thing to press. */
    const takeFocus = (from: Element) => {
      if (!anchor) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && anchor.contains(active)) return;
      // They have since clicked into another field: never pull them out of it.
      if (active instanceof HTMLElement && active !== from && isEditable(active)) return;
      // A signal step's control does the real thing, so a second Enter must not land on it: the card holds focus.
      const target =
        here.advance === "signal"
          ? cardRef.current?.querySelector<HTMLElement>("[data-card-focus]")
          : fitsField && !viaDetour
            ? fieldOf(anchor)
            : here.advance === "manual"
              ? (primary() ?? tabbables(anchor)[0])
              : tabbables(anchor)[0];
      target?.focus({ preventScroll: true });
    };

    const announce = (text: string) => {
      const node = nudgeRef.current;
      if (!node) return;
      // A trailing space that flips each time, so the same words are read out again.
      node.textContent = node.textContent === text ? `${text} ` : text;
    };

    /* Room kept clear of the explanation: the sheet on a phone, a sticky bar's worth at the top on a desk. */
    const reserve = () =>
      window.innerWidth < 640
        ? { top: 0, bottom: (cardRef.current?.offsetHeight ?? 170) + 8 }
        : { top: 48, bottom: 0 };

    const frame = (now: number) => {
      if (stopped) return;
      frames += 1;
      if (frames % 15 === 1) {
        kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-kb")) || 0;
      }

      const path = window.location.pathname;
      const onPage = bound
        ? record !== undefined && matchPath(here.page, path, record)
        : matchPath(here.page, path);
      const left =
        bound && (record === undefined || !recordPages.some((page) => matchPath(page, path, record)));

      // Nothing to practise on: the run ends, unrecorded, and says why.
      if (onPage && here.none && findAnchor(here.none.anchor)) {
        stopped = true;
        closeHole();
        setRun(null);
        setNotice({ kind: "none", id: current.id, step: index });
        return;
      }

      let found: HTMLElement | null = null;
      let detour = false;
      if (onPage) {
        found = !viaDetour && isLive(anchor) ? anchor : findAnchor(here.anchor);
        if (!found && here.detour) {
          found = findAnchor(here.detour.anchor);
          detour = found !== null;
        }
      }
      if (found && anchor && detour !== viaDetour) {
        // Between the detour and the real anchor: a fresh arrival, with its own words.
        phase = "seeking";
        hideCard();
      }
      anchor = found;
      viaDetour = detour;

      const rec = tourNow.record;
      const notDraft = onPage && rec ? findAnchor(rec.notDraft) !== null : false;
      const draft = onPage && rec && !notDraft ? findAnchor(rec.draft) !== null : false;

      // The record stopped being a draft before its last step: there is nothing left to publish, so the run is done.
      if (here.final && notDraft && !found) {
        if (notDraftSince === 0) notDraftSince = now;
        else if (now - notDraftSince > 250) {
          stopped = true;
          closeHole();
          finish(current.id, true);
          return;
        }
      } else {
        notDraftSince = 0;
      }

      const aside = foreignLayerOpen(anchor);
      const pend = pendingRef.current?.key === key ? pendingRef.current : null;
      publish({
        aside,
        pending: pend !== null,
        detour,
        alt: Boolean(here.bodyWhen && findAnchor(here.bodyWhen.anchor)),
        draft,
        left,
        failed: failedRef.current === key,
      });

      if (pend) {
        if (here.pending?.until === "next" && next && findAnchor(next.anchor)) {
          pendingRef.current = null;
          go(index);
          return;
        }
        if (here.pending?.until === "signal" && anchor instanceof HTMLButtonElement) {
          // The button went busy and came back without the screen reporting success: it failed, so ask again.
          if (anchor.disabled) pendSawBusy = true;
          else if (pendSawBusy) {
            pendSawBusy = false;
            pendingRef.current = null;
            if (here.pending.failed) failedRef.current = key;
          }
        }
        if (now - pend.since > PENDING_MS) pendingRef.current = null;
      }

      if (!anchor) {
        if (phase === "arriving" || phase === "shown") {
          phase = "seeking";
          seekSince = now;
        }
        scrolling = false;
        const lost = now - seekSince;
        if (pend && here.pending?.until === "gone" && lost > HOLD_MS) {
          pendingRef.current = null;
          if (here.final) complete(index);
          else go(index);
          return;
        }
        const holding = (everShown && drawnPath === path && lost < HOLD_MS) || now < graceUntil;
        if (!holding) {
          hideCard();
          if (holeBox.current) closeHole();
          held.current = null;
          tweening = false;
          if (lost > (everShown ? 400 : 700) && onPage && !pend && !here.skipIfMissing && notDraftSince === 0) {
            // What the last click opened is gone (cancelled, or a reload closed it): step back to that click.
            for (let i = index - 1; i >= 0; i--) {
              const earlier = tourNow.steps[i];
              if (earlier.page !== here.page) break;
              if (earlier.advance === "click" && findAnchor(earlier.anchor)) {
                setRun({ ...getState().run!, step: i });
                return;
              }
            }
          }
          if (here.skipIfMissing && onPage && lost > 1200) {
            go(index);
            return;
          }
          // Off the step's screen there is nothing to wait for, only a pathname change to let settle.
          const limit = onPage ? (here.waitMs ?? 6000) : left ? 250 : 500;
          if (lost > limit) {
            publish({ phase: "missing", wrongPage: !onPage });
          } else {
            publish({ phase: "seeking" });
          }
        } else if (graceUntil > t0 && !everShown) {
          publish({ phase: "arriving" });
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      const vp = { w: window.innerWidth, h: window.innerHeight };
      const raw = targetOf(anchor);
      const target = clampBox(raw, vp);

      if (phase === "seeking" || phase === "missing") {
        phase = "arriving";
        arriveAt = now;
        stable = 0;
        lastTarget = null;
        correcting = false;
        glide?.cancel();
        glide = bringIntoView(anchor, reserve(), reduced);
        fitH = raw.h;
        scrolling = glide !== null;
        if (scrolling) {
          // The highlight comes in once, where the anchor lands, never chasing it down the page.
          tweening = false;
          closeHole();
          hideCard();
          publish({ phase: local.phase === "arriving" || local.phase === "shown" ? "arriving" : "seeking", wrongPage: false });
        } else {
          if (!held.current) tweening = false;
          publish({ phase: "arriving", wrongPage: false });
        }
      }

      if (scrolling) {
        stable = lastTarget && sameBox(lastTarget, target) ? stable + 1 : 0;
        lastTarget = target;
        const settled = (glide !== null && now >= glide.until && stable >= 2) || now - arriveAt > 1000;
        if (!settled) {
          raf = requestAnimationFrame(frame);
          return;
        }
        // Already known to be still, so the highlight and the card come in together, this frame.
        scrolling = false;
        glide = null;
        holeBox.current = null;
        tweening = false;
        stable = 3;
        publish({ phase: "arriving" });
      }

      if (correcting && glide && now >= glide.until) {
        correcting = false;
        glide = null;
      }

      extras = (here.also ?? []).map(findAnchor).filter((el): el is HTMLElement => el !== null);
      const extraBoxes = viaDetour ? [] : extras.map((el) => clampBox(boxOf(el, PAD), vp));
      let hole = target;
      if (tweening && holeBox.current && !reduced) {
        // Eased toward wherever the target is this frame, so it lands on time even while the page settles.
        if (!tweenFrom) {
          tweenFrom = holeBox.current;
          tweenAt = now;
        }
        const t = Math.min(1, Math.max(0, now - tweenAt) / TWEEN_MS);
        hole = mix(tweenFrom, target, 1 - Math.pow(1 - t, 3));
        if (t >= 1) {
          hole = target;
          tweening = false;
        }
      } else {
        tweening = false;
      }
      const opening = holeBox.current === null;
      holeBox.current = hole;
      held.current = { page: here.page, path };
      drawnPath = path;
      draw(hole, extraBoxes);
      if (opening) fadeIn(1 + extraBoxes.length);

      const ring = ringRefs.current[0];
      if (ring) {
        // A focused field inside a larger highlight draws its own ring; a second one around it is noise.
        const active = document.activeElement;
        const quiet = !(fitsField && !viaDetour) && active !== null && anchor.contains(active) && isEditable(active);
        ring.style.borderColor = quiet ? "transparent" : "";
      }

      if (phase === "arriving") {
        stable = lastTarget && sameBox(lastTarget, target) ? stable + 1 : 0;
        lastTarget = target;
        if ((stable >= 4 && !tweening) || now - arriveAt > 1000) {
          phase = "shown";
          shownAt = now;
          everShown = true;
          publish({ phase: "shown" });
          const stored = getState().run;
          if (stored && stored.step === index && stored.path !== path) {
            setRun({ ...stored, path });
          }
          if (focusNext.current) {
            wantFocus = focusNext.current;
            focusNext.current = null;
          }
        }
      }

      if (fitsField && !viaDetour) {
        const field = fieldOf(anchor);
        publish({
          hasValue: filled(valueOf(field)),
          fieldDisabled: Boolean(field && (field as HTMLInputElement).disabled),
        });
      }

      /* A photo that finishes loading above the anchor can push it off screen
         after it settled, and an editor that mounts late grows it past the
         bottom. Put back three times at most, never once the person has
         scrolled for themselves or is working inside it. */
      if (
        phase === "shown" &&
        !glide &&
        !userScrolled &&
        rescrolls < 3 &&
        now - shownAt < 4000 &&
        !anchor.contains(document.activeElement)
      ) {
        const visible = Math.min(raw.y + raw.h, vp.h) - Math.max(raw.y, 0);
        const pushed = visible < Math.min(raw.h, 160) * 0.6;
        const grew = fitH !== null && Math.abs(raw.h - fitH) > 24;
        if (pushed || grew) {
          fitH = raw.h;
          glide = bringIntoView(anchor, reserve(), reduced);
          if (glide) {
            rescrolls += 1;
            correcting = true;
            hideCard();
          }
        }
      }

      if (phase === "shown" && !aside && !correcting) {
        const keepOff = [target, ...extraBoxes];
        // The card also keeps off the field's label and helper line, which are read while typing.
        if (fitsField && !viaDetour) keepOff.push(clampBox(boxOf(anchor, 0), vp));
        placeCard(target, keepOff.length > 1 ? union(keepOff) : target);
        if (wantFocus && revealed) {
          takeFocus(wantFocus);
          wantFocus = null;
        }
      } else {
        hideCard();
      }

      raf = requestAnimationFrame(frame);
    };

    const inside = (elements: (HTMLElement | null)[], node: Node) =>
      elements.some((element) => element?.contains(node));

    const nextElements = () =>
      next && lookahead ? [next.anchor, ...(next.also ?? [])].map(findAnchor) : [];

    const classify = (event: MouseEvent): "anchor" | "next" | "free" | "block" => {
      const node = event.target;
      if (!(node instanceof Node)) return "free";
      if (phase !== "shown" || local.aside) return "free";
      if (rootRef.current?.contains(node)) return "free";
      if (anchor?.contains(node)) return "anchor";
      // Before the extras, so a step that also shows the next control lets pressing it move on.
      if (inside(nextElements(), node)) return "next";
      if (inside(extras, node)) return "anchor";
      const box = holeBox.current;
      if (
        box &&
        event.clientX >= box.x &&
        event.clientX <= box.x + box.w &&
        event.clientY >= box.y &&
        event.clientY <= box.y + box.h
      ) {
        return "free";
      }
      if (holdsNothing) return "free";
      return "block";
    };

    const nudge = () => {
      announce(`Held back. Finish this step first: ${here.title}. Press Escape to leave the walkthrough.`);
      const ring = ringRefs.current[0];
      if (reduced) {
        ring?.animate([{ borderColor: "rgb(217 119 6)" }, { borderColor: "rgb(217 119 6)" }], { duration: 420 });
        return;
      }
      ring?.animate(
        [
          { boxShadow: "0 0 0 0 rgb(180 80 105 / 0.5)" },
          { boxShadow: "0 0 0 12px rgb(180 80 105 / 0)" },
        ],
        { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      innerRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(-1.5px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 340, easing: "ease-in-out" },
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (classify(event) === "block") event.stopPropagation();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (classify(event) !== "block") return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      const kind = classify(event);
      if (kind === "block") {
        event.preventDefault();
        event.stopImmediatePropagation();
        nudge();
        return;
      }
      if (kind === "anchor") {
        if (viaDetour) return;
        if (here.advance === "click") {
          // What the click opens may take focus away (a dialog that closes onto nothing): the next step picks it up.
          focusNext.current = focusedNow();
          if (here.pending) {
            pendingRef.current = { key, since: performance.now() };
          } else {
            window.setTimeout(() => go(index), 0);
          }
        } else if (here.advance === "signal" && here.pending) {
          pendSawBusy = false;
          failedRef.current = null;
          pendingRef.current = { key, since: performance.now() };
        } else if (here.final && here.advance === "manual") {
          window.setTimeout(() => complete(index), 0);
        }
        return;
      }
      if (kind === "next" && next) {
        // They went straight to the next thing: the tour follows rather than holding them back.
        if ((next.advance === "click" || next.advance === "signal") && next.pending) {
          // Its wait, and for a signal whether it came back without success, belongs to the step it started.
          failedRef.current = null;
          pendingRef.current = { key: `${current.id}:${index + 1}`, since: performance.now() };
          window.setTimeout(() => go(index), 0);
        } else if (next.advance === "click") {
          window.setTimeout(() => go(index, index + 2), 0);
        } else if (next.final && next.advance === "manual") {
          window.setTimeout(() => complete(index), 0);
        } else {
          window.setTimeout(() => go(index), 0);
        }
      }
    };

    const moveOn = () => {
      focusNext.current = focusedNow();
      if (here.final && here.advance === "manual") complete(index);
      else go(index);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (local.aside || event.defaultPrevented) return;
        exit();
        return;
      }
      if (event.key !== "Enter" || event.isComposing || event.shiftKey || event.altKey || event.defaultPrevented) {
        return;
      }
      if (phase !== "shown" || local.aside || viaDetour) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Where Enter sends for real, the key is the page's alone: the tour neither advances on it nor offers it.
      if (here.enterSends) return;
      if (target && tourNow.steps.some((s) => s.enterSends && findAnchor(s.anchor)?.contains(target))) return;
      if (event.ctrlKey || event.metaKey) {
        // The shortcut the card's Next or Finish advertises, and exactly that, from wherever focus is.
        const lead = primary();
        if (!lead) return;
        event.preventDefault();
        lead.click();
        return;
      }
      if (target && rootRef.current?.contains(target)) return;
      if (here.advance === "manual") {
        if (target && target !== document.body && isInteractive(target)) return;
        event.preventDefault();
        moveOn();
        return;
      }
      // Enter moves on from a one-line field that holds a value.
      if (here.advance === "input" && anchor && target && anchor.contains(target) && isSingleLine(target)) {
        if (!filled(valueOf(fieldOf(anchor)))) return;
        focusNext.current = focusedNow();
        window.setTimeout(() => go(index), 0);
      }
    };

    /* Reaching the next step's control by any means, Tab included, moves on to the step that explains it. */
    const onFocusIn = (event: FocusEvent) => {
      if (phase !== "shown" || local.aside || !lookahead || !next) return;
      const node = event.target;
      if (!(node instanceof Node) || rootRef.current?.contains(node) || anchor?.contains(node)) return;
      if (!inside(nextElements(), node)) return;
      window.setTimeout(() => go(index), 0);
    };

    /* A binding step counts its route only after its own anchor was used, not a Back or a typed address. */
    const arm = (event: Event) => {
      if (!here.binds) return;
      const node = event.target;
      const host = anchor ?? findAnchor(here.anchor);
      if (node instanceof Node && host?.contains(node)) armed.current = key;
    };

    /* Esc in a field closes the walkthrough and nothing else, so a half-typed name survives. A second Esc is the field's own. */
    const onEscapeInField = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || local.aside) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !isEditable(target)) return;
      if (rootRef.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      exit();
    };

    /* The card sits at the end of the page, so Tab is routed as if it followed the
       highlighted element: off its end onto the card's Next, and Shift+Tab straight back. */
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const host = anchor;
      if (phase !== "shown" || local.aside || !host) return;
      const card = cardRef.current;
      if (!card || !revealed) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const lead = primary();
      // Next first, then Back and Skip, and the close button last.
      const inCard = tabbables(card).filter((el) => el !== lead);
      const ring = [
        ...(lead ? [lead] : []),
        ...inCard.filter((el) => !el.hasAttribute("data-close")),
        ...inCard.filter((el) => el.hasAttribute("data-close")),
      ];

      if (active && card.contains(active)) {
        const at = ring.indexOf(active);
        if (at < 0 && !event.shiftKey && ring.length > 0) {
          // The card itself holds focus: Tab starts on its first action.
          event.preventDefault();
          ring[0].focus();
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
          if (at > 0) ring[at - 1].focus();
          else {
            const back =
              cameFrom && cameFrom.isConnected && host.contains(cameFrom)
                ? cameFrom
                : fitsField && !viaDetour
                  ? fieldOf(host)
                  : (tabbables(host)[0] ?? null);
            back?.focus({ preventScroll: true });
          }
          return;
        }
        if (at >= 0 && at < ring.length - 1) {
          event.preventDefault();
          ring[at + 1].focus();
          return;
        }
        // Off the end of the card: on to whatever follows the highlight in the page.
        const after = tabbables(document.body).find(
          (el) =>
            !host.contains(el) &&
            !rootRef.current?.contains(el) &&
            Boolean(host.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
        if (after) {
          event.preventDefault();
          after.focus();
        }
        return;
      }

      if (event.shiftKey) return;
      if (!active || active === document.body || active.id === "c-content") {
        // Nothing focused yet, or only the content a navigation just focused: start at the thing the step is about.
        const first = fitsField && !viaDetour ? fieldOf(host) : tabbables(host)[0];
        const land = first ?? lead;
        if (land) {
          event.preventDefault();
          land.focus({ preventScroll: true });
        }
        return;
      }
      // Off the end of the highlighted element: into the card, as if it sat right after it.
      if (ring.length === 0 || !host.contains(active)) return;
      const own = tabbables(host);
      if (own.length > 0 && active !== own[own.length - 1]) return;
      event.preventDefault();
      cameFrom = active;
      ring[0].focus({ preventScroll: true });
    };

    const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);
    const onUserScroll = (event: Event) => {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      userScrolled = true;
      // Their hand wins over the glide.
      glide?.cancel();
    };

    window.addEventListener("wheel", onUserScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", onUserScroll, { capture: true, passive: true });
    window.addEventListener("keydown", onUserScroll, true);
    window.addEventListener("keydown", onEscapeInField, true);
    window.addEventListener("keydown", onTab, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("click", arm, true);
    window.addEventListener("submit", arm, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn, true);
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (phase !== "shown" && phase !== "arriving") held.current = null;
      if (rings[0]) rings[0].style.borderColor = "";
      window.removeEventListener("wheel", onUserScroll, true);
      window.removeEventListener("touchmove", onUserScroll, true);
      window.removeEventListener("keydown", onUserScroll, true);
      window.removeEventListener("keydown", onEscapeInField, true);
      window.removeEventListener("keydown", onTab, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("click", arm, true);
      window.removeEventListener("submit", arm, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [isClient, stepKey]);

  /* No tour: nothing is carried over to the next one. */
  useEffect(() => {
    if (stepKey) return;
    held.current = null;
    holeBox.current = null;
  }, [stepKey]);

  const back = useCallback(() => {
    const current = getState().run;
    if (!current) return;
    focusNext.current = focusedNow();
    setRun({ ...current, step: current.step - 1 });
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  /* A completion that stores at once goes straight to Done; only a slow one shows that it is saving. */
  const [slowSave, setSlowSave] = useState<typeof notice>(null);
  useEffect(() => {
    if (notice?.kind !== "done" || notice.save !== "saving") return;
    const timer = window.setTimeout(() => setSlowSave(notice), 400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!isClient) return null;

  // Held at its level for the whole run, searches and screen changes included. Only a dialog of the page's own lifts it.
  const overlayOn = Boolean(step) && !v.aside;
  const ringsOn = overlayOn && v.phase !== "missing";
  const sheet = phone;

  let card = null;
  /** The one live region, kept mounted so a screen reader hears each change rather than a new node it may ignore. */
  let said = "";
  if (run && tour && step && !v.aside) {
    const index = run.step;
    const previous = tour.steps[index - 1];
    const canBack =
      previous !== undefined &&
      (previous.advance === "input" || previous.advance === "manual") &&
      previous.page === step.page;
    const eyebrow = `Step ${index + 1} of ${tour.steps.length}`;

    if (v.phase === "missing") {
      const noun = tour.record?.noun ?? "record";
      const left = v.wrongPage && v.left;
      const backHref =
        run.record !== undefined && step.page.includes("*")
          ? fillPath(step.page, run.record)
          : !step.page.includes("*")
            ? step.page
            : run.path && matchPath(step.page, run.path)
              ? run.path
              : null;
      const lastStep = index === tour.steps.length - 1;
      const skipNow = () => {
        focusNext.current = focusedNow();
        skip(index);
      };
      if (left) {
        // Off the record this run made: nothing here is what the steps describe, so the only moves are back or out.
        const title = `You left the ${noun} this walkthrough created`;
        const body = backHref
          ? `The rest of it happens on that ${noun}. Go back to carry on, or exit.`
          : `This run lost track of which ${noun} that was. Exit, then start it again from Tutorials.`;
        said = `${eyebrow}. ${title}. ${body}`;
        card = (
          <NoticeCard
            sheet={sheet}
            icon="missing"
            eyebrow={eyebrow}
            title={title}
            body={body}
            onClose={exit}
            closeLabel="Exit the tutorial"
            animate
            takeFocus
          >
            {backHref ? (
              <>
                <Button variant="ghost" onClick={exit}>
                  Exit
                </Button>
                <Primary>
                  <ButtonLink href={backHref}>Take me back</ButtonLink>
                </Primary>
              </>
            ) : (
              <Primary>
                <Button onClick={exit}>Exit</Button>
              </Primary>
            )}
          </NoticeCard>
        );
      } else {
        const body = v.wrongPage ? "This step is on another screen." : "What this step points to isn't on the page.";
        const back = v.wrongPage && backHref;
        said = `${eyebrow}. ${step.title}. ${body}`;
        card = (
          <NoticeCard
            sheet={sheet}
            icon="missing"
            eyebrow={eyebrow}
            title={step.title}
            body={
              back
                ? `${body} Go back to carry on.`
                : lastStep
                  ? `${body} Skipped steps mean this run won't be marked as done.`
                  : `${body} You can skip it, but a run with a skipped step isn't marked as done.`
            }
            onClose={exit}
            closeLabel="Exit the tutorial"
            animate
            takeFocus
          >
            <Button variant="ghost" onClick={exit}>
              Exit
            </Button>
            {back ? (
              <Primary>
                <ButtonLink href={backHref}>Take me back</ButtonLink>
              </Primary>
            ) : lastStep ? null : (
              <Primary>
                <Button onClick={skipNow}>Skip</Button>
              </Primary>
            )}
          </NoticeCard>
        );
      }
    } else {
      const input = step.advance === "input";
      // Draft-only words are said only on a record proven to be a draft.
      const notDraft = tour.record !== undefined && step.whenNotDraft !== undefined && !v.draft;
      const title =
        v.detour && step.detour
          ? step.detour.title
          : notDraft && step.whenNotDraft?.title
            ? step.whenNotDraft.title
            : step.title;
      const body =
        v.detour && step.detour
          ? step.detour.body
          : v.alt && step.bodyWhen
            ? step.bodyWhen.body
            : notDraft && step.whenNotDraft
              ? step.whenNotDraft.body
              : touch && step.bodyTouch
                ? step.bodyTouch
                : step.body;
      const failed = v.failed && !v.pending ? step.pending?.failed : undefined;
      // Offered only where it does exactly this: never where Enter sends for real.
      const shortcut = touch || step.enterSends ? undefined : "Ctrl+Enter";
      const next = v.detour
        ? undefined
        : step.advance === "manual"
          ? {
              label: step.final ? "Finish" : "Next",
              shortcut,
              onClick: () => {
                focusNext.current = focusedNow();
                if (step.final) complete(index);
                else go(index);
              },
            }
          : input && v.hasValue
            ? {
                label: "Next",
                shortcut,
                onClick: () => {
                  focusNext.current = focusedNow();
                  go(index);
                },
              }
            : undefined;
      const hint = v.detour
        ? undefined
        : input
          ? !v.hasValue && !v.fieldDisabled
            ? "Type to continue"
            : undefined
          : step.advance === "signal"
            ? step.hint
            : undefined;
      if (v.phase === "shown") {
        said = `${eyebrow}. ${title}. ${v.pending && step.pending ? step.pending.body : (failed ?? body)}`;
      }
      card = (
        <StepCard
          key={stepKey}
          dock={v.dock}
          number={index + 1}
          total={tour.steps.length}
          title={title}
          body={body}
          pending={v.pending ? step.pending?.body : undefined}
          failed={failed}
          onBack={canBack && !v.detour ? back : undefined}
          next={next}
          hint={hint}
          onSkip={
            input && !v.hasValue && (step.skippable || v.fieldDisabled)
              ? () => {
                  focusNext.current = focusedNow();
                  go(index);
                }
              : undefined
          }
          onExit={exit}
          cardRef={cardRef}
          innerRef={innerRef}
          caretRef={caretRef}
        />
      );
    }
  } else if (!run && notice) {
    const noticeTour = SPOTLIGHT_TOURS[notice.id];
    if (notice.kind === "done") {
      const already = notice.already
        ? `This ${noticeTour.record?.noun ?? "record"} is no longer a draft, so there was nothing left to publish. `
        : "";
      if (notice.save === "saving") {
        said = slowSave === notice ? `${noticeTour.title}. Saving that you finished.` : "";
        card = slowSave === notice && (
          <NoticeCard
            key="saving"
            closing
            sheet={sheet}
            icon="saving"
            eyebrow={noticeTour.title}
            title="Finishing up"
            body="Saving that you finished, so Tutorials can mark it done."
            onClose={dismiss}
            closeLabel="Close"
            animate
            takeFocus={notice.focus}
          />
        );
      } else if (notice.save === "failed") {
        const body = `${already}The walkthrough is finished, but Tutorials couldn't save it, so it isn't marked as done yet. Check your connection and try again.`;
        said = `${noticeTour.title}. Couldn't mark this as done. ${body}`;
        card = (
          <NoticeCard
            key="failed"
            closing
            sheet={sheet}
            icon="missing"
            eyebrow={noticeTour.title}
            title="Couldn't mark this as done"
            body={body}
            onClose={dismiss}
            closeLabel="Close"
            animate
            takeFocus
          >
            <Button variant="ghost" onClick={dismiss}>
              Close
            </Button>
            <Primary>
              <Button
                onClick={() => {
                  setNotice({ ...notice, save: "saving", focus: true });
                  recordCompletion(notice.id);
                }}
              >
                Try again
              </Button>
            </Primary>
          </NoticeCard>
        );
      } else {
        said = `${noticeTour.title}. Done. ${already}Rerun it any time from Tutorials.`;
        card = (
          <NoticeCard
            key="done"
            closing
            sheet={sheet}
            icon="done"
            eyebrow={noticeTour.title}
            title="Done"
            body={
              <>
                {already}Rerun it any time from{" "}
                <Primary>
                  <TutorialsLink>Tutorials</TutorialsLink>
                </Primary>
                .
              </>
            }
            onClose={dismiss}
            closeLabel="Close"
            animate
            autoCloseMs={7000}
            takeFocus={notice.focus}
          />
        );
      }
    } else if (notice.kind === "partial") {
      said = `${noticeTour.title}. Not marked as done. A step was skipped.`;
      card = (
        <NoticeCard
          sheet={sheet}
          icon="missing"
          eyebrow={noticeTour.title}
          title="Not marked as done"
          closing
          body={
            <>
              A step was skipped, so this run doesn&apos;t count. Rerun it any time from{" "}
              <Primary>
                <TutorialsLink>Tutorials</TutorialsLink>
              </Primary>
              .
            </>
          }
          onClose={dismiss}
          closeLabel="Close"
          animate
          takeFocus
        />
      );
    } else if (notice.kind === "none") {
      const none = noticeTour.steps[notice.step]?.none;
      said = none ? `${noticeTour.title}. ${none.title}. ${none.body}` : "";
      card = none && (
        <NoticeCard
          sheet={sheet}
          icon="missing"
          eyebrow={noticeTour.title}
          title={none.title}
          body={none.body}
          onClose={dismiss}
          closeLabel="Close"
          animate
          takeFocus
        >
          {none.restart ? (
            <>
              <Button variant="ghost" onClick={dismiss}>
                Close
              </Button>
              <Primary>
                <Button
                  onClick={() => {
                    setNotice(null);
                    router.push(`${none.restart!.href}?spotlight=${notice.id}`);
                  }}
                >
                  {none.restart.label}
                </Button>
              </Primary>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setNotice(null);
                  router.push("/admin/tutorials");
                }}
              >
                Back to Tutorials
              </Button>
              <Primary>
                <Button onClick={dismiss}>Close</Button>
              </Primary>
            </>
          )}
        </NoticeCard>
      );
    } else {
      const body = `${capitalise(noticeTour.desktopOnly?.feature ?? "this screen")} only opens on a wider screen, so this walkthrough needs a laptop or desktop.`;
      said = `${noticeTour.title}. This one needs a computer. ${body}`;
      card = (
        <NoticeCard
          sheet={sheet}
          icon="narrow"
          eyebrow={noticeTour.title}
          title="This one needs a computer"
          body={body}
          onClose={dismiss}
          closeLabel="Close"
          animate
        >
          <Button
            variant="ghost"
            onClick={() => {
              setNotice(null);
              router.push("/admin/tutorials");
            }}
          >
            Back to Tutorials
          </Button>
        </NoticeCard>
      );
    }
  }

  return createPortal(
    <div ref={rootRef} data-spotlight-root="" className="console console-float">
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
      {/* Filled by the engine when a click is held back, apart from the card's own words. */}
      <p ref={nudgeRef} aria-live="assertive" className="sr-only" />
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[90] h-full w-full transition-opacity duration-200 ease-out motion-reduce:transition-none"
        style={{ opacity: overlayOn ? 1 : 0 }}
      >
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {Array.from({ length: MAX_EXTRAS + 1 }, (_, i) => (
              <rect
                key={i}
                ref={(el) => {
                  holeRefs.current[i] = el;
                }}
                width="0"
                height="0"
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(28 18 20 / 0.42)" mask={`url(#${maskId})`} />
      </svg>
      {Array.from({ length: MAX_EXTRAS + 1 }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[90] border-2 border-wine-500 transition-[opacity,border-color] duration-200 ease-out motion-reduce:transition-none"
          style={{ opacity: ringsOn ? 1 : 0, display: "none" }}
        />
      ))}
      {card}
    </div>,
    document.body,
  );
}

/**
 * Mounted once by the console shell, under every signed-in branch, the studios
 * included. `useSearchParams` sits under its own boundary so reading the query
 * string never holds up the rest of the console.
 */
export function SpotlightHost() {
  return (
    <>
      <Suspense fallback={null}>
        <Entry />
      </Suspense>
      <Spotlight />
    </>
  );
}
