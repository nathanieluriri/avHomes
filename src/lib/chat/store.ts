import type { EnquiryThread } from "@avhomes/contracts";

/**
 * The visitor's keyring, and the one place that touches storage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT LIVES WHERE, AGAIN, BECAUSE IT IS THE WHOLE DESIGN.
 *
 * The SERVER owns every conversation. This browser owns two things: who you
 * said you are, and a bearer token per thread you opened. Losing this storage
 * loses the way back into a thread, which is exactly why the server mails a
 * transcript on every reply.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ONE INDEX KEY, not a key per thread. The widget's whole job is to show every
 * conversation at once, and a scattered set of `avhomes.chat.thread.<id>` keys
 * cannot be listed without enumerating localStorage and pattern matching it,
 * which breaks the moment anything else on the origin uses a similar prefix.
 * `migrateLegacy` folds the old scattered keys in once and then removes them.
 */

const IDENTITY_KEY = "avhomes.chat.identity";
const INDEX_KEY = "avhomes.chat.threads";
const LEGACY_PREFIX = "avhomes.chat.thread.";

/**
 * A ceiling, because this is a list a person scrolls, not an archive. Past
 * twenty the widget is a filing cabinet, and the oldest threads are the ones
 * already answered by email.
 */
const MAX_THREADS = 20;

export interface Identity {
  name: string;
  email: string;
  phone: string;
}

export interface StoredThread {
  id: string;
  token: string;
  /** Groups by what the conversation is about: a property id, or "general". */
  key: string;
  title: string;
  /** The listing to link back to. Absent on a general enquiry. */
  path?: string;
  openedAt: number;
  /**
   * The newest message timestamp this visitor has actually looked at. Unread is
   * derived from it rather than tracked as a count, because a count set by each
   * event drifts the first time two tabs are open on the same thread.
   */
  lastReadAt: number;
}

/*
 * Every storage access goes through these two, and both swallow.
 *
 * `localStorage` is not merely empty in a private window or with site data
 * blocked: THE ACCESSOR ITSELF THROWS in some configurations, so an unguarded
 * read is not a missing thread, it is a component that fails to render at all.
 */
function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A visitor who blocks storage still gets one conversation per tab. */
  }
}

function drop(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}

export function readIdentity(): Identity | null {
  return read<Identity>(IDENTITY_KEY);
}

export function writeIdentity(identity: Identity): void {
  write(IDENTITY_KEY, identity);
}

/**
 * Folds the pre-widget storage shape into the index, once.
 *
 * The first version of the chat stored `{id, token}` under one key per property
 * and had no way to list them. Those threads are live conversations somebody may
 * be waiting on an answer to, so they are adopted rather than abandoned. The old
 * keys are removed as they are read, which makes this idempotent without a
 * "migrated" flag to get wrong.
 */
function migrateLegacy(existing: StoredThread[]): StoredThread[] {
  let found = existing;
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) stale.push(key);
    }
    for (const key of stale) {
      const legacy = read<{ id: string; token: string }>(key);
      drop(key);
      if (!legacy?.id || !legacy.token) continue;
      if (found.some((t) => t.id === legacy.id)) continue;
      found = [
        ...found,
        {
          id: legacy.id,
          token: legacy.token,
          key: key.slice(LEGACY_PREFIX.length),
          title: "Your enquiry",
          openedAt: 0,
          // Zero, so anything already waiting in that thread reads as unread.
          // Better to draw attention to an answer somebody missed than to hide
          // it by pretending it had been seen.
          lastReadAt: 0,
        },
      ];
    }
    if (stale.length > 0) write(INDEX_KEY, found);
  } catch {
    /* Enumeration is the one storage call with no safe partial result. */
  }
  return found;
}

export function readThreads(): StoredThread[] {
  const stored = read<StoredThread[]>(INDEX_KEY);
  const list = Array.isArray(stored) ? stored.filter(isThread) : [];
  return migrateLegacy(list).slice(0, MAX_THREADS);
}

function isThread(value: unknown): value is StoredThread {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Partial<StoredThread>;
  return typeof t.id === "string" && typeof t.token === "string";
}

/** Newest first, capped. The list the widget renders top to bottom. */
export function writeThreads(threads: StoredThread[]): StoredThread[] {
  const next = [...threads]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_THREADS);
  write(INDEX_KEY, next);
  return next;
}

/**
 * Counts what the visitor has not seen.
 *
 * AGENT MESSAGES ONLY. Their own lines are by definition read, and counting
 * them would make the badge light up the instant somebody sends something,
 * which teaches people to ignore it.
 */
export function unreadCount(thread: StoredThread, live: EnquiryThread | undefined): number {
  if (!live) return 0;
  return live.messages.filter((m) => m.from === "agent" && m.createdAt > thread.lastReadAt).length;
}

export function newestAt(live: EnquiryThread | undefined): number {
  if (!live || live.messages.length === 0) return 0;
  return live.messages[live.messages.length - 1]?.createdAt ?? 0;
}

/** The header for the visitor's bearer token. Never a query string: a URL is
 *  written to access logs, history, and the Referer of every later request. */
export const THREAD_TOKEN_HEADER = "x-thread-token";
