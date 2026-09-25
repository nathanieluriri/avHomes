"use client";

import type { ReactNode } from "react";
import { PenLine, Trash2 } from "lucide-react";
import type { MailboxSummary } from "@avhomes/contracts";
import { EmptyState } from "@/components/admin/ui";
import { type Draft, LetterAvatar, htmlToText, listDate } from "./shared";

function snippet(d: Draft): string {
  const body = d.mode === "html" ? htmlToText(d.html) : d.text;
  return body.replace(/\s+/gu, " ").trim();
}

/**
 * "Your drafts": what this member started in the console and closed without
 * sending, newest first. Kept per member on the server, so another device
 * shows the same list. Hostinger's own Drafts folder is separate.
 */
export function DraftList({
  drafts,
  mailboxes,
  phone,
  onOpen,
  onDiscard,
  lead,
}: {
  drafts: Draft[];
  mailboxes: MailboxSummary[];
  phone: boolean;
  onOpen: (d: Draft) => void;
  onDiscard: (d: Draft) => void;
  lead?: ReactNode;
}) {
  const sorted = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
  const from = (id: string) => mailboxes.find((m) => m.resourceId === id)?.address ?? "";
  const many = mailboxes.length > 1;

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${phone ? "pb-[calc(6rem+var(--safe-b))]" : ""}`}>
      {lead}
      {!phone && (
        <div className="flex min-h-12 items-center border-b border-mist-100 px-4">
          <h2 className="text-[13px] font-semibold text-plum-950">Your drafts</h2>
          <span className="ml-2 text-[12px] text-slate-600">Only you see these. They follow you to any device.</span>
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState
          bare
          icon={PenLine}
          title="No drafts"
          hint="Anything you start and close without sending is kept here, on every device you sign in on."
        />
      ) : (
        <ul>
          {sorted.map((d) => {
            const to = [...d.to, ...d.cc, ...d.bcc];
            const text = snippet(d);
            return (
              <li key={d.id} className="group flex items-center border-b border-mist-100 hover:bg-mist-50">
                <button
                  type="button"
                  onClick={() => onOpen(d)}
                  className={`flex min-w-0 flex-1 items-center gap-3 text-left ${phone ? "px-3 py-3" : "py-2.5 pl-4"}`}
                >
                  {phone && <LetterAvatar text={to[0] ?? "?"} toneKey={to[0] ?? d.id} />}
                  <span className={`min-w-0 ${phone ? "flex-1" : "flex flex-1 items-center gap-3"}`}>
                    <span className={`block truncate text-[13px] ${phone ? "" : "w-56 shrink-0"}`}>
                      <span className="font-semibold text-red-700">Draft</span>
                      <span className="text-plum-950">{to.length > 0 ? ` to ${to.join(", ")}` : ""}</span>
                    </span>
                    <span className="block min-w-0 truncate text-[13px] text-plum-950">
                      <span className="font-medium">{d.subject || "(no subject)"}</span>
                      {text && <span className="text-slate-600"> {text.slice(0, 160)}</span>}
                    </span>
                    {many && <span className="hidden shrink-0 text-[11.5px] text-slate-550 xl:inline">{from(d.mailbox)}</span>}
                  </span>
                  <span className="w-20 shrink-0 text-right text-[12px] text-slate-600">
                    {listDate(new Date(d.updatedAt).toISOString())}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Discard draft ${d.subject || "(no subject)"}`}
                  title="Discard draft"
                  onClick={() => onDiscard(d)}
                  className="c-tap mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-550 hover:bg-mist-100 hover:text-red-700 sm:h-8 sm:w-8"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
