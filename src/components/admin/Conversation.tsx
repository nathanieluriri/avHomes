"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, Send } from "lucide-react";
import type { Enquiry, SiteSettings } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime } from "@/lib/admin/format";
import { Card, CardHead, ErrorNote } from "./ui";

/**
 * The thread, and the box that answers it.
 *
 * A form enquiry has exactly one message and no reply box: there is no thread to
 * append to, and offering one would promise the buyer a live conversation they
 * never opened. It renders as a single quoted message, which is what it is.
 *
 * REFRESHES ON A CADENCE while the tab is visible, for the same reason the
 * buyer's side does: two people are typing at each other and neither should have
 * to reload to find out. The poll is deliberately slower here. An agent has the
 * screen open all day and a buyer does not, so the cost profile is reversed.
 */

const POLL_MS = 15000;

export function Conversation({
  enquiry,
  onChange,
}: {
  enquiry: Enquiry;
  /** Hands the updated record up, so status and revision stay in one place. */
  onChange: (next: Enquiry) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /*
   * Read, not assumed. The composer says which name is about to go out, because
   * the site-wide setting means the person typing is often NOT the name the
   * buyer will see, and finding that out after sending is finding out too late.
   */
  const { data: site } = useAsync<{ settings: SiteSettings }>(
    (signal) => api.get<{ settings: SiteSettings }>("/admin/settings", signal),
    [],
  );

  const isChat = enquiry.channel === "chat";

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [enquiry.messages.length]);

  /* Polled only for a live thread. A form enquiry cannot gain messages. */
  useEffect(() => {
    if (!isChat) return;
    let timer: number | null = null;
    const controller = new AbortController();

    const tick = () => {
      void api
        .get<{ enquiry: Enquiry }>(`/admin/enquiries/${enquiry.id}`, controller.signal)
        .then((res) => {
          // Only when something actually moved, so a poll does not stomp the
          // revision under an in-flight reply.
          if (res.enquiry.revision !== enquiry.revision) onChange(res.enquiry);
        })
        .catch(() => {
          /* A dropped poll is not worth an error box. The next one is 15s away. */
        });
    };

    function start() {
      if (timer === null) timer = window.setInterval(tick, POLL_MS);
    }
    function stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else {
        tick();
        start();
      }
    }
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isChat, enquiry.id, enquiry.revision, onChange]);

  async function send() {
    const body = draft.trim();
    if (body === "") return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const res = await api.post<{ enquiry: Enquiry }>(`/admin/enquiries/${enquiry.id}/reply`, {
        body,
        baseRevision: enquiry.revision,
      });
      onChange(res.enquiry);
    } catch (err) {
      // The text comes back into the box. A 409 here is almost always a
      // colleague who answered first, and the reply is still worth sending
      // after reading theirs.
      setDraft(body);
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) });
      setError(apiError);
      const theirs = apiError.body.enquiry as Enquiry | undefined;
      if (theirs) onChange(theirs);
    } finally {
      setBusy(false);
    }
  }

  if (!isChat) {
    return (
      <Card>
        <CardHead title="Message" />
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-plum-950">
          {enquiry.message}
        </p>
        <p className="mt-3 border-t border-mist-100 pt-3 text-[12px] text-slate-600">
          This came from the contact form, so there is no thread to reply into.
          Answer it at{" "}
          <a
            href={`mailto:${enquiry.email}`}
            className="font-medium text-wine-700 underline underline-offset-2"
          >
            {enquiry.email}
          </a>
          .
        </p>
      </Card>
    );
  }

  const signature =
    site?.settings.replyIdentity === "team" ? site.settings.teamName : null;

  return (
    <Card padded={false}>
      <div className="border-b border-mist-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-plum-950">Conversation</h2>
        <p className="mt-0.5 text-[12px] text-slate-600">
          {enquiry.name} sees your reply here, and gets the whole thread by email.
        </p>
      </div>

      <div ref={scroller} className="max-h-[26rem] space-y-3 overflow-y-auto px-5 py-4">
        {enquiry.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.from === "agent" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[82%]">
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  message.from === "agent"
                    ? "bg-wine-600 text-white"
                    : "bg-mist-100 text-plum-950"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </div>
              <p
                className={`mt-1 text-[11px] text-slate-550 ${
                  message.from === "agent" ? "text-right" : ""
                }`}
              >
                {message.authorName} · {dateTime(message.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-5 pb-3">
          <ErrorNote error={error} />
        </div>
      )}

      <div className="border-t border-mist-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Reply to the buyer. Enter sends, Shift+Enter adds a line."
            className="max-h-40 min-h-[3.5rem] flex-1 resize-none rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || draft.trim() === ""}
            aria-label="Send reply"
            className="c-bevel-primary grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-wine-600 text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed disabled:bg-wine-600/50"
          >
            {busy ? (
              <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {signature && (
          <p className="mt-2 px-1 text-[11px] text-slate-600">
            This goes out as <span className="font-semibold text-plum-950">{signature}</span>,
            not your own name.
          </p>
        )}
      </div>
    </Card>
  );
}
