"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageSquare, Send, X } from "lucide-react";
import type { EnquiryThread } from "@avhomes/contracts";

/**
 * "Contact agent", as a conversation rather than a mailto.
 *
 * A `mailto:` hands the buyer to an email client they may not have configured,
 * loses everyone who is on a shared or work machine, and gives the team no
 * record until somebody forwards it. This keeps the exchange on the page.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE THE CONVERSATION ACTUALLY LIVES.
 *
 * The SERVER holds it. The browser holds two things: who you said you are, and
 * the bearer token for each thread you opened. That split is the whole design:
 *
 *  - the transcript has to be on the server, or the inbox cannot show it and
 *    the agent has nothing to reply to;
 *  - the token has to be in the browser, because the buyer has no account and
 *    something has to prove that this tab is the one that opened the thread.
 *
 * So localStorage is a KEYRING, not a database. Losing it loses the way back
 * into an old thread, which is exactly why the server mails a transcript on
 * every reply: the mail is the copy that survives a cleared browser.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Identity is stored ONCE and threads per property. A buyer asking about a
 * second house should not have to type their phone number again to do it.
 */

const IDENTITY_KEY = "avhomes.chat.identity";
const THREAD_PREFIX = "avhomes.chat.thread.";

/** Long enough to feel live, slow enough to be free. Paused when hidden. */
const POLL_MS = 8000;

interface Identity {
  name: string;
  email: string;
  phone: string;
}

interface Handle {
  id: string;
  token: string;
}

/*
 * Every storage access goes through these two, and both swallow.
 *
 * `localStorage` is not merely empty in a private window or with site data
 * blocked: the ACCESSOR ITSELF THROWS in some configurations, so an unguarded
 * read is not a missing thread, it is a component that fails to render at all.
 */
function readStore<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A buyer who blocks storage can still hold one conversation in this tab. */
  }
}

export default function AgentChat({
  propertyId,
  propertySlug,
  propertyTitle,
  agentName,
  agentAvatarUrl,
}: {
  propertyId?: string;
  propertySlug?: string;
  propertyTitle?: string;
  agentName: string;
  agentAvatarUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-wine-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Contact agent
      </button>

      {open && (
        <ChatDialog
          onClose={() => setOpen(false)}
          propertyId={propertyId}
          propertySlug={propertySlug}
          propertyTitle={propertyTitle}
          agentName={agentName}
          agentAvatarUrl={agentAvatarUrl}
        />
      )}
    </>
  );
}

