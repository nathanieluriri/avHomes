"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import type { EnquiryThread } from "@avhomes/contracts";

const TOKEN_HEADER = "x-thread-token";
const POLL_MS = 15_000;

/** Kept for this tab only, so a refresh still works after the fragment is cleared from the address bar. */
function storageKey(id: string) {
  return `avhomes.reply.${id}`;
}

function readToken(id: string): string {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (fromHash) {
    try {
      sessionStorage.setItem(storageKey(id), fromHash);
    } catch {
      // Private mode: the token still works for this page load.
    }
    // Take the token out of the visible URL so a copied link or screenshot does not carry it.
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(storageKey(id)) ?? "";
  } catch {
    return "";
  }
}

export default function ConversationReply({ id }: { id: string }) {
  const tokenRef = useRef("");
  const [thread, setThread] = useState<EnquiryThread | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const token = tokenRef.current;
      if (!token) throw new Error("no token");
      const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(id)}`, {
        headers: { [TOKEN_HEADER]: token },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { thread: EnquiryThread };
      setThread(body.thread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    tokenRef.current = readToken(id);
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [id, load]);

  const count = thread?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send() {
    const body = draft.trim();
    const token = tokenRef.current;
    if (!body || !token) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/enquiries/chat/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", [TOKEN_HEADER]: token },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json().catch(() => ({}))) as { thread?: EnquiryThread; detail?: string };
      if (!res.ok || !json.thread) throw new Error(json.detail ?? "Your message could not be sent. Try again.");
      setThread(json.thread);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Your message could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="bg-mist-50">
      <div className="mx-auto flex max-w-2xl flex-col px-4 py-10 sm:px-6 lg:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">Your conversation</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
          {thread?.propertyTitle ? thread.propertyTitle : "Talk to the AVHomes team"}
        </h1>
        {thread?.agentName && (
          <p className="mt-1 text-sm text-muted-foreground">You are talking with {thread.agentName}.</p>
        )}

        {failed && (
          <div role="alert" className="mt-6 rounded-2xl border border-mist-200 bg-white p-6">
            <p className="font-semibold text-plum-950">This link has expired or is not valid.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Reply to the email we sent you instead, or{" "}
              <Link href="/contact" className="font-semibold text-wine-600 underline underline-offset-2">
                contact us
              </Link>{" "}
              and we will pick it up from there.
            </p>
          </div>
        )}

        {!failed && !thread && (
          <div className="mt-10 flex justify-center text-muted-foreground" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading your conversation</span>
          </div>
        )}

        {thread && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-mist-200 bg-white shadow-sm">
            <ol className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-4 sm:p-6" aria-label="Messages" aria-live="polite">
              {thread.messages.map((m) => {
                const mine = m.from === "visitor";
                return (
                  <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] ${
                        mine ? "bg-wine-600 text-white" : "bg-mist-100 text-plum-950"
                      }`}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {mine ? "You" : m.authorName} · {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </li>
                );
              })}
              <div ref={endRef} />
            </ol>

            <form
              className="flex items-end gap-2 border-t border-mist-200 p-3 sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label htmlFor="reply" className="sr-only">
                Your reply
              </label>
              <textarea
                id="reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="Write your reply. Enter sends, Shift+Enter adds a line."
                className="max-h-40 min-h-[3rem] flex-1 resize-none rounded-xl border border-mist-200 px-3 py-2.5 text-[15px] text-plum-950 outline-none placeholder:text-slate-500 focus:border-wine-500 focus:ring-2 focus:ring-wine-500/20"
              />
              <button
                type="submit"
                disabled={sending || draft.trim() === ""}
                aria-label="Send reply"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-wine-600 text-white transition-colors hover:bg-wine-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
              </button>
            </form>
            {sendError && (
              <p role="alert" className="px-4 pb-3 text-sm text-red-700">
                {sendError}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          This page is private to you. You can also just reply to our email, and it reaches the same person.
        </p>
      </div>
    </section>
  );
}
