"use client";

import { useId, useState } from "react";
import { Send } from "lucide-react";
import type { MarketerMessage } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { dateTime } from "@/lib/admin/format";
import { MAIL_OFF_REASON, MailGate, useMailConfigured } from "./MailStatus";
import { Badge, Button, Card, CardHead, EmptyState, ErrorNote, Field, inputClass } from "./ui";

/** A private email to one partner. Their reply comes straight back to the admin who wrote it. */
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
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<MarketerMessage[]>(initial);
  const mail = useMailConfigured();
  const noEmail = email.trim() === "";

  async function send() {
    setBusy(true);
    setError(null);
    setNotice(null);
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

  return (
    <Card>
      <CardHead title="Email" />
      {!open ? (
        <>
          <p className="text-[12px] text-slate-600">
            {noEmail ? "This partner has no email address on their profile." : `Write to ${name || "them"} privately.`}
          </p>
          {mail && !mail.configured && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">{MAIL_OFF_REASON}</p>
          )}
          <Button variant="ghost" className="mt-3 w-full" disabled={noEmail} onClick={() => setOpen(true)}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Write an email
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <Field label="Subject">
            <input
              className={inputClass}
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <label htmlFor={fieldId} className="block text-[12px] font-semibold text-plum-950">
            Message to {email}
          </label>
          <textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={5000}
            className={inputClass}
          />
          {error && <ErrorNote error={error} />}
          <div className="flex flex-wrap gap-2">
            <MailGate>
              {(mailOff) => (
                <Button
                  onClick={() => void send()}
                  disabled={mailOff || busy || subject.trim() === "" || message.trim() === ""}
                >
                  {busy ? "Sending" : "Send email"}
                </Button>
              )}
            </MailGate>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" role="status">
          {notice}
        </p>
      )}

      <div className="mt-4 border-t border-mist-100 pt-3">
        <p className="mb-2 text-[12px] font-semibold text-plum-950">Messages sent</p>
        {sent.length === 0 ? (
          <EmptyState bare title="None yet" hint="Emails you send from here are kept on this page." />
        ) : (
          <ul className="space-y-2">
            {sent.map((m) => (
              <li key={m.id} className="rounded-xl border border-mist-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-plum-950">{m.subject}</span>
                  {!m.delivered && <Badge tone="red">Not delivered</Badge>}
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-[12px] text-slate-600">{m.body}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {m.sentByName} · {dateTime(m.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