function ChatDialog({
  onClose,
  propertyId,
  propertySlug,
  propertyTitle,
  agentName,
  agentAvatarUrl,
}: {
  onClose: () => void;
  propertyId?: string;
  propertySlug?: string;
  propertyTitle?: string;
  agentName: string;
  agentAvatarUrl: string;
}) {
  const threadKey = `${THREAD_PREFIX}${propertyId ?? "general"}`;

  /*
   * Read in a LAZY INITIALISER, not an effect.
   *
   * This dialog only ever mounts from a click, so `window` is there by the time
   * the initialiser runs, and reading storage during the first render is what
   * stops the sign-up form being painted for one frame at somebody who already
   * has a conversation open. An effect cannot do that: it runs after the paint
   * that showed the wrong thing.
   */
  const [identity, setIdentity] = useState<Identity | null>(() => readStore<Identity>(IDENTITY_KEY));
  const [handle, setHandle] = useState<Handle | null>(() => readStore<Handle>(threadKey));
  const [thread, setThread] = useState<EnquiryThread | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* New messages arrive at the bottom, so that is where the view goes. */
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread?.messages.length]);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!handle) return;
      try {
        const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(handle.id)}`, {
          signal,
          // In a header, never the URL: a query string is written to access
          // logs, browser history and the Referer of every later request.
          headers: { "x-thread-token": handle.token },
        });
        if (res.status === 404) {
          /* The thread is gone, or this token no longer opens it. Drop the dead
             key rather than polling it forever, and let the buyer start again. */
          try {
            window.localStorage.removeItem(threadKey);
          } catch {
            /* nothing to clean up */
          }
          setHandle(null);
          setThread(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { thread: EnquiryThread };
        setThread(data.thread);
      } catch {
        /* A failed poll is not worth a message. The next one is 8 seconds away. */
      }
    },
    [handle, threadKey],
  );

  /*
   * Polling, PAUSED WHILE THE TAB IS HIDDEN.
   *
   * A background tab left open overnight is 10,800 requests that nobody is
   * there to read. `visibilitychange` also fires on return, which is when the
   * answer actually matters, so the tab catches up the moment it is looked at.
   */
  useEffect(() => {
    if (!handle) return;
    const controller = new AbortController();
    let timer: number | null = null;

    /* One definition of what a poll is, so the immediate one and the interval
       one cannot drift apart. */
    const tick = () => void refresh(controller.signal);

    function start() {
      if (timer !== null) return;
      // Immediately, then on a cadence: coming back to a visible tab should
      // show the reply that landed while it was hidden, not wait 8 seconds.
      tick();
      timer = window.setInterval(tick, POLL_MS);
    }
    function stop() {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [handle, refresh]);

  async function openThread(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: Identity = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
    };
    const message = String(form.get("message") ?? "").trim();
    if (message === "") return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/enquiries/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...next,
          message,
          website: String(form.get("website") ?? ""),
          ...(propertyId ? { propertyId } : {}),
          ...(propertySlug ? { propertySlug } : {}),
          ...(propertyTitle ? { propertyTitle } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { id: string; token: string; thread: EnquiryThread };
      const nextHandle = { id: data.id, token: data.token };
      writeStore(IDENTITY_KEY, next);
      writeStore(threadKey, nextHandle);
      setIdentity(next);
      setHandle(nextHandle);
      setThread(data.thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body === "" || !handle) return;

    setBusy(true);
    setError(null);
    /* Cleared BEFORE the request, so a slow network does not look like a field
       that ate the message. The text is restored on failure. */
    setDraft("");
    try {
      const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(handle.id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-thread-token": handle.token },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { thread: EnquiryThread };
      setThread(data.thread);
    } catch (err) {
      setDraft(body);
      setError(err instanceof Error ? err.message : "That did not send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const displayAgent = thread?.agentName ?? agentName;
  const displayAvatar = thread?.agentAvatarUrl ?? agentAvatarUrl;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-plum-950/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat about ${propertyTitle ?? "this listing"}`}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white sm:h-[min(40rem,86vh)] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-mist-200 px-4 py-3">
          <Avatar name={displayAgent} url={displayAvatar} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-plum-950">{displayAgent}</p>
            <p className="truncate text-xs text-slate-500">
              {propertyTitle ? `About ${propertyTitle}` : "AVHomes"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-mist-100 hover:text-plum-950"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {handle ? (
          <>
            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {thread?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.from === "visitor" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      message.from === "visitor"
                        ? "bg-wine-600 text-white"
                        : "bg-mist-100 text-plum-950"
                    }`}
                  >
                    {message.from === "agent" && (
                      <p className="mb-0.5 text-[11px] font-semibold text-slate-500">
                        {message.authorName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  </div>
                </div>
              ))}

              {thread && thread.messages.filter((m) => m.from === "agent").length === 0 && (
                /* The honest status. "Typing..." would be a lie: there may be
                   nobody at a desk, and a buyer who is told to wait for a reply
                   that is coming tomorrow deserves to know that now. */
                <p className="pt-2 text-center text-xs text-slate-500">
                  Sent. A consultant replies here, usually within one business day.
                  <br />
                  We have emailed a copy to {identity?.email ?? "you"}.
                </p>
              )}
            </div>

            {error && (
              <p className="shrink-0 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
            )}

            <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-mist-200 p-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  /* Enter sends, Shift+Enter breaks a line. The opposite makes a
                     chat box feel like a form field. */
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder="Write a message"
                aria-label="Write a message"
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-mist-200 px-3.5 py-3 text-sm text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600"
              />
              <button
                type="submit"
                disabled={busy || draft.trim() === ""}
                aria-label="Send"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-wine-600 text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-mist-300"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={openThread} className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-sm leading-relaxed text-slate-600">
              Tell us how to reach you and a consultant will pick this up. We will email
              you a copy of everything said here.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Your name" name="name" defaultValue={identity?.name} required />
              <Field
                label="Email"
                name="email"
                type="email"
                inputMode="email"
                defaultValue={identity?.email}
                required
              />
              {/* Required here and optional on the contact form, because a live
                  conversation that goes quiet needs a second way back. */}
              <Field
                label="Phone"
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={identity?.phone}
                required
              />
              <label className="block">
                <span className="block text-sm font-semibold text-plum-950">
                  What would you like to know?
                </span>
                <textarea
                  name="message"
                  required
                  rows={4}
                  placeholder={
                    propertyTitle
                      ? `I would like to know more about ${propertyTitle}.`
                      : "How can we help?"
                  }
                  className="mt-2 w-full resize-y rounded-xl border border-mist-200 bg-white px-4 py-3 text-sm text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600"
                />
              </label>
            </div>

            {/* The honeypot. Hidden from people AND from screen readers, so a
                filled value is a bot and the server answers as if it worked. */}
            <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px]">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            {error && <p className="mt-3 text-xs text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-mist-300"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Start the conversation
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
              We use these only to answer you about this property.
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  name,
  type = "text",
  inputMode,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  inputMode?: "email" | "tel";
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-plum-950">{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue}
        required={required}
        autoComplete={name === "name" ? "name" : name === "email" ? "email" : "tel"}
        className="mt-2 w-full rounded-xl border border-mist-200 bg-white px-4 py-3 text-sm text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600"
      />
    </label>
  );
}

/**
 * A face, or the initial standing in for one.
 *
 * A plain img rather than next/image: the source is an API path today and an
 * arbitrary blob host under the other store, and next/image would need a
 * remotePattern per store to render either.
 */
function Avatar({ name, url }: { name: string; url: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-wine-50 text-sm font-semibold text-wine-700">
        {name.trim().slice(0, 1).toUpperCase() || "A"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  );
}

/** The server's sentence when it has one, never a bare status code. */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
