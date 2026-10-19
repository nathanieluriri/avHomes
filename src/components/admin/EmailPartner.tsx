"use client";

import { useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import type { MarketerMessage } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { dateTime } from "@/lib/admin/format";
import { BottomSheet } from "./BottomSheet";
import { MAIL_OFF_REASON, MailGate, useMailConfigured } from "./MailStatus";
import { Badge, Button, Card, CardHead, EmptyState, ErrorNote, Field, inputClass } from "./ui";

/** A private email to one partner, written in a sheet. Their reply comes straight back to the admin who wrote it. */
export function EmailPartner({
  marketerId,
  name,
  email,
  initial,
}: {
  marketerId: string;
  name: string;
  email: string;
  initial: MarketerMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<MarketerMessage[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const mail = useMailConfigured();
  const noEmail = email.trim() === "";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: MarketerMessage }>(`/admin/marketing/marketers/${marketerId}/message`, {
        subject,
        message,
      });
      setSent((rows) => [res.message, ...rows]);
      setNotice(`Sent to ${email}. Their reply comes to your inbox.`);
      setSubject("");
      setMessage("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <MailGate>
        {(mailOff) => (
          <Button onClick={() => void send()} disabled={mailOff || busy || subject.trim() === "" || message.trim() === ""}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {busy ? "Sending" : "Send email"}
          </Button>
        )}
      </MailGate>
      <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHead
        title="Messages sent"
        action={
          <Button size="sm" onClick={() => setOpen(true)} disabled={noEmail}>
            <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Email {name || "them"}
          </Button>
        }
      />
      {noEmail && <p className="mb-3 text-[12px] text-slate-600">This partner has no email address on their profile.</p>}
      {mail && !mail.configured && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{MAIL_OFF_REASON}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {sent.length === 0 ? (
        <EmptyState bare title="No messages sent yet" hint="Emails you send to this partner are kept here." />
      ) : (
        <ul className="divide-y divide-mist-100">
          {sent.map((m) => {
            const isOpen = expanded === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 text-[13px] font-semibold text-plum-950 [overflow-wrap:anywhere]">{m.subject}</span>
                      {!m.delivered && <Badge tone="red">Not delivered</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-slate-600">
                      {m.sentByName} · {dateTime(m.createdAt)}
                    </span>
                    {!isOpen && <span className="mt-1 block truncate text-[12.5px] text-slate-700">{m.body}</span>}
                  </span>
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <p className="-mt-1 whitespace-pre-wrap pb-3 text-[13px] leading-relaxed text-plum-950 [overflow-wrap:anywhere]">
                    {m.body}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`Email ${name || "this partner"}`}
        description={`Sent privately to ${email}. Their reply comes back to your inbox.`}
        footer={footer}
      >
        <div className="space-y-3">
          <Field label="Subject">
            <input className={inputClass} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              maxLength={5000}
              className={inputClass}
            />
          </Field>
          {error && <ErrorNote error={error} />}
        </div>
      </BottomSheet>
    </Card>
  );
}
