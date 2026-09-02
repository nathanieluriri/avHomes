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
