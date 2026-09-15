"use client";

import { useState } from "react";
import { MailPlus } from "lucide-react";
import {
  TEMPLATE_REQUEST_STATUSES,
  isVideoUrl,
  type TemplateRequest,
  type TemplateRequestStatus,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import ImagePicker, { Thumb } from "@/components/admin/ImagePicker";
import { StatusSelect } from "@/components/admin/StatusSelect";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
  type Tone,
} from "@/components/admin/ui";

const LABEL: Record<TemplateRequestStatus, string> = {
  open: "Requested",
  "in-progress": "In progress",
  done: "Template added",
  declined: "Not doing",
};

const MEANING: Record<TemplateRequestStatus, string> = {
  open: "Waiting for the developer to look at it",
  "in-progress": "The developer is building it",
  done: "It is in the template list now",
  declined: "Decided against",
};

const TONE: Record<TemplateRequestStatus, Tone> = {
  open: "amber",
  "in-progress": "wine",
  done: "green",
  declined: "neutral",
};

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function TemplateRequestsPage() {
  const { session } = useSession();
  const isDeveloper = session.status === "signed-in" && session.user.role === "developer";
  const { data, error, loading, reload } = useAsync<{ items: TemplateRequest[] }>(
    (signal) => api.get<{ items: TemplateRequest[] }>("/admin/email-templates/requests", signal),
    [],
    { keepPrevious: true },
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Template requests"
        icon={MailPlus}
        backTo="/admin/email-templates"
        backLabel="Email templates"
        subtitle="Ask the developer for a new kind of email. Describe it and attach examples you like."
        actions={
          !open ? (
            <Button onClick={() => setOpen(true)}>
              <MailPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Request a template
            </Button>
          ) : undefined
        }
      />

      {open && (
        <RequestForm
          onCancel={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            reload();
          }}
        />
      )}

      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.items.length === 0 && !open && (
        <EmptyState
          title="No requests yet"
          hint="Need an email the site does not send yet, like a viewing reminder or a price drop alert? Request it here."
        />
      )}

      <ul className="flex flex-col gap-3">
        {data?.items.map((request) => (
          <RequestCard key={request.id} request={request} isDeveloper={isDeveloper} onChanged={reload} />
        ))}
      </ul>
    </>
  );
}

function RequestForm({ onCancel, onSent }: { onCancel: () => void; onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/email-templates/requests", { title, description, media });
      onSent();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 space-y-4">
      <p className="text-sm font-semibold text-plum-950">New template request</p>
      <Field label="Title" hint="A short name, like Viewing reminder.">
        <input className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" hint="When should it be sent, to whom, and what should it say?">
        <textarea
          className={inputClass}
          rows={5}
          value={description}
          maxLength={4000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Examples (optional)" hint="Screenshots, GIFs or short videos of emails you like." as="group">
        <ImagePicker value={media} onChange={setMedia} max={12} coverLabel="Example" />
      </Field>
      {error && <ErrorNote error={error} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void submit()} disabled={busy || title.trim() === "" || description.trim() === ""}>
          {busy ? "Sending" : "Send to the developer"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function RequestCard({
  request,
  isDeveloper,
  onChanged,
}: {
  request: TemplateRequest;
  isDeveloper: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function move(status: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/email-templates/requests/${request.id}`, { status });
      onChanged();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li id={request.id} className="scroll-mt-24">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-plum-950 [overflow-wrap:anywhere]">{request.title}</h2>
            <p className="text-xs text-slate-600">
              {request.requestedByName} · {shortDate(request.createdAt)}
            </p>
          </div>
          {!isDeveloper && <Badge tone={TONE[request.status]}>{LABEL[request.status]}</Badge>}
        </div>

        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-plum-950 [overflow-wrap:anywhere]">
          {request.description}
        </p>

        {request.media.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Examples">
            {request.media.map((url) => (
              <li key={url} className="overflow-hidden rounded-lg border border-mist-200">
                {isVideoUrl(url) ? (
                  <Thumb url={url} />
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" title="Open full size">
                    <Thumb url={url} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {isDeveloper && (
          <div className="max-w-sm">
            <StatusSelect
              label="Request status"
              value={request.status}
              busy={busy}
              onChange={(status) => void move(status)}
              options={TEMPLATE_REQUEST_STATUSES.map((status) => ({
                value: status,
                label: LABEL[status],
                description: MEANING[status],
                tone: TONE[status],
              }))}
            />
          </div>
        )}
        {request.decidedByName && request.status !== "open" && (
          <p className="text-xs text-slate-500">Last moved by {request.decidedByName}</p>
        )}
        {error && <ErrorNote error={error} />}
      </Card>
    </li>
  );
}
