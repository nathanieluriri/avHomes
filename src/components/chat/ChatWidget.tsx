"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Loader2, MessageSquare, Send, X } from "lucide-react";
import type { EnquiryThread } from "@avhomes/contracts";
import { useChat } from "@/lib/chat/provider";
import type { Identity, StoredThread } from "@/lib/chat/store";

/**
 * The site's chat, as a launcher and a panel.
 *
 * Three views behind one button: the list of conversations, one conversation,
 * and the form that starts a new one. They are views rather than separate
 * components-with-state because a visitor moves between them constantly and any
 * state that lived in the view would be lost every time they went back.
 *
 * PORTALLED TO `document.body`. The widget is `position: fixed`, and the site
 * has transformed ancestors all over it (the reveal animation, the marquee). A
 * transformed ancestor becomes the containing block for a fixed child, which is
 * how a launcher pinned to the corner of the viewport ends up pinned to the
 * middle of a section instead.
 */

/**
 * "Am I past hydration", as a store rather than an effect.
 *
 * The snapshots live at module scope so their identity is stable across
 * renders, and the store never changes during a page's life, so subscribe
 * returns a no-op unsubscriber. `ShareLinks` reads the origin the same way, for
 * the same reason: this is a fact about the ENVIRONMENT, and reading it with
 * `useState` plus an effect is a render with the wrong answer followed by a
 * second one to correct it.
 */
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export default function ChatWidget() {
  const chat = useChat();
  /* Portals need a document, and the server has no body to portal to. Rendering
     different trees on the two sides is a hydration error, so the first client
     render has to agree with the server and return null. */
  const hydrated = useSyncExternalStore(subscribeToNothing, onClient, onServer);
  if (!hydrated) return null;

  return createPortal(
    /*
     * `--cookie-banner-h` is published by CookieBanner and is 0px whenever it is
     * not on screen, so this padding costs nothing the rest of the time. Both
     * are pinned to the bottom of the viewport, and on a phone the banner is
     * three stacked rows tall: without this the launcher sits on top of a
     * consent notice the visitor has to answer.
     */
    <div
      className="chat-dock pointer-events-none fixed inset-0 z-[95] flex flex-col items-end justify-end p-4 sm:p-6"
      style={{ paddingBottom: "calc(1rem + var(--cookie-banner-h, 0px))" }}
    >
      {chat.open && <Panel />}
      <Launcher />
    </div>,
    document.body,
  );
}

/**
 * The bubble, and the badge that makes it worth looking at.
 *
 * It BOUNCES when the unread count goes UP, not while it is non-zero. A badge
 * that animates forever is one a visitor learns to ignore in about a minute,
 * and the thing worth signalling is the arrival, not the backlog. Reduced
 * motion drops the movement and keeps the badge, which is the part carrying the
 * information.
 */
function Launcher() {
  const chat = useChat();
  const [nudge, setNudge] = useState(false);
  const previous = useRef(chat.totalUnread);

  useEffect(() => {
    if (chat.totalUnread > previous.current) {
      setNudge(true);
      const timer = window.setTimeout(() => setNudge(false), 2400);
      previous.current = chat.totalUnread;
      return () => window.clearTimeout(timer);
    }
    previous.current = chat.totalUnread;
  }, [chat.totalUnread]);

  return (
    <button
      type="button"
      onClick={() => (chat.open ? chat.close() : chat.openChat())}
      aria-label={
        chat.totalUnread > 0
          ? `Messages, ${chat.totalUnread} unread`
          : chat.open
            ? "Close messages"
            : "Open messages"
      }
      aria-expanded={chat.open}
      className={`chat-launcher pointer-events-auto relative mt-3 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-wine-600 text-white shadow-pop transition-colors hover:bg-wine-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600 ${
        nudge ? "chat-launcher--nudge" : ""
      }`}
    >
      {chat.open ? (
        <X className="h-6 w-6" aria-hidden="true" />
      ) : (
        <MessageSquare className="h-6 w-6" aria-hidden="true" />
      )}
      {!chat.open && chat.totalUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-plum-950 px-1 text-[11px] font-bold text-white">
          {chat.totalUnread > 9 ? "9+" : chat.totalUnread}
        </span>
      )}
    </button>
  );
}

function Panel() {
  const chat = useChat();
  const active = chat.threads.find((t) => t.id === chat.activeId) ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") chat.close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chat]);

  return (
    <div
      role="dialog"
      aria-label="Messages"
      className="chat-panel pointer-events-auto flex h-[min(34rem,calc(100dvh-7.5rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-pop"
    >
      {active ? (
        <Conversation thread={active} live={chat.live[active.id]} />
      ) : chat.pending ? (
        <StartForm />
      ) : (
        <ThreadList />
      )}
    </div>
  );
}

/* ──────────────────────────────── list ─────────────────────────────────── */

