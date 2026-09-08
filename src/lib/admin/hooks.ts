"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AuthUser } from "@avhomes/contracts";
import { ApiError, api } from "./client";

/* ═════════════════════════════════════════════════════════════ VIEWPORT ═══ */

/**
 * A media query as a value.
 *
 * `useSyncExternalStore` rather than state plus an effect, and the difference
 * shows on a phone. State-plus-effect paints the server's answer first and
 * corrects it after hydration, which is a visible flash for a layout swap and
 * something worse for a gate: the desktop branch MOUNTS for a frame, and a
 * branch that mounts an iframe of the whole marketing site has already started
 * that download by the time it is torn down.
 *
 * The server snapshot is `false`, so the narrow branch is the one that
 * hydrates. Anything gated on width therefore fails towards the phone layout,
 * which is the safe direction: a phone layout on a desktop is merely roomy, a
 * desktop layout on a phone is broken.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/*
 * The three questions worth asking, in rem so they track the values console.css
 * already uses rather than drifting from them.
 *
 * `phone` is the CONTENT line, Tailwind's `sm`: below it a table becomes a list
 * and a dialog becomes a sheet. `narrow` is the NAVIGATION line, Tailwind's
 * `lg`: below it the rail is a drawer and the two studios are gated. `touch`
 * asks about the pointer instead of the width, because a 390px desktop window
 * is not a phone and a 1024px tablet is.
 */
export const useIsPhone = () => !useMediaQuery("(min-width: 40rem)");
export const useIsNarrow = () => !useMediaQuery("(min-width: 64rem)");
export const useIsTouch = () => useMediaQuery("(hover: none) and (pointer: coarse)");

/**
 * Publishes the on-screen keyboard's height as `--c-kb` on the document root.
 *
 * Called ONCE, by the console shell. Every bottom-pinned surface then reads the
 * variable instead of each one subscribing to `visualViewport` separately.
 *
 * It exists for iOS. Android honours `interactiveWidget: "resizes-content"` and
 * shrinks the layout viewport, so a `fixed bottom-0` bar moves up on its own;
 * Safari does not, so the save bar, the chat composer and every sheet footer
 * are simply drawn underneath the keyboard, which is the one moment they matter
 * most. The measurement is the gap between the layout viewport and the visual
 * one, clamped at zero because pinch-zoom makes that difference negative.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    function apply() {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const gap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      // Under about 80px the difference is browser chrome settling rather than a
      // keyboard, and reacting to it makes the bar jitter while scrolling.
      root.style.setProperty("--c-kb", gap > 80 ? `${Math.round(gap)}px` : "0px");
    }

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--c-kb");
    };
  }, []);
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Which request this state belongs to. Stale results are dropped by it. */
  key: string;
}

/**
 * One async read, cancelled on unmount and reset when its inputs change.
 *
 * Two details are load-bearing:
 *
 *  - The reset happens DURING RENDER, not in an effect. Adjusting state while
 *    rendering is React's own answer to "start over when an input changed": it
 *    re-renders immediately without ever painting the previous screen's data
 *    under the new filter, which is what an effect would do.
 *  - The AbortController matters more than it looks. Without it a fetch that
 *    resolves after a screen unmounts sets state on a dead component, and under
 *    React's development double-invoke that happens on every single mount.
 */
export function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: {
    /**
     * Hold the last payload while the next one loads, instead of blanking to a
     * skeleton.
     *
     * For a LIST whose filter, sort or page changed. Blanking there is not just
     * a flicker: a list several viewports tall collapses to four skeleton rows,
     * which clamps the console's scroller back to the top, so a reader who
     * tapped a status pill halfway down the page is silently relocated. On a
     * phone, where the list is longer in viewports and the pills are further
     * from the rows, that happens on nearly every tap.
     *
     * Off by default, and it should stay off for a DETAIL screen, where showing
     * the previous record's fields under the new record's title would be a lie.
     */
    keepPrevious?: boolean;
  } = {},
): { data: T | null; error: ApiError | null; loading: boolean; reload: () => void } {
  const [nonce, setNonce] = useState(0);
  const key = `${JSON.stringify(deps)}#${nonce}`;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    key,
  });

  if (state.key !== key) {
    setState((prev) => ({
      data: options.keepPrevious ? prev.data : null,
      error: null,
      loading: true,
      key,
    }));
  }

  // `run` is a fresh closure on every render, so it is read through a ref rather
  // than being a dependency. Writing the ref in an effect keeps render pure.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    const controller = new AbortController();
    runRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false, key });
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure to report.
        if (controller.signal.aborted) return;
        setState({ data: null, error: asApiError(err), loading: false, key });
      });
    return () => controller.abort();
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export type SessionState =
  | { status: "unknown" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

/**
 * `unknown` is a real state, not a loading flag.
 *
 * Rendering the sign-in screen while `/auth/me` is still in flight flashes a
 * login form at somebody who is already signed in, on every navigation.
 */
export function useSession(): { session: SessionState; refresh: () => void } {
  const [session, setSession] = useState<SessionState>({ status: "unknown" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((res) => {
        if (live) setSession({ status: "signed-in", user: res.user });
      })
      .catch(() => {
        if (live) setSession({ status: "signed-out" });
      });
    return () => {
      live = false;
    };
  }, [nonce]);

  return { session, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}

/** Debounces a value, for a search box that would otherwise fetch per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export interface CursorStack {
  /** The cursor for the request being made right now. */
  cursor: string | null;
  /** 1-based, for a pager note that wants to say which page this is. */
  page: number;
  /** Call from a tab or sort handler: a new filter starts at its first page. */
  reset: () => void;
  /** Spread onto `TablePager`. Takes the cursor the server just handed back. */
  pager: (nextCursor: string | null | undefined) => {
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
}

/**
 * Keyset paging as a STACK, not a page number.
 *
 * Back is `slice(0, -1)` and forward pushes the cursor the server just handed
 * back, which is what makes Previous work against an API that only ever answers
 * with the next one.
 *
 * `resetKey` is the debounced query, or anything else whose change invalidates
 * the current position. It resets DURING RENDER, for the reason `useAsync`
 * does: resetting in an effect leaves the stack one render ahead of the query it
 * belongs to, which fires a wasted request for page one of the previous search
 * and flashes its rows.
 *
 * This lives here because three list screens had their own copy, and copies
 * drift. The formatting helpers next door were extracted after exactly that:
 * four copies of one date function, two of which had stopped agreeing.
 */
export function useCursorStack(resetKey: string = ""): CursorStack {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setCursors([null]);
  }

  return {
    cursor: cursors[cursors.length - 1] ?? null,
    page: cursors.length,
    reset: useCallback(() => setCursors([null]), []),
    pager: (nextCursor) => ({
      canPrev: cursors.length > 1,
      canNext: Boolean(nextCursor),
      onPrev: () => setCursors((stack) => stack.slice(0, -1)),
      onNext: () => setCursors((stack) => [...stack, nextCursor ?? null]),
    }),
  };
}
