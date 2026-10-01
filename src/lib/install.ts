"use client";

import { useSyncExternalStore } from "react";
import { isIos, isStandalone } from "@/lib/push";

/**
 * Installing the partner app or the console to the home screen.
 *
 * Chrome and Edge fire `beforeinstallprompt` once, early, and often before
 * React has hydrated. `INSTALL_CAPTURE` in install-capture.ts is an inline
 * script each installable layout puts in the page so the event is caught
 * whenever it comes, and held until somebody taps Install.
 *
 * iPhone has no install prompt at all: Safari's Share sheet has "Add to Home
 * Screen", and all an app can do is say where it is.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __avInstall?: InstallPrompt | null;
  }
}

export interface InstallState {
  /** Chrome or Edge is holding an install prompt we can show. */
  canPrompt: boolean;
  /** Opened from the home screen already. */
  installed: boolean;
  /** iPhone or iPad, where the only way in is Share, then Add to Home Screen. */
  ios: boolean;
}

const SERVER: InstallState = { canPrompt: false, installed: false, ios: false };
let snapshot: InstallState | null = null;

function read(): InstallState {
  const next: InstallState = {
    canPrompt: Boolean(window.__avInstall),
    installed: isStandalone(),
    ios: isIos(),
  };
  if (
    !snapshot ||
    snapshot.canPrompt !== next.canPrompt ||
    snapshot.installed !== next.installed ||
    snapshot.ios !== next.ios
  ) {
    snapshot = next;
  }
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("avhomes:installable", listener);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", listener);
  return () => {
    window.removeEventListener("avhomes:installable", listener);
    standalone.removeEventListener("change", listener);
  };
}

export function useInstall(): InstallState & {
  /** Somewhere to send them: a prompt to show, or Share instructions to read. */
  offerable: boolean;
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
} {
  const state = useSyncExternalStore(subscribe, read, () => SERVER);
  return {
    ...state,
    offerable: !state.installed && (state.canPrompt || state.ios),
    prompt: async () => {
      const event = window.__avInstall;
      if (!event) return "unavailable";
      await event.prompt();
      const { outcome } = await event.userChoice;
      // A prompt can be shown once. Either way it is spent.
      window.__avInstall = null;
      window.dispatchEvent(new Event("avhomes:installable"));
      return outcome;
    },
  };
}
