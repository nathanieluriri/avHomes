"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "@avhomes/contracts";
import { ApiError, api } from "./client";

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
): { data: T | null; error: ApiError | null; loading: boolean; reload: () => void } {
  const [nonce, setNonce] = useState(0);
  const key = `${JSON.stringify(deps)}#${nonce}`;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    key,
  });

  if (state.key !== key) setState({ data: null, error: null, loading: true, key });

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
