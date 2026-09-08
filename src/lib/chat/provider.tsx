"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EnquiryThread } from "@avhomes/contracts";
import {
  THREAD_TOKEN_HEADER,
  newestAt,
  readIdentity,
  readThreads,
  unreadCount,
  writeIdentity,
  writeThreads,
  type Identity,
  type StoredThread,
} from "./store";

/**
 * One chat, for the whole site.
 *
 * Before this there were two: the listing page opened its own dialog with its
 * own copy of the thread and its own poller, and nothing else on the site knew
 * a conversation existed. So an answer that arrived while somebody was reading
 * a different listing was invisible until they went back and clicked Contact
 * agent again, which is the same as not answering.
 *
 * The provider owns every thread this browser holds a token for, polls them
 * together, and hands the widget one consistent view. "Contact agent" no longer
 * renders a dialog; it asks this to open one.
 */

/** Open and being read: fast enough to feel live. Closed: cheap. */
const POLL_OPEN_MS = 8000;
const POLL_IDLE_MS = 45000;

export interface ChatTarget {
  /** Groups the conversation. A property id, or "general". */
  key: string;
  title: string;
  path?: string;
  propertyId?: string;
  propertySlug?: string;
}

interface ChatValue {
  open: boolean;
  /** The thread on screen, or null for the list. */
  activeId: string | null;
  threads: StoredThread[];
  live: Record<string, EnquiryThread>;
  identity: Identity | null;
  /** What a new conversation would be about, when there is no thread yet. */
  pending: ChatTarget | null;
  totalUnread: number;
  unreadFor: (id: string) => number;
  openChat: (target?: ChatTarget) => void;
  close: () => void;
  show: (id: string) => void;
  back: () => void;
  start: (target: ChatTarget, identity: Identity, message: string, honeypot: string) => Promise<void>;
  send: (id: string, body: string) => Promise<void>;
  forget: (id: string) => void;
}

const Ctx = createContext<ChatValue | null>(null);

