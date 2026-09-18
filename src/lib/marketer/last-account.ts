"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Who signed in on this phone last, so coming back is one field instead of two.
 *
 * WHAT IS STORED: a first name and an email address, in this browser's own
 * localStorage. Nothing else. No password, no token, no session id, and nothing
 * that could stand in for one. Signing in still costs a password every time and
 * the cookie is still the only thing the server trusts, so this is a keyboard
 * saving and never a key.
 *
 * It is cleared by the pencil on the sign-in screen and by signing out, because
 * a marketer handing their phone to a colleague needs one obvious way to stop
 * their name being on it.
 */

const KEY = "avh-m-last";
const CHANGED = "avh-m-last-changed";

export interface LastAccount {
  name: string;
  email: string;
}

let memory: LastAccount | null | undefined;

function read(): LastAccount | null {
  if (memory !== undefined) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LastAccount).email === "string" &&
      typeof (parsed as LastAccount).name === "string"
    ) {
      return { name: (parsed as LastAccount).name, email: (parsed as LastAccount).email };
    }
    return null;
  } catch {
    // Private mode, blocked storage, or somebody's hand-edited JSON. Falling
    // back to null gives the full sign-in form, which always works.
    return null;
  }
}

export function rememberAccount(account: LastAccount): void {
  memory = account;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Not saved, which costs a typed email next time and nothing else.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function forgetAccount(): void {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Already unreachable, so there is nothing to clear.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Null on the server and on the first client render, so the markup matches. */
export function useLastAccount(): LastAccount | null {
  const subscribe = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      memory = undefined;
      onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED, onChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => {
      const value = read();
      memory = value;
      return value;
    },
    () => null,
  );
}

/** The first word of a name, for a heading. "Nathaniel Uriri" becomes "Nathaniel". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/u)[0] ?? "";
}

/**
 * `uri***@gmail.com`.
 *
 * Enough for the owner to recognise their own address and not enough to hand a
 * stranger holding the phone a working address to attack. Three characters
 * survive at most, and a very short local part keeps only its first.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length <= 2 ? 1 : Math.min(3, local.length - 1);
  return `${local.slice(0, keep)}***${domain}`;
}
