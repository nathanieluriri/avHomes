"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Circle, Code2, FileUp, Mail, Monitor, PenLine, Smartphone } from "lucide-react";
import type { Newsletter, NewsletterFormat } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import RichText from "@/components/admin/RichText";
import { MailGate, MailNotConfiguredAlert, useMailConfigured } from "@/components/admin/MailStatus";
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
  Switch,
  inputClass,
} from "@/components/admin/ui";
import "../../rte.css";

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

const FORMATS: { value: NewsletterFormat; title: string; description: string; icon: typeof PenLine }[] = [
  {
    value: "doc",
    title: "Write it here",
    description: "The full editor, like the journal. Best for news, photos and listings.",
    icon: PenLine,
  },
  {
    value: "html",
    title: "Paste an HTML design",
    description: "Code from a designer or an email tool. Scripts and forms are removed, the look is kept.",
    icon: Code2,
  },
];

interface Draft {
  subject: string;
  preheader: string;
  content: unknown;
  format: NewsletterFormat;
  html: string;
}

export default function NewsletterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync<{ newsletter: Newsletter }>(
    (signal) => api.get<{ newsletter: Newsletter }>(`/admin/newsletters/${id}`, signal),
    [id],
  );
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[32rem]" />;
  return <Editor key={data.newsletter.id} initial={data.newsletter} />;
}

