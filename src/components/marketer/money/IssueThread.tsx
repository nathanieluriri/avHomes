"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Send } from "lucide-react";
import type { IssueMessage, PayIssue } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { fullDate, messageTime } from "@/lib/admin/format";
import type { IssueResponse } from "@/lib/marketer/api";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";
import { PhotoGallery } from "../deals/PhotoGallery";
import { toApiError } from "../deals/ProofPicker";
import { Button, ErrorNote, Spin, inputCls } from "../ui";

/**
 * A "did not get this money" report, as a conversation: AV Homes on the left in
 * plum, the marketer on the right in wine. A person who says they were not paid
 * has to see that somebody read it, which is the difference between this and an
 * email nobody answers.
 */
export function IssueThread({
  issue,
  onChanged,
  focusOnMount = false,
}: {
  issue: PayIssue;
  onChanged: (next: PayIssue) => void;
  /** Right after the report is sent, so the reader lands on it. */
  focusOnMount?: boolean;
}) {
  const [hidden] = useMoneyHidden();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "close" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const closed = issue.status === "resolved";

  useEffect(() => {
    if (focusOnMount) card.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  async function run(kind: "reply" | "close", work: () => Promise<IssueResponse>) {
    setBusy(kind);
    setError(null);
    try {
      const result = await work();
      if (kind === "reply") setReply("");
      onChanged(result.issue);
    } catch (err) {
      setError(toApiError(err));
    }
    setBusy(null);
  }

  const send = () => {
    const text = reply.trim();
    if (text === "" || busy) return;
    void run("reply", () =>
      api.post<IssueResponse>(`/marketing/issues/${encodeURIComponent(issue.id)}/reply`, { text }),
    );
  };

  return (
    <div ref={card} tabIndex={-1} className="m-card p-4 outline-none">
      <ol aria-label="Messages" className="space-y-3">
        {issue.messages.map((message, index) => (
          <Bubble key={`${message.at}-${index}`} message={message} hidden={hidden} />
        ))}
      </ol>

      {closed ? (
        <p className="mt-4 flex items-center gap-2 border-t border-m-line pt-3.5 text-[13px] text-m-muted">
          <CircleCheck className="h-4 w-4 shrink-0 text-(color:--m-good-fg)" aria-hidden />
          Sorted{issue.resolvedAt ? ` on ${fullDate(issue.resolvedAt)}` : ""}. Nothing more to do.
        </p>
      ) : (
        <div className="mt-4 border-t border-m-line pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={reply}
              rows={2}
              maxLength={600}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Write a reply"
              aria-label="Write a reply"
              className={`${inputCls} min-w-0 flex-1 resize-none`}
            />
            <button
              type="submit"
              aria-label="Send reply"
              disabled={reply.trim() === "" || busy !== null}
              className="m-btn m-btn--primary h-12 w-12 shrink-0 rounded-full"
            >
              {busy === "reply" ? <Spin /> : <Send className="h-5 w-5" aria-hidden />}
            </button>
          </form>

          {error && <ErrorNote error={error} className="mt-3" />}

          <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-m-ground/60 py-3 pl-3.5 pr-3 ring-1 ring-m-line">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-m-muted">
              Is the money in your bank now?
            </p>
            <Button
              variant="secondary"
              size="md"
              busy={busy === "close"}
              disabled={busy === "reply"}
              onClick={() =>
                void run("close", () =>
                  api.post<IssueResponse>(`/marketing/issues/${encodeURIComponent(issue.id)}/close`),
                )
              }
            >
              {busy !== "close" && (
                <CircleCheck className="h-[18px] w-[18px] text-(color:--m-good-fg)" aria-hidden />
              )}
              Got it now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ message, hidden }: { message: IssueMessage; hidden: boolean }) {
  const mine = message.bySide === "marketer";
  const text = hidden ? maskMoney(message.text) : message.text;

  return (
    <li className={`flex ${mine ? "justify-end pl-9" : "justify-start pr-9"}`}>
      {/* Wine glass for the marketer, the plum of the update cards for AV Homes. */}
      <div
        className={`min-w-0 max-w-full rounded-[20px] px-3.5 pb-2 pt-2.5 ${
          mine
            ? "rounded-br-[6px] bg-[linear-gradient(180deg,#b3445f_0%,#8a2342_100%)] text-white shadow-[inset_0_1px_0_0_rgb(255_214_226/0.3)]"
            : "rounded-bl-[6px] bg-[linear-gradient(180deg,#4a3041_0%,#3a2533_100%)] text-m-text shadow-[inset_0_1px_0_0_rgb(255_255_255/0.07)]"
        }`}
      >
        {mine ? (
          <span className="sr-only">You said</span>
        ) : (
          <p className="mb-0.5 text-[12px] font-bold text-m-link">{message.byName}, AV Homes</p>
        )}
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed [overflow-wrap:anywhere]">
          {text}
        </p>
        {message.proof.length > 0 && (
          <div className="mt-2">
            <PhotoGallery urls={message.proof} name="Photo from AV Homes" variant="row" />
          </div>
        )}
        <p className={`m-num mt-1 text-right text-[11px] ${mine ? "text-white/75" : "text-m-muted"}`}>
          {messageTime(message.at)}
        </p>
      </div>
    </li>
  );
}
