"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { ApiError, api } from "@/lib/admin/client";
import { MAIL_OFF_REASON, MailGate, useMailConfigured } from "./MailStatus";
import { useDebounced } from "@/lib/admin/hooks";
import { Button, Card, CardHead, ErrorNote, Switch, inputClass } from "./ui";

/**
 * A written follow-up to the buyer: the message, the whole conversation, and a
 * private link where they can reply in the chat. Their email reply comes back
 * to whoever sent it.
 */
export function EmailBuyer({ enquiryId, name, email }: { enquiryId: string; name: string; email: string }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<null | "send">(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const mail = useMailConfigured();

  // The preview follows the message while the switch is on.
  const debounced = useDebounced(message, 400);
  useEffect(() => {
    if (!previewing || debounced.trim() === "") return;
    let live = true;
    api
      .post<{ email?: { html: string } }>(`/admin/enquiries/${enquiryId}/email`, { message: debounced, preview: true })
      .then((res) => {
        if (live) setPreviewHtml(res.email?.html ?? null);
      })
      .catch((err) => {
        if (live) setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      });
    return () => {
      live = false;
    };
  }, [previewing, debounced, enquiryId]);

  async function run() {
    setBusy("send");
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ sent: boolean; to?: string }>(`/admin/enquiries/${enquiryId}/email`, { message });
      setNotice(`Sent to ${res.to}. Their reply comes to your inbox, or into the chat if they use the link.`);
      setMessage("");
      setPreviewHtml(null);
      setPreviewing(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHead title="Email the buyer" />
      {!open ? (
        <>
          <p className="text-[12px] text-slate-600">
            Send {name || "them"} a follow-up with the conversation so far and a private link to reply in the chat.
          </p>
          {mail && !mail.configured && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">{MAIL_OFF_REASON}</p>
          )}
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setOpen(true)}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Write an email
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={fieldId} className="block text-[12px] font-semibold text-plum-950">
              Message to {email}
            </label>
            <Switch checked={previewing} onChange={setPreviewing} label="Preview" disabled={message.trim() === ""} />
          </div>
          {previewing && message.trim() !== "" ? (
            previewHtml ? (
              <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="h-96 w-full rounded-lg border border-mist-200" />
            ) : (
              <div className="h-96 animate-pulse rounded-lg bg-mist-100" aria-label="Rendering the preview" />
            )
          ) : (
          <textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Just checking in: is Saturday still good for the viewing?"
            className={inputClass}
          />
          )}
          <p className="text-[11px] text-slate-600">
            Sent with the{" "}
            <Link href="/admin/email-templates" className="font-semibold text-wine-700 underline underline-offset-2">
              Follow up template
            </Link>
            .
          </p>
          {error && <ErrorNote error={error} />}
          <div className="flex flex-wrap gap-2">
            <MailGate>
              {(mailOff) => (
                <Button onClick={() => void run()} disabled={mailOff || busy !== null || message.trim() === ""}>
                  {busy === "send" ? "Sending" : "Send email"}
                </Button>
              )}
            </MailGate>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy !== null}>
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
    </Card>
  );
}
