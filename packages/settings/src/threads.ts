import { looksLikeReply, threadSubject } from "@avhomes/contracts";

/**
 * Conversation grouping, Gmail's way, over whatever window of messages the
 * caller read.
 *
 * Hostinger hands every message's Message-ID and In-Reply-To on the list and
 * search results, so the headers do the work: the same Message-ID (a message
 * sent to one of our own addresses sits in Sent and Inbox) and every
 * In-Reply-To that names a message in the window join their threads. A reply
 * whose parent is outside the window, or whose client dropped the header,
 * falls back to its subject without Re: and Fwd: plus the same set of people,
 * and joins the conversation it follows. A message that does not look like a
 * reply never joins by subject, so two separate "New enquiry" notices stay two.
 */

export interface ThreadInput {
  /** Unique in the window: folder and uid. */
  key: string;
  date: string;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  people: string[];
}

function norm(id: string | null | undefined): string | null {
  const v = (id ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}

/** Each message's thread key: the Message-ID (or the key) of the thread's oldest message. */
export function groupThreads(items: ThreadInput[]): Map<string, string> {
  const parent = new Map<string, string>(items.map((m) => [m.key, m.key]));
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so long chains stay cheap.
    for (let at = k; parent.get(at) !== root; ) {
      const next = parent.get(at)!;
      parent.set(at, root);
      at = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byId = new Map<string, string>();
  for (const m of items) {
    const id = norm(m.messageId);
    if (!id) continue;
    const had = byId.get(id);
    if (had) union(had, m.key);
    else byId.set(id, m.key);
  }
  for (const m of items) {
    const to = byId.get(norm(m.inReplyTo) ?? "");
    if (to) union(to, m.key);
  }

  const buckets = new Map<string, ThreadInput[]>();
  for (const m of items) {
    const subject = threadSubject(m.subject);
    if (subject === "") continue;
    const people = [...new Set(m.people.map((p) => p.toLowerCase()))].sort().join(",");
    const id = `${subject}\u0001${people}`;
    buckets.set(id, [...(buckets.get(id) ?? []), m]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    for (let i = 1; i < bucket.length; i += 1) {
      const m = bucket[i];
      if (looksLikeReply(m.subject) || norm(m.inReplyTo)) union(bucket[i - 1].key, m.key);
    }
  }

  const oldest = new Map<string, ThreadInput>();
  for (const m of items) {
    const root = find(m.key);
    const had = oldest.get(root);
    if (!had || Date.parse(m.date) < Date.parse(had.date)) oldest.set(root, m);
  }
  const out = new Map<string, string>();
  for (const m of items) {
    const first = oldest.get(find(m.key))!;
    out.set(m.key, norm(first.messageId) ?? first.key);
  }
  return out;
}