function ThreadList() {
  const chat = useChat();

  return (
    <>
      <Header title="Messages" subtitle="Your conversations with our team" />
      {chat.threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-wine-50 text-wine-700">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-plum-950">No conversations yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Open any property and press Contact agent. Your conversation will
            live here, and we email you a copy.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {chat.threads.map((thread) => {
            const live = chat.live[thread.id];
            const last = live?.messages.at(-1);
            const unread = chat.unreadFor(thread.id);
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => chat.show(thread.id)}
                  className="flex w-full items-center gap-3 border-b border-mist-200 px-4 py-3 text-left transition-colors last:border-0 hover:bg-mist-50"
                >
                  <Avatar name={live?.agentName ?? thread.title} url={live?.agentAvatarUrl ?? ""} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] ${
                          unread > 0 ? "font-bold text-plum-950" : "font-semibold text-plum-950"
                        }`}
                      >
                        {thread.title}
                      </span>
                      {last && (
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {shortWhen(last.createdAt)}
                        </span>
                      )}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[12px] ${
                        unread > 0 ? "font-semibold text-plum-950" : "text-slate-500"
                      }`}
                    >
                      {last
                        ? `${last.from === "visitor" ? "You: " : ""}${last.body}`
                        : "Opening..."}
                    </span>
                  </span>
                  {unread > 0 ? (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-wine-600 px-1 text-[11px] font-bold text-white">
                      {unread}
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-mist-300" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ───────────────────────────── conversation ────────────────────────────── */

function Conversation({ thread, live }: { thread: StoredThread; live: EnquiryThread | undefined }) {
  const chat = useChat();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [live?.messages.length]);

  /*
   * A reply that lands while the thread is ON SCREEN is read the moment it
   * arrives. Without this the badge counts a message the visitor is looking at,
   * and closing the panel leaves an unread marker on the conversation they just
   * finished having.
   */
  const seen = live?.messages.length ?? 0;
  useEffect(() => {
    if (seen > 0) chat.show(thread.id);
    // `chat.show` is stable per render of the provider; depending on the whole
    // context here would re-run this on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, thread.id]);

  async function submit() {
    const body = draft.trim();
    if (body === "") return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      await chat.send(thread.id, body);
    } catch (err) {
      setDraft(body);
      setError(err instanceof Error ? err.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        title={live?.agentName ?? thread.title}
        subtitle={live?.agentName ? thread.title : "Waiting for a consultant"}
        avatar={<Avatar name={live?.agentName ?? thread.title} url={live?.agentAvatarUrl ?? ""} />}
        onBack={chat.back}
      />

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {live?.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.from === "visitor" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
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

        {live && live.messages.every((m) => m.from === "visitor") && (
          /* The honest status. "Typing..." would be a lie: there may be nobody
             at a desk, and somebody told to expect a reply that is coming
             tomorrow deserves to know that now. */
          <p className="pt-2 text-center text-[11px] leading-relaxed text-slate-500">
            Sent. A consultant replies here, usually within one business day.
          </p>
        )}
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-[11px] text-red-700">{error}</p>}

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        busy={busy}
        placeholder="Write a message"
      />
    </>
  );
}

/* ────────────────────────────── new thread ─────────────────────────────── */

function StartForm() {
  const chat = useChat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = chat.pending;

  if (!target) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const form = new FormData(event.currentTarget);
    const who: Identity = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
    };
    const message = String(form.get("message") ?? "").trim();
    if (message === "") return;

    setBusy(true);
    setError(null);
    try {
      await chat.start(target, who, message, String(form.get("website") ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        title={target.title}
        subtitle="Tell us how to reach you"
        onBack={chat.threads.length > 0 ? chat.back : undefined}
      />
      <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[13px] leading-relaxed text-slate-600">
          A consultant picks this up and answers here. We email you a copy of
          everything said, so you always have it.
        </p>

        <div className="mt-3 space-y-2.5">
          <Field label="Your name" name="name" defaultValue={chat.identity?.name} />
          <Field label="Email" name="email" type="email" defaultValue={chat.identity?.email} />
          {/* Required here and optional on the contact form: a live conversation
              that goes quiet needs a second way back. */}
          <Field label="Phone" name="phone" type="tel" defaultValue={chat.identity?.phone} />
          <label className="block">
            <span className="block text-[12px] font-semibold text-plum-950">
              What would you like to know?
            </span>
            <textarea
              name="message"
              required
              rows={3}
              placeholder={`I would like to know more about ${target.title}.`}
              className="mt-1 w-full resize-y rounded-xl border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600"
            />
          </label>
        </div>

        {/* The honeypot. Hidden from people AND from screen readers, so a filled
            value is a bot and the server answers as if it worked. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px]">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-wine-600 px-6 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-mist-300"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Start the conversation
        </button>
      </form>
    </>
  );
}

/* ───────────────────────────────── parts ───────────────────────────────── */

function Header({
  title,
  subtitle,
  avatar,
  onBack,
}: {
  title: string;
  subtitle: string;
  avatar?: React.ReactNode;
  onBack?: () => void;
}) {
  const chat = useChat();
  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-mist-200 px-3 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to messages"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-mist-100 hover:text-plum-950"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-plum-950">{title}</p>
        <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={chat.close}
        aria-label="Close messages"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-mist-100 hover:text-plum-950"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-mist-200 p-2.5">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          /* Enter sends, Shift+Enter breaks a line. The opposite makes a chat
             box feel like a form field. */
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-mist-200 px-3.5 py-2.5 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || value.trim() === ""}
        aria-label="Send"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wine-600 text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-mist-300"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-plum-950">{label}</span>
      <input
        name={name}
        type={type}
        required
        defaultValue={defaultValue}
        autoComplete={name === "name" ? "name" : name === "email" ? "email" : "tel"}
        className="mt-1 w-full rounded-xl border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors focus:border-wine-600"
      />
    </label>
  );
}

/** A plain img: the source is an API path today and an arbitrary blob host under
 *  the other store, and next/image would need a remotePattern per store. */
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

/** Relative for the last day, then a date. A list of timestamps is unreadable;
 *  "3m" and "yesterday" are what somebody actually wants from a message list. */
function shortWhen(at: number): string {
  const diff = Date.now() - at;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
