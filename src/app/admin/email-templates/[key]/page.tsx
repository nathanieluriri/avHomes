"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { MailOpen } from "lucide-react";
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_KEYS, type EmailTemplate, type EmailTemplateKey } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { MailGate, MailNotConfiguredAlert } from "@/components/admin/MailStatus";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  Switch,
  inputClass,
} from "@/components/admin/ui";

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function EmailTemplatePage() {
  const { key } = useParams<{ key: string }>();
  const valid = (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key);
  const { data, error, loading, reload } = useAsync<{ template: EmailTemplate } | null>(
    (signal) => (valid ? api.get<{ template: EmailTemplate }>(`/admin/email-templates/${key}`, signal) : Promise.resolve(null)),
    [key],
  );

  if (!valid) {
    return <EmptyState title="No such template" hint="Go back to Email templates and pick one from the list." />;
  }
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  return <Editor key={`${data.template.updatedAt ?? 0}`} template={data.template} onSaved={reload} />;
}

function Editor({ template, onSaved }: { template: EmailTemplate; onSaved: () => void }) {
  const info = EMAIL_TEMPLATES[template.key as EmailTemplateKey];
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "reset" | "test">(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const dirty = subject !== template.subject || body !== template.body;

  // The preview follows the draft while the switch is on, a moment after typing stops.
  const draft = useDebounced(JSON.stringify([subject, body]), 350);
  useEffect(() => {
    if (!previewing) return;
    const [s = "", b = ""] = JSON.parse(draft) as string[];
    if (s.trim() === "" || b.trim() === "") return;
    const controller = new AbortController();
    api
      .post<{ email: { subject: string; html: string } }>(`/admin/email-templates/${template.key}/preview`, { subject: s, body: b })
      .then((res) => {
        if (controller.signal.aborted) return;
        setPreview(res.email);
        setPreviewError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setPreviewError(asApiError(err));
      });
    return () => controller.abort();
  }, [previewing, draft, template.key]);

  async function run(kind: "save" | "reset" | "test") {
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
      } else {
        const res = await api.post<{ sent: boolean; to: string }>(`/admin/email-templates/${template.key}/test`, { subject, body });
        setNotice(res.sent ? `Test sent to ${res.to}.` : "The test could not be sent.");
      }
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(null);
    }
  }

  function insert(name: string) {
    const field = bodyRef.current;
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
    <>
      <PageHeader
        title={info.label}
        icon={MailOpen}
        backTo="/admin/email-templates"
        backLabel="Email templates"
        subtitle={info.when}
        badge={
          <Badge tone={template.customised ? "wine" : "neutral"}>
            {template.customised
              ? `Edited${template.updatedAt ? ` ${shortDate(template.updatedAt)}` : ""}${template.updatedByName ? ` by ${template.updatedByName}` : ""}`
              : "Default wording"}
          </Badge>
        }
      />
      <MailNotConfiguredAlert />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-slate-600">{dirty ? "Unsaved changes." : "Saved."}</p>
          <Switch
            checked={previewing}
            onChange={setPreviewing}
            label="Preview"
            description={previewing ? "Showing the finished email" : "Showing the editor"}
          />
        </div>

        {previewing ? (
          <div className="space-y-2">
            {previewError && <ErrorNote error={previewError} />}
            {preview ? (
              <>
                <p className="text-[13px] text-slate-600">
                  <span className="font-semibold text-plum-950">Subject:</span> {preview.subject}
                </p>
                <p className="text-xs text-slate-500">Filled in with example details so it reads like a real email.</p>
                <iframe
                  title={`${info.label} preview`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[36rem] w-full rounded-xl border border-mist-200 bg-mist-50"
                />
              </>
            ) : (
              !previewError && <Skeleton className="h-[36rem]" />
            )}
          </div>
        ) : (
          <>
            <Field label="Subject">
              <input className={inputClass} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
            </Field>

            <div>
              <label htmlFor="template-body" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Body
              </label>
              <textarea
                id="template-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className={`${inputClass} font-mono text-[13px] leading-relaxed`}
              />
              <p className="mt-1 text-xs text-slate-600">
                A blank line starts a new paragraph. Links become clickable. Write{" "}
                <code className="text-wine-700">[words](link)</code> to show the words as the link instead of the
                address.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Insert a placeholder</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {info.variables.map((v) => (
                  <li key={v.name}>
                    <button
                      type="button"
                      onClick={() => insert(v.name)}
                      className="flex w-full items-baseline gap-2 rounded-lg border border-mist-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-wine-500"
                    >
                      <code className="shrink-0 text-[12px] font-semibold text-wine-700">{`{{${v.name}}}`}</code>
                      <span className="min-w-0 truncate text-[12px] text-slate-600">{v.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {notice && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" role="status">
            {notice}
          </p>
        )}
        {error && <ErrorNote error={error} />}

        <div className="flex flex-wrap gap-2 border-t border-mist-100 pt-4">
          <Button onClick={() => void run("save")} disabled={busy !== null || !dirty}>
            {busy === "save" ? "Saving" : "Save"}
          </Button>
          <MailGate>
            {(mailOff) => (
              <Button variant="ghost" onClick={() => void run("test")} disabled={mailOff || busy !== null}>
                {busy === "test" ? "Sending" : "Send me a test"}
              </Button>
            )}
          </MailGate>
          {template.customised && (
            <ConfirmButton confirmLabel="Yes, restore default" onConfirm={() => void run("reset")} disabled={busy !== null}>
              Restore default
            </ConfirmButton>
          )}
        </div>
      </Card>
    </>
  );
}