function Editor({ initial }: { initial: Newsletter }) {
  const router = useRouter();
  const mail = useMailConfigured();
  const { data: audience } = useAsync<{ active: number }>(
    (signal) => api.get<{ active: number }>("/admin/subscribers?limit=1", signal),
    [],
  );

  const [letter, setLetter] = useState(initial);
  const [subject, setSubject] = useState(initial.subject);
  const [preheader, setPreheader] = useState(initial.preheader);
  const [format, setFormat] = useState<NewsletterFormat>(initial.format);
  const [content, setContent] = useState<unknown>(initial.content);
  const [html, setHtml] = useState(initial.html);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(initial.status !== "draft");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [busy, setBusy] = useState<null | "save" | "test" | "send">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const sent = letter.status !== "draft";
  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  const hasBody = format === "html" ? html.trim() !== "" : true;
  const subscriberCount = audience?.active ?? null;
  const checks = [
    { ok: subject.trim() !== "", label: "Subject written" },
    { ok: hasBody, label: format === "html" ? "HTML design pasted" : "Newsletter written" },
    {
      ok: (subscriberCount ?? 0) > 0,
      label:
        subscriberCount === null
          ? "Counting subscribers"
          : `${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"} to send to`,
    },
    { ok: mail?.configured ?? true, label: mail && !mail.configured ? "Email is not set up" : "Email is set up" },
  ];
  const ready = checks.every((c) => c.ok);

  async function save(): Promise<Newsletter | null> {
    setBusy("save");
    setActionError(null);
    try {
      const res = await api.put<{ newsletter: Newsletter }>(`/admin/newsletters/${letter.id}`, {
        subject,
        preheader,
        content,
        format,
        html,
        baseRevision: letter.revision,
      });
      setLetter(res.newsletter);
      setHtml(res.newsletter.html);
      setDirty(false);
      return res.newsletter;
    } catch (err) {
      setActionError(asApiError(err));
      return null;
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
        setPreviewing(true);
        setNotice(`Sent to ${res.sent} subscriber${res.sent === 1 ? "" : "s"}${res.failed ? `. ${res.failed} failed.` : "."}`);
      }
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    try {
      await api.del(`/admin/newsletters/${letter.id}`);
      router.push("/admin/newsletters");
    } catch (err) {
      setActionError(asApiError(err));
    }
  }

  return (
    <>
      <PageHeader
        title={subject.trim() || "Untitled newsletter"}
        icon={Mail}
        backTo="/admin/newsletters"
        backLabel="Newsletters"
        badge={<Badge tone={sent ? "green" : "amber"}>{sent ? "Sent" : "Draft"}</Badge>}
        subtitle={
          letter.sentAt
            ? `Sent ${shortDate(letter.sentAt)} to ${letter.sentCount} subscriber${letter.sentCount === 1 ? "" : "s"}${letter.failedCount ? `, ${letter.failedCount} failed` : ""}.`
            : dirty
              ? "You have unsaved changes."
              : `Saved. Last edited ${shortDate(letter.updatedAt)}.`
        }
        actions={
          !sent ? (
            <Button onClick={() => void save()} disabled={busy !== null || !dirty}>
              {busy === "save" ? "Saving" : dirty ? "Save draft" : "Saved"}
            </Button>
          ) : undefined
        }
      />

      <MailNotConfiguredAlert />
      {notice && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-800" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}

      <PageColumns
        asideWidth="19rem"
        aside={
          <Card className="space-y-4 lg:sticky lg:top-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Audience</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-plum-950">{subscriberCount ?? "…"}</p>
              <p className="text-[13px] text-slate-600">active subscriber{subscriberCount === 1 ? "" : "s"}</p>
            </div>

            {!sent && (
              <ul className="space-y-1.5 border-t border-mist-100 pt-4" aria-label="Ready to send">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-[13px]">
                    {c.ok ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                    )}
                    <span className={c.ok ? "text-plum-950" : "text-slate-500"}>{c.label}</span>
                    <span className="sr-only">{c.ok ? ", done" : ", not done"}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-mist-100 pt-4">
              <MailGate className="w-full">
                {(mailOff) => (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => void send("test")}
                    disabled={mailOff || busy !== null || !hasBody}
                  >
                    {busy === "test" ? "Sending test" : "Send me a test"}
                  </Button>
                )}
              </MailGate>
              {!sent && (
                <MailGate className="w-full">
                  {(mailOff) => (
                    <ConfirmButton
                      confirmLabel={`Yes, send to ${subscriberCount ?? "all"}`}
                      onConfirm={() => void send("all")}
                      disabled={mailOff || busy !== null || !ready}
                      className="w-full"
                    >
                      {busy === "send" ? "Sending" : "Send to all subscribers"}
                    </ConfirmButton>
                  )}
                </MailGate>
              )}
            </div>

            {!sent && (
              <div className="border-t border-mist-100 pt-3">
                <ConfirmButton confirmLabel="Yes, delete draft" onConfirm={() => void remove()} className="w-full">
                  Delete draft
                </ConfirmButton>
              </div>
            )}
          </Card>
        }
      >
        <div className="space-y-4">
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject" hint="The line people see in their inbox.">
              <input
                className={inputClass}
                value={subject}
                maxLength={200}
                disabled={sent}
                placeholder="What is new at AV Homes this month"
                onChange={(e) => change(setSubject)(e.target.value)}
              />
            </Field>
            <Field label="Preview text" hint="Shown after the subject in most inboxes. Optional.">
              <input
                className={inputClass}
                value={preheader}
                maxLength={200}
                disabled={sent}
                placeholder="Three new homes in Lekki, and a guide to buying off plan"
                onChange={(e) => change(setPreheader)(e.target.value)}
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-plum-950">Design</h2>
              <Switch
                checked={previewing}
                onChange={setPreviewing}
                disabled={sent}
                label="Preview"
                description={previewing ? "Showing the email as it will arrive" : "Showing the editor"}
              />
            </div>

            {!sent && !previewing && <FormatChoice value={format} onChange={change(setFormat)} />}

            {previewing ? (
              <Preview
                newsletterId={letter.id}
                draft={{ subject, preheader, content, format, html }}
                device={device}
                onDevice={setDevice}
              />
            ) : format === "doc" ? (
              <div>
                <p id="nl-body-label" className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Newsletter
                </p>
                <div role="group" aria-labelledby="nl-body-label">
                  <RichText
                    value={content}
                    onChange={change(setContent)}
                    placeholder="Write the newsletter. Type / for headings, images and lists."
                    ariaLabel="Newsletter body"
                  />
                </div>
              </div>
            ) : (
              <HtmlField value={html} onChange={change(setHtml)} />
            )}
          </Card>
        </div>
      </PageColumns>
    </>
  );
}

function FormatChoice({ value, onChange }: { value: NewsletterFormat; onChange: (v: NewsletterFormat) => void }) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        How do you want to build it?
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
        {FORMATS.map((f) => {
          const active = f.value === value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f.value)}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                active ? "border-wine-500 bg-wine-50 ring-1 ring-wine-500" : "border-mist-200 bg-white hover:border-mist-300"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  active ? "bg-wine-600 text-white" : "bg-mist-100 text-slate-600"
                }`}
              >
                <f.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-plum-950">{f.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-slate-600">{f.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Both versions are kept while it is a draft, so switching loses nothing.</p>
    </div>
  );
}

function HtmlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function load(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) {
      setFileError("That file is over 500 KB. Email designs are usually far smaller, so check it is the right file.");
      return;
    }
    setFileError(null);
    void file.text().then(onChange);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="nl-html" className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          HTML design
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Load an .html file
        </Button>
      </div>
      <textarea
        id="nl-html"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={20}
        placeholder={'<!doctype html>\n<html>\n  <body>\n    ...your design...\n    <a href="{{unsubscribeLink}}">Unsubscribe</a>\n  </body>\n</html>'}
        className="block w-full resize-y rounded-xl border border-plum-900 bg-plum-950 p-4 font-mono text-[12.5px] leading-relaxed text-mist-100 outline-none placeholder:text-slate-500 focus:border-wine-500 focus:ring-2 focus:ring-wine-500/30"
      />
      {fileError && <p className="text-[13px] text-red-700">{fileError}</p>}
      <p className="text-xs text-slate-600">
        Put{" "}
        <code className="rounded bg-mist-100 px-1 font-mono text-[11px] text-plum-950">{"{{unsubscribeLink}}"}</code>{" "}
        where your design has an unsubscribe link. Without it, a small unsubscribe footer is added. Turn on Preview to
        see the result.
      </p>
    </div>
  );
}

function Preview({
  newsletterId,
  draft,
  device,
  onDevice,
}: {
  newsletterId: string;
  draft: Draft;
  device: "desktop" | "phone";
  onDevice: (d: "desktop" | "phone") => void;
}) {
  const [email, setEmail] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const body = useDebounced(JSON.stringify(draft), 400);

  useEffect(() => {
    let live = true;
    api
      .post<{ email: { subject: string; html: string } }>(`/admin/newsletters/${newsletterId}/preview`, JSON.parse(body))
      .then((res) => {
        if (!live) return;
        setEmail(res.email);
        setError(null);
      })
      .catch((err) => {
        if (live) setError(asApiError(err));
      });
    return () => {
      live = false;
    };
  }, [body, newsletterId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-slate-600">
          <span className="font-semibold text-plum-950">Subject:</span> {email?.subject || draft.subject || "No subject yet"}
        </p>
        <div role="radiogroup" aria-label="Preview width" className="flex rounded-lg bg-mist-100 p-0.5">
          {(
            [
              { value: "desktop", label: "Desktop", icon: Monitor },
              { value: "phone", label: "Phone", icon: Smartphone },
            ] as const
          ).map((d) => (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={device === d.value}
              onClick={() => onDevice(d.value)}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                device === d.value ? "bg-white text-plum-950 shadow-card" : "text-slate-600 hover:text-plum-950"
              }`}
            >
              <d.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNote error={error} />}
      <div className="flex justify-center rounded-xl border border-mist-200 bg-mist-100 p-3 sm:p-5">
        {email ? (
          <iframe
            title="Newsletter preview"
            srcDoc={email.html}
            sandbox=""
            className={`h-[40rem] rounded-lg bg-white shadow-card transition-[width] ${
              device === "phone" ? "w-[375px] max-w-full" : "w-full"
            }`}
          />
        ) : (
          !error && <Skeleton className="h-[40rem] w-full" />
        )}
      </div>
    </div>
  );
}
