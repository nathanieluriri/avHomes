"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MailContact, MailDensity, MailDraft, MailPrefs, MailViewState } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { type Draft, draftIsEmpty, enc } from "./shared";

/**
 * The Mailboxes page's memory: where the member left it, and their drafts,
 * kept on the server so another device or a refresh opens the same view.
 */

export const DEFAULT_PREFS: MailPrefs = {
  view: null,
  density: "comfortable",
  recentTo: [],
  updatedAt: 0,
};

export type PrefsPatch = Partial<{
  view: MailViewState;
  density: MailDensity;
  recentTo: string[];
}>;

const PREFS_DELAY_MS = 600;

/**
 * Last write wins, debounced, and one request in flight at a time. A tab that
 * is closed mid-wait still lands its last change through a keepalive request.
 */
export function usePrefsSaver(enabled: boolean): (patch: PrefsPatch) => void {
  const pending = useRef<PrefsPatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    pending.current = null;
    if (!body) return;
    // A lost save costs a restored view, never data, so it is not reported.
    void api.patch("/admin/mail/state", body).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      const body = pending.current;
      if (!body) return;
      pending.current = null;
      try {
        void fetch("/api/admin/mail/state", {
          method: "PATCH",
          keepalive: true,
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // Nothing to do while the page is going away.
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [enabled, flush]);

  return useCallback(
    (patch: PrefsPatch) => {
      if (!enabled) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, PREFS_DELAY_MS);
    },
    [enabled, flush],
  );
}

/* ─────────────────────────────── contacts ────────────────────────────── */

/*
 * The whole book, once per mailbox per page load, so ranking a keystroke costs
 * no request. The server caps it at 500 of the most frequent and recent.
 */
const books = new Map<string, Promise<MailContact[]>>();

export function forgetContacts(mailbox: string): void {
  books.delete(mailbox);
}

export function useContacts(mailbox: string): MailContact[] {
  const [loaded, setLoaded] = useState<{
    mailbox: string;
    contacts: MailContact[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    let book = books.get(mailbox);
    if (!book) {
      book = api
        .get<{ contacts: MailContact[] }>(`/admin/mail/mailboxes/${enc(mailbox)}/contacts?limit=500`)
        .then((res) => res.contacts)
        .catch(() => {
          books.delete(mailbox);
          return [];
        });
      books.set(mailbox, book);
    }
    void book.then((contacts) => {
      if (live) setLoaded({ mailbox, contacts });
    });
    return () => {
      live = false;
    };
  }, [mailbox]);
  return loaded?.mailbox === mailbox ? loaded.contacts : [];
}

/* ──────────────────────────────── drafts ─────────────────────────────── */

const DRAFT_DELAY_MS = 800;

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; error: ApiError }
  /** Another device saved a newer version first. */
  | { kind: "conflict"; theirs: MailDraft }
  /** Sent or discarded on another device. */
  | { kind: "gone" };

function bodyOf(d: Draft) {
  return {
    baseRevision: d.revision === 0 ? null : d.revision,
    mailbox: d.mailbox,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    text: d.text,
    html: d.html,
    mode: d.mode,
    inReplyTo: d.inReplyTo,
    forwardOf: d.forwardOf,
  };
}

/**
 * Saves a draft 800ms after the last edit. The revision it was read at goes
 * with every save, so a newer copy from another device is a conflict to
 * resolve rather than something to overwrite.
 *
 * `draft` is the composer's live copy; `onSaved` hands back what the server
 * stored so the next save names the right base.
 */
export function useDraftAutosave(draft: Draft, onSaved: (saved: MailDraft) => void) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const latest = useRef(draft);
  const inFlight = useRef(false);
  const again = useRef(false);
  const stopped = useRef(false);
  const savedJson = useRef<string | null>(draft.revision > 0 ? JSON.stringify(bodyOf(draft)) : null);
  const onSavedRef = useRef(onSaved);
  const run = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    latest.current = draft;
    onSavedRef.current = onSaved;
  });

  const save = useCallback(() => run.current(), []);

  // One request at a time; an edit made during it is saved straight after.
  useEffect(() => {
    run.current = async () => {
      if (stopped.current) return;
      if (inFlight.current) {
        again.current = true;
        return;
      }
      const d = latest.current;
      const json = JSON.stringify(bodyOf(d));
      if (json === savedJson.current) return;
      if (d.revision === 0 && draftIsEmpty(d)) return;
      inFlight.current = true;
      setState({ kind: "saving" });
      try {
        const res = await api.put<{ draft: MailDraft }>(`/admin/mail/drafts/${enc(d.id)}`, bodyOf(d));
        savedJson.current = JSON.stringify({
          ...bodyOf(d),
          baseRevision: res.draft.revision,
        });
        onSavedRef.current(res.draft);
        setState({ kind: "saved", at: Date.now() });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.body.draft) {
          stopped.current = true;
          setState({ kind: "conflict", theirs: err.body.draft as MailDraft });
        } else if (err instanceof ApiError && err.status === 404) {
          stopped.current = true;
          setState({ kind: "gone" });
        } else {
          setState({
            kind: "failed",
            error: err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed" }),
          });
        }
      } finally {
        inFlight.current = false;
        if (again.current) {
          again.current = false;
          void run.current();
        }
      }
    };
  }, []);

  const json = JSON.stringify(bodyOf(draft));
  useEffect(() => {
    if (json === savedJson.current) return;
    const timer = setTimeout(() => void save(), DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [json, save]);

  return {
    state,
    /** Save now, e.g. before the window closes. */
    flush: save,
    /** After a conflict or a gone draft is resolved, autosave resumes from here. */
    resume: () => {
      stopped.current = false;
      savedJson.current = null;
      setState({ kind: "idle" });
    },
  };
}
