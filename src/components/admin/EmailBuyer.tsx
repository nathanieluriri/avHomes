"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { ApiError, api } from "@/lib/admin/client";
import { Button, Card, CardHead, ErrorNote, inputClass } from "./ui";

/**
 * A written follow-up to the buyer: the message, the whole conversation, and a
 * private link where they can reply in the chat. Their email reply comes back
 * to whoever sent it.
 */
export function EmailBuyer({ enquiryId, name, email }: { enquiryId: string; name: string; email: string }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  async function run(preview: boolean) {
    setBusy(preview ? "preview" : "send");
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ email?: { html: string }; sent: boolean; to?: string }>(
        `/admin/enquiries/${enquiryId}/email`,
        { message, preview },
      );
      if (preview) {
        setPreviewHtml(res.email?.html ?? null);
      } else {
        setNotice(`Sent to ${res.to}. Their reply comes to your inbox, or into the chat if they use the link.`);
        setMessage("");
        setPreviewHtml(null);
        setOpen(false);
      }
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
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setOpen(true)}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Write an email
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <label htmlFor={fieldId} className="block text-[12px] font-semibold text-plum-950">
            Message to {email}
          </label>
          <textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Just checking in: is Saturday still good for the viewing?"
            className={inputClass}
          />
          <p className="text-[11px] text-slate-600">
            Sent with the{" "}
            <Link href="/admin/email-templates" className="font-semibold text-wine-700 underline underline-offset-2">
              Follow up template
            </Link>
            .
          </p>
          {error && <ErrorNote error={error} />}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(false)} disabled={busy !== null || message.trim() === ""}>
              {busy === "send" ? "Sending" : "Send email"}
            </Button>
            <Button variant="ghost" onClick={() => void run(true)} disabled={busy !== null || message.trim() === ""}>
              {busy === "preview" ? "Rendering" : "Preview"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
          {previewHtml && (
            <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="mt-2 h-96 w-full rounded-lg border border-mist-200" />
          )}
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
