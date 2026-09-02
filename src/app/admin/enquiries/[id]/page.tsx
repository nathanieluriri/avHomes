"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Inbox, Mail, Phone } from "lucide-react";
import {
  ENQUIRY_STATUSES,
  type Enquiry,
  type EnquiryStatus,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, humanise, initials } from "@/lib/admin/format";
import { SaveBar } from "@/components/admin/SaveBar";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ErrorNote,
  PageHeader,
  Skeleton,
  type Tone,
} from "@/components/admin/ui";

/**
 * One enquiry, and the two things anyone does with it: read it, and say what
 * happened to it.
 *
 * It exists because the inbox list needed somewhere for a row to go. The old
 * screen expanded every message and every control inline, which meant the queue
 * could not be scanned and a single reply took as much room as ten.
 */

const TONE: Record<EnquiryStatus, Tone> = {
  new: "blue",
  open: "amber",
  closed: "neutral",
  spam: "red",
};

/** What each move is FOR, in the words of somebody working the queue. */
const MOVES: Record<EnquiryStatus, string> = {
  new: "Put it back in the unanswered pile",
  open: "Working on it",
  closed: "Answered, or nothing more to do",
  spam: "Not a real enquiry",
};

export default function EnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<{ enquiry: Enquiry }>(
    (signal) => api.get<{ enquiry: Enquiry }>(`/admin/enquiries/${id}`, signal),
    [id],
  );

  /* Both branches keep the header, so the way back survives a failure and the
     rise never animates an empty sheet. */
  if (loading) {
    return (
      <>
        <PageHeader icon={Inbox} backTo="/admin/enquiries" backLabel="Enquiries" title="Enquiry" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" aria-busy="true">
          <span className="sr-only">Loading this enquiry</span>
          <Skeleton className="h-64 rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader icon={Inbox} backTo="/admin/enquiries" backLabel="Enquiries" title="Enquiry" />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }

  if (!data) return null;

  // Keyed, so moving between enquiries builds fresh note state rather than
  // carrying one person's draft note onto another person's message.
  return <EnquiryDetail key={data.enquiry.id} initial={data.enquiry} />;
}

function EnquiryDetail({ initial }: { initial: Enquiry }) {
  const [enquiry, setEnquiry] = useState<Enquiry>(initial);
  const [note, setNote] = useState(enquiry.note ?? "");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  const dirty = note !== (enquiry.note ?? "");

  async function patch(body: { status?: EnquiryStatus; note?: string | null }) {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await api.patch<{ enquiry: Enquiry }>(`/admin/enquiries/${enquiry.id}`, {
        ...body,
        baseRevision: enquiry.revision,
      });
      setEnquiry(res.enquiry);
      /*
       * ONLY RE-SEED THE FIELD THIS WRITE ACTUALLY TOUCHED.
       *
       * A status move and a note save come through here together, and adopting
       * the stored note unconditionally meant clicking "Closed" with an unsaved
       * note in the box threw that note away: the textarea emptied, the save bar
       * vanished, and the screen reported itself clean a moment after losing the
       * work. The placeholder in that box invites the operator to write what was
       * agreed BEFORE deciding the status, so this was the likely order of use,
       * not an unlucky one.
       *
       * `setEnquiry` above still refreshes the revision, so the draft that
       * survives can be saved against the CAS token the move just bumped.
       */
      if (body.note !== undefined) setNote(res.enquiry.note ?? "");
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SaveBar
        when={dirty}
        saving={busy}
        onDiscard={() => {
          setNote(enquiry.note ?? "");
          setSaveError(null);
        }}
        onSave={() => void patch({ note: note.trim() === "" ? null : note })}
      />

      <PageHeader
        icon={Inbox}
        backTo="/admin/enquiries"
        backLabel="Enquiries"
        title={enquiry.name}
        badge={<Badge tone={TONE[enquiry.status]}>{humanise(enquiry.status)}</Badge>}
        subtitle={`Received ${dateTime(enquiry.createdAt)}`}
        /* Its two siblings keep a disabled Save here when the form is clean, so
           the affordance does not vanish from the first place a reader looks.
           This screen was the only editor in the console without one. */
        actions={
          dirty ? undefined : (
            <Button onClick={() => {}} disabled size="lg">
              Save
            </Button>
          )
        }
      />

      {saveError && (
        <div className="mb-4">
          <ErrorNote error={saveError} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Message" />
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-navy-950">
              {enquiry.message}
            </p>
          </Card>

          <Card>
            <CardHead title="Internal note" />
            <p className="mb-2 text-[12px] text-slate-600">
              Only the team sees this. It is never sent to the person who wrote in.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              placeholder="What was agreed, what is outstanding, who is picking it up."
              className="w-full resize-y rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-navy-950 outline-none transition-colors placeholder:text-slate-550 focus:border-blue-500"
            />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHead title="Contact" />
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
                {initials(enquiry.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-navy-950">
                  {enquiry.name}
                </span>
              </span>
            </div>

            <div className="mt-3 space-y-1.5">
              <a
                href={`mailto:${enquiry.email}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-blue-700 transition-colors hover:bg-blue-50"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{enquiry.email}</span>
              </a>
              {enquiry.phone && (
                <a
                  href={`tel:${enquiry.phone}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-blue-700 transition-colors hover:bg-blue-50"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{enquiry.phone}</span>
                </a>
              )}
            </div>
          </Card>

          {enquiry.propertySlug && (
            <Card>
              <CardHead title="About" />
              <a
                href={`/listings/${enquiry.propertySlug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[13px] font-medium text-blue-700 hover:text-blue-800"
              >
                <span className="truncate">{enquiry.propertySlug}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
              <p className="mt-1 text-[12px] text-slate-600">
                They were reading this listing when they wrote in.
              </p>
            </Card>
          )}

          <Card>
            <CardHead title="Status" />
            {/* Only the moves that are not where it already is. A button that
                sets the status it already has is a click that does nothing. */}
            {/* Ghost buttons, the same control the listing and post editors use
                for the same class of action, with the sentence underneath
                rather than beside so the pill keeps its shape. */}
            <div className="flex flex-wrap gap-2">
              {ENQUIRY_STATUSES.filter((status) => status !== enquiry.status).map((status) => (
                <Button
                  key={status}
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void patch({ status })}
                  title={MOVES[status]}
                >
                  {humanise(status)}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
              {MOVES[enquiry.status === "new" ? "open" : "closed"]}, or mark it spam if it is
              not a real enquiry.
            </p>

            {enquiry.handledByName && (
              <p className="mt-3 border-t border-mist-100 pt-3 text-[12px] text-slate-600">
                Last moved by {enquiry.handledByName}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
