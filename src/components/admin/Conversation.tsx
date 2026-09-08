"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, Send } from "lucide-react";
import type { Enquiry, SiteSettings } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useMediaQuery } from "@/lib/admin/hooks";
import { messageTime } from "@/lib/admin/format";
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

  /*
   * Enter sends ONLY where there is a key to hold beside it.
   *
   * A phone keyboard has no Shift+Enter, so on a touch device the shortcut is
   * not a shortcut: it is a rule that the buyer receives whatever was typed the
   * moment the writer reaches for a second paragraph. A reply also goes out by
   * email, so there is no unsend. The pointer decides this rather than the
   * width, because a 390px desktop window still has a keyboard.
   *
   * The server snapshot is false, so the touch branch hydrates and the shortcut
   * has to be earned. That is the safe direction here.
   */
  const sendsOnEnter = useMediaQuery("(pointer: fine)");

  /*
   * Scroll to the newest message, whichever element is actually scrolling.
   *
   * Above `sm` that is this box; below it the box has no cap and `.c-main` owns
   * the thread, where the old `scrollTop = scrollHeight` was a silent no-op.
   * `nearest` rather than `end` so a thread that already fits does not move the
   * page at all, and the `scroll-mb` on each row is what keeps the last message
   * clear of the sticky composer.
   */
  useEffect(() => {
    scroller.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
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
        {/* `break-words`, the same as the chat bubble. A contact form body is
            unvalidated text pasted by a stranger, so one tracking URL with no
            spaces in it puts the whole console into horizontal scroll. */}
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-plum-950">
          {enquiry.message}
        </p>
        <p className="mt-3 border-t border-mist-100 pt-3 text-[12px] text-slate-600">
          This came from the contact form, so there is no thread to reply into.
          Answer it at{" "}
          <a
            href={`mailto:${enquiry.email}`}
            /* `break-all` rather than `break-words`: an email address offers no
               break opportunity at all, so overflow-wrap has nothing to act on
               until the line has already left the card. */
            className="font-medium text-wine-700 underline underline-offset-2 break-all"
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
      <div className="border-b border-mist-200 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-plum-950">Conversation</h2>
        <p className="mt-0.5 text-[12px] text-slate-600">
          {enquiry.name} sees your reply here, and gets the whole thread by email.
        </p>
      </div>

      {/*
       * NO INNER SCROLLER BELOW `sm`. The cap is 416px of thread inside a
       * 640px-tall phone that is already scrolling, which is two scrollbars over
       * the same pixels: a flick meant for the thread moves the page, and a
       * flick meant for the page moves the thread. Below `sm` the card simply
       * grows and `.c-main` owns the scroll, which is what every chat on a phone
       * does. From `sm` up the bounded box comes back, because there the thread
       * is one column of a two-column screen and it cannot be allowed to push
       * the composer off the bottom.
       *
       * `overscroll-contain` so a flick that reaches the end of the bounded box
       * stops there instead of chaining out into the page behind it. It is inert
       * below `sm`, where there is no inner scroller left to chain from.
       */}
      <div
        ref={scroller}
        className="space-y-3 overflow-y-visible overscroll-contain px-4 py-4 sm:max-h-[26rem] sm:overflow-y-auto sm:px-5"
      >
        {enquiry.messages.map((message) => (
          <div
            key={message.id}
            /* The scroll margin is what the scroll-to-latest aligns against, so
               the newest message lands above the sticky composer rather than
               behind it. Only below `sm`, where the composer sticks. */
            className={`flex scroll-mb-32 sm:scroll-mb-0 ${
              message.from === "agent" ? "justify-end" : "justify-start"
            }`}
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
              {/* 12px on a phone. Who said it and when is content a reader
                  needs, and 11px is the console's label size, not its reading
                  size. */}
              <p
                className={`mt-1 text-[12px] text-slate-550 sm:text-[11px] ${
                  message.from === "agent" ? "text-right" : ""
                }`}
              >
                {message.authorName} · {messageTime(message.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-4 pb-3 sm:px-5">
          <ErrorNote error={error} />
        </div>
      )}

      {/*
       * PINNED TO THE BOTTOM OF THE CARD BELOW `sm`.
       *
       * With the thread uncapped the card is taller than the screen, so an
       * ordinary block composer scrolls away the moment the agent reads back up
       * the conversation, and replying means hunting for the box. Sticky keeps
       * it where a thumb already is.
       *
       * `--c-kb` lifts it off the on-screen keyboard. Android shrinks the layout
       * viewport for us and leaves the variable at 0; iOS does not, and there
       * the composer is otherwise drawn underneath the very keyboard being typed
       * on. `--safe-b` keeps the send button out of the home indicator's gesture
       * strip, where the system swipe wins the tap.
       *
       * The `:has` rule is the same coordination `console.css` already does for
       * `.c-sheet`: an unsaved internal note raises the save bar over this exact
       * corner of the screen, so while one is up the composer rides above it
       * instead of underneath it.
       *
       * From `sm` up it is static, because there the thread is capped and the
       * composer has never left the card.
       */}
      <div className="sticky bottom-[var(--c-kb)] z-10 border-t border-mist-200 bg-white px-3 pt-3 pb-[calc(0.75rem+var(--safe-b))] [body:has(.c-savebar)_&]:bottom-[calc(5.5rem+var(--safe-b)+var(--c-kb))] sm:static">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (sendsOnEnter && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            /* A virtual Return inserts a line, so the key is labelled as one.
               Sentence case and autocorrect because this is a message to a
               customer, which is not what a textarea assumes by default. */
            enterKeyHint="enter"
            autoCapitalize="sentences"
            autoCorrect="on"
            placeholder={
              sendsOnEnter
                ? "Reply to the buyer. Enter sends, Shift+Enter adds a line."
                : "Reply to the buyer"
            }
            className="max-h-40 min-h-[3.5rem] flex-1 resize-none rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500"
          />
          {/* 44px on a phone. It is icon-only, it is the primary action on the
              screen, and it sits against the draft it would otherwise put a
              caret into on a near miss. */}
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || draft.trim() === ""}
            aria-label="Send reply"
            className="c-bevel-primary grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-wine-600 text-white transition-colors hover:bg-wine-700 disabled:cursor-not-allowed sm:h-10 sm:w-10"
          >
            {busy ? (
              <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {signature && (
          /* The one fact that has to be read before sending, so it is not the
             smallest type in the composer on the smallest screen. */
          <p className="mt-2 px-1 text-[12px] text-slate-600 sm:text-[11px]">
            This goes out as <span className="font-semibold text-plum-950">{signature}</span>,
            not your own name.
          </p>
        )}
      </div>
    </Card>
  );
}
