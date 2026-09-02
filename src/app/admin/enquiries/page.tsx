"use client";

import { useState } from "react";
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryStatus, type Page } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/admin/ui";

const TONE: Record<EnquiryStatus, "blue" | "amber" | "neutral" | "red"> = {
  new: "blue",
  open: "amber",
  closed: "neutral",
  spam: "red",
};

export default function EnquiriesPage() {
  const [tab, setTab] = useState<"all" | EnquiryStatus>("new");
  const [rowError, setRowError] = useState<ApiError | null>(null);

  const { data, error, loading, reload } = useAsync<Page<Enquiry>>(
    (signal) =>
      api.get<Page<Enquiry>>(
        `/admin/enquiries?${new URLSearchParams({
          limit: "25",
          ...(tab === "all" ? {} : { status: tab }),
        })}`,
        signal,
      ),
    [tab],
  );

  async function update(enquiry: Enquiry, patch: { status?: EnquiryStatus; note?: string | null }) {
    setRowError(null);
    try {
      await api.patch(`/admin/enquiries/${enquiry.id}`, { ...patch, baseRevision: enquiry.revision });
      reload();
    } catch (err) {
      setRowError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    }
  }

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Everything the contact form and property pages send in." />

      <div className="mb-4 flex flex-wrap gap-1">
        {(["all", ...ENQUIRY_STATUSES] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
              tab === t ? "bg-navy-950 text-white" : "bg-white text-navy-950 hover:bg-mist-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {rowError && (
        <div className="mb-4">
          <ErrorNote error={rowError} />
        </div>
      )}

      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <EmptyState title="Nothing here" hint="New enquiries land in this tab first." />
      )}

      <div className="space-y-4">
        {data?.items.map((enquiry) => (
          <EnquiryRow key={enquiry.id} enquiry={enquiry} onUpdate={update} />
        ))}
      </div>
    </>
  );
}

function EnquiryRow({
  enquiry,
  onUpdate,
}: {
  enquiry: Enquiry;
  onUpdate: (e: Enquiry, patch: { status?: EnquiryStatus; note?: string | null }) => Promise<void>;
}) {
  const [note, setNote] = useState(enquiry.note ?? "");
  const [busy, setBusy] = useState(false);

  async function run(patch: { status?: EnquiryStatus; note?: string | null }) {
    setBusy(true);
    await onUpdate(enquiry, patch);
    setBusy(false);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy-950">{enquiry.name}</p>
          <p className="text-sm text-muted-foreground">
            <a className="underline underline-offset-2" href={`mailto:${enquiry.email}`}>
              {enquiry.email}
            </a>
            {enquiry.phone && <span className="ml-2">{enquiry.phone}</span>}
          </p>
          {enquiry.propertySlug && (
            <p className="mt-1 text-xs text-muted-foreground">
              About{" "}
              <a
                className="underline underline-offset-2"
                href={`/listings/${enquiry.propertySlug}`}
                target="_blank"
                rel="noreferrer"
              >
                {enquiry.propertySlug}
              </a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={TONE[enquiry.status]}>{enquiry.status}</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(enquiry.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-navy-950">{enquiry.message}</p>

      {enquiry.handledByName && (
        <p className="mt-2 text-xs text-muted-foreground">Handled by {enquiry.handledByName}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-mist-100 pt-4">
        {ENQUIRY_STATUSES.filter((s) => s !== enquiry.status).map((s) => (
          <Button key={s} variant="ghost" disabled={busy} onClick={() => run({ status: s })}>
            Mark {s}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          className={`${inputClass} flex-1`}
          placeholder="Internal note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          variant="ghost"
          disabled={busy || note === (enquiry.note ?? "")}
          onClick={() => run({ note: note.trim() === "" ? null : note })}
        >
          Save note
        </Button>
      </div>
    </Card>
  );
}
