import type { SpotlightSignal } from "@/lib/admin/spotlight-steps";

export const SIGNAL_EVENT = "avh:spotlight-signal";

/** Tells a running walkthrough that something really happened. A no-op when none is running. */
export function signalSpotlight(signal: SpotlightSignal) {
  window.dispatchEvent(new CustomEvent<SpotlightSignal>(SIGNAL_EVENT, { detail: signal }));
}
