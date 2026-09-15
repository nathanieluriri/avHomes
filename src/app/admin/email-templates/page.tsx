"use client";

import { useState } from "react";
import { MailOpen } from "lucide-react";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { Badge, Button, Card, ConfirmButton, ErrorNote, Field, PageHeader, Skeleton, inputClass } from "@/components/admin/ui";

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function EmailTemplatesPage() {
  const { data, error, loading, reload } = useAsync<{ items: EmailTemplate[] }>(
    (signal) => api.get<{ items: EmailTemplate[] }>("/admin/email-templates", signal),
    [],
  );

  return (
    <>
      <PageHeader
        title="Email templates"
        icon={MailOpen}
        subtitle="The wording of every email the site sends. Placeholders in {{double braces}} are filled in for each person."
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-96" />}
      <div className="space-y-4">
        {data?.items.map((template) => (
          <TemplateEditor key={`${template.key}-${template.updatedAt ?? 0}`} template={template} onSaved={reload} />
        ))}
      </div>
    </>
  );
}

function TemplateEditor({ template, onSaved }: { template: EmailTemplate; onSaved: () => void }) {
  const info = EMAIL_TEMPLATES[template.key];
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [busy, setBusy] = useState<null | "save" | "reset" | "preview" | "test">(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const dirty = subject !== template.subject || body !== template.body;
  const bodyId = `template-body-${template.key}`;

  async function run(kind: "save" | "reset" | "preview" | "test") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "save") {
        await api.put(`/admin/email-templates/${template.key}`, { subject, body });
        onSaved();
      } else if (kind === "reset") {
        await api.del(`/admin/email-templates/${template.key}`);
        onSaved();
      } else if (kind === "preview") {
        const res = await api.post<{ email: { html: string } }>(`/admin/email-templates/${template.key}/preview`, { subject, body });
        setPreviewHtml(res.email.html);
      } else {
        const res = await api.post<{ sent: boolean; to: string }>(`/admin/email-templates/${template.key}/test`, { subject, body });
        setNotice(res.sent ? `Test sent to ${res.to}.` : "Mail is not configured, so nothing was sent.");
      }
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(null);
    }
  }

  function insert(name: string) {
    const field = document.getElementById(bodyId) as HTMLTextAreaElement | null;
    const token = `{{${name}}}`;
    if (!field) return setBody((b) => b + token);
    const start = field.selectionStart ?? body.length;
    const end = field.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-plum-950">{info.label}</h2>
          <p className="text-[13px] text-slate-600">{info.when}</p>
        </div>
        <Badge tone={template.customised ? "wine" : "neutral"}>
          {template.customised ? `Edited${template.updatedAt ? ` ${shortDate(template.updatedAt)}` : ""}` : "Default wording"}
        </Badge>
      </div>

      <Field label="Subject">
        <input className={inputClass} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </Field>

      <div>
        <label htmlFor={bodyId} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Body
        </label>
        <textarea
          id={bodyId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className={`${inputClass} font-mono text-[13px] leading-relaxed`}
        />
        <p className="mt-1 text-xs text-slate-600">A blank line starts a new paragraph. Links become clickable.</p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Insert a placeholder</p>
        <div className="flex flex-wrap gap-1.5">
          {info.variables.map((v) => (
            <button
              key={v.name}
              type="button"
              title={v.description}
              onClick={() => insert(v.name)}
              className="c-tap rounded-full border border-mist-200 bg-white px-2.5 py-1 font-mono text-[12px] text-plum-950 transition-colors hover:border-wine-500"
            >
              {`{{${v.name}}}`}
              <span className="sr-only">: {v.description}</span>
            </button>
          ))}
        </div>
      </div>

      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" role="status">{notice}</p>}
      {error && <ErrorNote error={error} />}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run("save")} disabled={busy !== null || !dirty}>
          {busy === "save" ? "Saving" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => void run("preview")} disabled={busy !== null}>
          {busy === "preview" ? "Rendering" : "Preview"}
        </Button>
        <Button variant="ghost" onClick={() => void run("test")} disabled={busy !== null}>
          {busy === "test" ? "Sending" : "Send me a test"}
        </Button>
        {template.customised && (
          <ConfirmButton confirmLabel="Yes, restore default" onConfirm={() => void run("reset")} disabled={busy !== null}>
            Restore default
          </ConfirmButton>
        )}
      </div>

      {previewHtml && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPreviewHtml(null)}>
              Close preview
            </Button>
          </div>
          <iframe title={`${info.label} preview`} srcDoc={previewHtml} sandbox="" className="h-[32rem] w-full rounded-lg border border-mist-200" />
        </div>
      )}
    </Card>
  );
}