export function useChat(): ChatValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useChat must be used inside <ChatProvider>");
  return value;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  /*
   * Lazy initialisers, not effects. This provider wraps the whole site, so an
   * effect that seeds from storage would paint one frame with no threads and a
   * zero badge on every page load, which reads as "my conversation is gone".
   *
   * `typeof window` guards the server render; both helpers also swallow, so a
   * blocked storage API is an empty list rather than a crashed layout.
   */
  const [threads, setThreads] = useState<StoredThread[]>(() =>
    typeof window === "undefined" ? [] : readThreads(),
  );
  const [identity, setIdentity] = useState<Identity | null>(() =>
    typeof window === "undefined" ? null : readIdentity(),
  );
  const [live, setLive] = useState<Record<string, EnquiryThread>>({});
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<ChatTarget | null>(null);

  /* Read by the poller, which must not be rebuilt every time a message lands. */
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const persist = useCallback((next: StoredThread[]) => {
    setThreads(writeThreads(next));
  }, []);

  /** Drops a thread whose token no longer opens it, rather than polling a dead
   *  key forever. The server answers 404 for both a wrong token and a missing
   *  thread, so this covers a deleted conversation too. */
  const forget = useCallback(
    (id: string) => {
      persist(threadsRef.current.filter((t) => t.id !== id));
      setLive((all) => {
        const { [id]: _gone, ...rest } = all;
        void _gone;
        return rest;
      });
      setActiveId((current) => (current === id ? null : current));
    },
    [persist],
  );

  const fetchOne = useCallback(
    async (thread: StoredThread, signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(thread.id)}`, {
          signal,
          headers: { [THREAD_TOKEN_HEADER]: thread.token },
        });
        if (res.status === 404) {
          forget(thread.id);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { thread: EnquiryThread };
        setLive((all) => ({ ...all, [thread.id]: data.thread }));
      } catch {
        /* A dropped poll is not worth a message. The next one is seconds away. */
      }
    },
    [forget],
  );

  /*
   * ONE poller for every thread.
   *
   * It reads the thread list through a REF rather than taking it as a
   * dependency: keying the interval on `threads` would tear it down and rebuild
   * it on every incoming message, resetting the clock so that a busy
   * conversation ends up polled less often than a quiet one. `open` IS a
   * dependency, because the cadence genuinely differs and that changes rarely.
   *
   * Paused while the tab is hidden. A background tab left open overnight is
   * thousands of requests nobody is there to read, and `visibilitychange` fires
   * on the way back, which is the moment the answer actually matters.
   */
  useEffect(() => {
    const controller = new AbortController();

    const tick = () => {
      if (document.hidden) return;
      for (const thread of threadsRef.current) void fetchOne(thread, controller.signal);
    };

    tick();
    const timer = window.setInterval(tick, open ? POLL_OPEN_MS : POLL_IDLE_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", tick);
    };
  }, [open, fetchOne]);

  const unreadFor = useCallback(
    (id: string) => {
      const thread = threadsRef.current.find((t) => t.id === id);
      return thread ? unreadCount(thread, live[id]) : 0;
    },
    [live],
  );

  const totalUnread = useMemo(
    () => threads.reduce((sum, t) => sum + unreadCount(t, live[t.id]), 0),
    [threads, live],
  );

  /** Opening a thread is what marks it read. Not hovering, not the badge. */
  const show = useCallback(
    (id: string) => {
      setActiveId(id);
      setPending(null);
      const seen = newestAt(live[id]);
      persist(
        threadsRef.current.map((t) =>
          t.id === id ? { ...t, lastReadAt: Math.max(t.lastReadAt, seen) } : t,
        ),
      );
    },
    [live, persist],
  );

  const openChat = useCallback(
    (target?: ChatTarget) => {
      setOpen(true);
      /*
       * The launcher always lands on the LIST, never on whatever was last read.
       * Resuming feels clever and costs the visitor the one thing the widget is
       * for: seeing that a different conversation has an answer waiting. The
       * badge counts every thread, so opening into one of them hides the reason
       * the badge was lit.
       */
      if (!target) {
        setPending(null);
        setActiveId(null);
        return;
      }
      const existing = threadsRef.current.find((t) => t.key === target.key);
      if (existing) {
        show(existing.id);
        return;
      }
      // No thread about this yet, so the panel opens on the form that starts one.
      setPending(target);
      setActiveId(null);
    },
    [show],
  );

  const start = useCallback(
    async (target: ChatTarget, who: Identity, message: string, honeypot: string) => {
      const res = await fetch("/api/enquiries/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...who,
          message,
          website: honeypot,
          ...(target.propertyId ? { propertyId: target.propertyId } : {}),
          ...(target.propertySlug ? { propertySlug: target.propertySlug } : {}),
          propertyTitle: target.title,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { id: string; token: string; thread: EnquiryThread };

      writeIdentity(who);
      setIdentity(who);
      const now = Date.now();
      persist([
        ...threadsRef.current,
        {
          id: data.id,
          token: data.token,
          key: target.key,
          title: target.title,
          ...(target.path ? { path: target.path } : {}),
          openedAt: now,
          // Their own opening line is read by definition.
          lastReadAt: now,
        },
      ]);
      setLive((all) => ({ ...all, [data.id]: data.thread }));
      setActiveId(data.id);
      setPending(null);
    },
    [persist],
  );

  const send = useCallback(
    async (id: string, body: string) => {
      const thread = threadsRef.current.find((t) => t.id === id);
      if (!thread) return;
      const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", [THREAD_TOKEN_HEADER]: thread.token },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { thread: EnquiryThread };
      setLive((all) => ({ ...all, [id]: data.thread }));
      persist(
        threadsRef.current.map((t) =>
          t.id === id ? { ...t, lastReadAt: newestAt(data.thread) } : t,
        ),
      );
    },
    [persist],
  );

  const value = useMemo<ChatValue>(
    () => ({
      open,
      activeId,
      threads,
      live,
      identity,
      pending,
      totalUnread,
      unreadFor,
      openChat,
      close: () => setOpen(false),
      show,
      back: () => {
        setActiveId(null);
        setPending(null);
      },
      start,
      send,
      forget,
    }),
    [open, activeId, threads, live, identity, pending, totalUnread, unreadFor, openChat, show, start, send, forget],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
