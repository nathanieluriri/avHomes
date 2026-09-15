"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import type { Newsletter } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import RichText from "@/components/admin/RichText";
import { MailGate, MailNotConfiguredAlert } from "@/components/admin/MailStatus";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function NewsletterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useAsync<{ newsletter: Newsletter }>(
    (signal) => api.get<{ newsletter: Newsletter }>(`/admin/newsletters/${id}`, signal),
    [id],
  );
  const { data: audience } = useAsync<{ active: number }>(
    (signal) => api.get<{ active: number }>("/admin/subscribers?limit=1", signal),
    [],
  );

  const [letter, setLetter] = useState<Newsletter | null>(null);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [content, setContent] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "test" | "send" | "preview">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Adopted during render, once per load, the way the other editors seed their drafts.
  if (data && letter?.id !== data.newsletter.id) {
    setLetter(data.newsletter);
    setSubject(data.newsletter.subject);
    setPreheader(data.newsletter.preheader);
    setContent(data.newsletter.content);
  }

  const sent = letter ? letter.status !== "draft" : false;

  async function save(): Promise<Newsletter | null> {
    if (!letter) return null;
    setBusy("save");
    setActionError(null);
    try {
      const res = await api.put<{ newsletter: Newsletter }>(`/admin/newsletters/${letter.id}`, {
        subject,
        preheader,
        content,
        baseRevision: letter.revision,
      });
      setLetter(res.newsletter);
      setDirty(false);
      return res.newsletter;
    } catch (err) {
      setActionError(asApiError(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    const saved = dirty ? await save() : letter;
    if (!saved) return;
    setBusy("preview");
    try {
      const res = await api.post<{ email: { html: string } }>(`/admin/newsletters/${saved.id}/preview`, {});
      setPreviewHtml(res.email.html);
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function send(mode: "test" | "all") {
    const saved = dirty ? await save() : letter;
    if (!saved) return;
    setBusy(mode === "test" ? "test" : "send");
    setActionError(null);
    setNotice(null);
    try {
      const res = await api.post<{ sent: number; failed?: number; to?: string; newsletter?: Newsletter | null }>(
        `/admin/newsletters/${saved.id}/send`,
        { mode, baseRevision: saved.revision },
      );
      if (mode === "test") {
        setNotice(`Test sent to ${res.to}.`);
      } else {
        if (res.newsletter) setLetter(res.newsletter);
        setNotice(`Sent to ${res.sent} subscriber${res.sent === 1 ? "" : "s"}${res.failed ? `. ${res.failed} failed.` : "."}`);
      }
    } catch (err) {
      setActionError(asApiError(err));
      if (mode === "all") reload();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!letter) return;
    try {
      await api.del(`/admin/newsletters/${letter.id}`);
      router.push("/admin/newsletters");
    } catch (err) {
      setActionError(asApiError(err));
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading || !letter) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        title={subject || "Untitled newsletter"}
        icon={Mail}
        backTo="/admin/newsletters"
        backLabel="Newsletters"
        badge={<Badge tone={sent ? "green" : "amber"}>{sent ? "Sent" : "Draft"}</Badge>}
        subtitle={
          letter.sentAt
            ? `Sent ${shortDate(letter.sentAt)} to ${letter.sentCount} subscribers${letter.failedCount ? `, ${letter.failedCount} failed` : ""}.`
            : dirty
              ? "Unsaved changes."
              : "Saved."
        }
        actions={
          !sent ? (
            <Button onClick={() => void save()} disabled={busy !== null || !dirty}>
              {busy === "save" ? "Saving" : "Save draft"}
            </Button>
          ) : undefined
        }
      />

      <MailNotConfiguredAlert />
      {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" role="status">{notice}</p>}
      {actionError && (
        <div className="mb-3">
          <ErrorNote error={actionError} />
        </div>
      )}

      <PageColumns
        aside={
          <div className="space-y-4">
            <Card className="space-y-3">
              <p className="text-sm font-semibold text-plum-950">Send</p>
              <p className="text-[13px] text-slate-600">
                {audience ? `${audience.active} people are subscribed.` : "Counting subscribers."} Send yourself a test first.
              </p>
              <MailGate className="w-full">
                {(mailOff) => (
                  <Button variant="ghost" className="w-full" onClick={() => void send("test")} disabled={mailOff || busy !== null}>
                    {busy === "test" ? "Sending test" : "Send me a test"}
                  </Button>
                )}
              </MailGate>
              <Button variant="ghost" className="w-full" onClick={() => void preview()} disabled={busy !== null}>
                {busy === "preview" ? "Rendering" : "Preview email"}
              </Button>
              {!sent && (
                <MailGate className="w-full">
                  {(mailOff) => (
                    <ConfirmButton
                      confirmLabel={`Yes, send to ${audience?.active ?? "all"}`}
                      onConfirm={() => void send("all")}
                      disabled={mailOff || busy !== null || subject.trim() === "" || (audience?.active ?? 0) === 0}
                      className="w-full"
                    >
                      {busy === "send" ? "Sending" : "Send to all subscribers"}
                    </ConfirmButton>
                  )}
                </MailGate>
              )}
            </Card>
            {!sent && (
              <Card>
                <ConfirmButton confirmLabel="Yes, delete draft" onConfirm={() => void remove()} className="w-full">
                  Delete draft
                </ConfirmButton>
              </Card>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <Card className="space-y-4">
            <Field label="Subject" hint="The line people see in their inbox.">
              <input
                className={inputClass}
                value={subject}
                maxLength={200}
                disabled={sent}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="Preview text" hint="Shown after the subject in most inboxes. Optional.">
              <input
                className={inputClass}
                value={preheader}
                maxLength={200}
                disabled={sent}
                onChange={(e) => {
                  setPreheader(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="Newsletter" as="group">
              {sent ? (
                <p className="text-[13px] text-slate-600">Sent newsletters cannot be edited. Use Preview email to read it.</p>
              ) : (
                <RichText
                  key={letter.id}
                  value={letter.content}
                  onChange={(doc) => {
                    setContent(doc);
                    setDirty(true);
                  }}
                  placeholder="Write the newsletter..."
                  ariaLabel="Newsletter body"
                />
              )}
            </Field>
          </Card>

          {previewHtml && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-plum-950">Email preview</p>
                <Button variant="ghost" size="sm" onClick={() => setPreviewHtml(null)}>
                  Close
                </Button>
              </div>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[70vh] w-full rounded-lg border border-mist-200"
              />
            </Card>
          )}
        </div>
      </PageColumns>
    </>
  );
}
