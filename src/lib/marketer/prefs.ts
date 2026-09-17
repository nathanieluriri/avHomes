"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Small choices the app remembers on this phone: which figure the home screen
 * shows, and whether the money is hidden.
 *
 * Read through `useSyncExternalStore`, so the server and the first client
 * render agree on the fallback and every mounted reader updates together.
 * localStorage throws in some private modes and embedded browsers, so a copy
 * is kept in memory and a choice still holds for the visit when it cannot be
 * saved.
 */

const CHANGED = "avh-m-pref";
const memory = new Map<string, string>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePref<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (next: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        // Another tab wrote it, so the saved value is newer than this tab's copy.
        memory.delete(key);
        onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(CHANGED, onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGED, onChange);
      };
    },
    [key],
  );

  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not saved, but the memory copy keeps it for this visit.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );

  const value = allowed.find((option) => option === raw) ?? fallback;
  return [value, set];
}

const VISIBILITY = ["shown", "hidden"] as const;

/** Whether the reader hid their money on this phone. The eye on the home figure sets it. */
export function useMoneyHidden(): [boolean, (hidden: boolean) => void] {
  const [value, set] = usePref("avh-m-money", "shown", VISIBILITY);
  const setHidden = useCallback((hidden: boolean) => set(hidden ? "hidden" : "shown"), [set]);
  return [value === "hidden", setHidden];
}

/** Amounts inside a sentence the server wrote, masked the way the figure is. */
export function maskMoney(text: string): string {
  return text.replace(/₦\s?\d[\d,]*(\.\d+)?/gu, "₦••••");
}
