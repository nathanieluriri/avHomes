import type { SpotlightTourId } from "@/lib/admin/spotlight-steps";

/**
 * The active tour, outside React.
 *
 * Kept in sessionStorage so a walkthrough survives the client navigations it
 * is made of (list to editor, quick editor to studio) and a reload, and is gone
 * with the tab. Read through `useSyncExternalStore`, so the server and the
 * first client render agree on "no tour" and the real one arrives straight
 * after hydration.
 */

export interface Run {
  id: SpotlightTourId;
  step: number;
  /** The pathname the current step was last seen on, for the "take me back" link. */
  path?: string;
  /** A step was passed over because its anchor could not be found, so finishing records nothing. */
  skipped?: boolean;
  /** The id of the record a `binds` step created. Later steps run on it and nowhere else. */
  record?: string;
}

export type Notice =
  | { kind: "narrow" | "partial"; id: SpotlightTourId }
  /**
   * The run finished. `save` is where the completion write stands: the check is
   * drawn only once the server has it. `already` says the record stopped being
   * a draft before the last step, and `focus` that the card takes focus.
   */
  | {
      kind: "done";
      id: SpotlightTourId;
      save: "saving" | "saved" | "failed";
      already?: boolean;
      focus?: boolean;
    }
  /** Nothing to practise on; `step` names the step whose `none` card to show. */
  | { kind: "none"; id: SpotlightTourId; step: number }
  | null;

export interface SpotlightState {
  run: Run | null;
  notice: Notice;
}

const KEY = "avh:spotlight";
const EMPTY: SpotlightState = { run: null, notice: null };

let state: SpotlightState | null = null;
const listeners = new Set<() => void>();

function read(): Run | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Run>;
    if (typeof parsed.id !== "string" || typeof parsed.step !== "number") return null;
    return {
      id: parsed.id as SpotlightTourId,
      step: parsed.step,
      path: parsed.path,
      skipped: parsed.skipped === true,
      record: typeof parsed.record === "string" ? parsed.record : undefined,
    };
  } catch {
    return null;
  }
}

function write(run: Run | null) {
  try {
    if (run) window.sessionStorage.setItem(KEY, JSON.stringify(run));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be refused (private mode, quota). The tour still runs for this page.
  }
}

export function getState(): SpotlightState {
  if (state === null) state = { run: read(), notice: null };
  return state;
}

export function getServerState(): SpotlightState {
  return EMPTY;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: SpotlightState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function setRun(run: Run | null) {
  write(run);
  commit({ ...getState(), run });
}

export function setNotice(notice: Notice) {
  commit({ ...getState(), notice });
}

let input: "key" | "pointer" = "pointer";

/** Remembers whether the last thing the person did was a key or a pointer. Returns the teardown. */
export function trackInput(): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Tab" || event.key === "Enter" || event.key === " " || event.key.startsWith("Arrow")) input = "key";
  };
  const onPointer = () => {
    input = "pointer";
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPointer, true);
  };
}

export function lastInput(): "key" | "pointer" {
  return input;
}

export function startRun(id: SpotlightTourId, notice: Notice = null) {
  const run = notice ? null : { id, step: 0 };
  write(run);
  commit({ run, notice });
}
