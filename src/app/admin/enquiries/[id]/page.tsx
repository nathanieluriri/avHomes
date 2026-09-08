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
import { Conversation } from "@/components/admin/Conversation";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ErrorNote,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
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
  new: "wine",
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
        {/* The same columns and the same `asideFirstOnMobile` as the screen it
            is waiting for, so contact and status do not swap places with the
            thread the moment the data lands. */}
        <div aria-busy="true">
          <span className="sr-only">Loading this enquiry</span>
          <PageColumns
            asideFirstOnMobile
            asideWidth="18rem"
            aside={
              <div className="space-y-4">
                <Skeleton className="h-40 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            }
          >
            <Skeleton className="h-64 rounded-2xl" />
          </PageColumns>
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
      if (body.note !== undefined) {
        setNote(res.enquiry.note ?? "");
      }
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
        /* No Save here, the same as its two siblings. Saving belongs to the
           bar, which appears the moment there is anything to save. */
      />

      {saveError && (
        <div className="mb-4">
          <ErrorNote error={saveError} />
        </div>
      )}

      {/* `asideFirstOnMobile`. The aside holds the two things anybody opens an
          enquiry to do: ring the buyer, and say what happened to it. Below `lg`
          the old grid put both of them after the whole thread and a four-row
          note box, so the phone number was the last thing on the screen. */}
      <PageColumns
        asideFirstOnMobile
        asideWidth="18rem"
        aside={
          <aside className="space-y-4">
            <Card>
              <CardHead title="Contact" />
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-wine-50 text-[11px] font-bold text-wine-700">
                  {initials(enquiry.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-plum-950">
                    {enquiry.name}
                  </span>
                </span>
              </div>

              {/* Real rows below `sm`. The `tel:` link dials the buyer, which is
                  the single most valuable control in the console on a phone, and
                  it was a 32px strip with a 14px glyph in it. */}
              <div className="mt-3 space-y-1.5">
                <a
                  href={`mailto:${enquiry.email}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-wine-700 transition-colors hover:bg-wine-50 sm:min-h-0 sm:gap-2 sm:py-1.5"
                >
                  <Mail className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  <span className="truncate">{enquiry.email}</span>
                </a>
                {enquiry.phone && (
                  <a
                    href={`tel:${enquiry.phone}`}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-wine-700 transition-colors hover:bg-wine-50 sm:min-h-0 sm:gap-2 sm:py-1.5"
                  >
                    <Phone className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                    <span className="truncate">{enquiry.phone}</span>
                  </a>
                )}
              </div>
            </Card>

            {enquiry.propertySlug && (
              <Card>
                <CardHead title="About" />
                {/* A navigation control, so it is drawn as one below `sm` rather
                    than as a run of body text. The negative margin keeps it
                    optically flush with the heading above it. */}
                <a
                  href={`/listings/${enquiry.propertySlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="-mx-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-wine-600 hover:bg-wine-50 hover:text-wine-700 sm:mx-0 sm:min-h-0 sm:px-0 sm:hover:bg-transparent"
                >
                  <span className="truncate">{enquiry.propertySlug}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
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
                  rather than beside so the pill keeps its shape.

                  A stacked full-width grid below `sm`. Three 32px pills 8px
                  apart is where a tap meant for Closed lands on Spam, and Spam
                  is the move nobody wants to make by accident. */}
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                {ENQUIRY_STATUSES.filter((status) => status !== enquiry.status).map((status) => (
                  <Button
                    key={status}
                    variant="ghost"
                    className="w-full sm:w-auto"
                    disabled={busy}
                    onClick={() => void patch({ status })}
                    title={MOVES[status]}
                  >
                    {humanise(status)}
                  </Button>
                ))}
              </div>
              {/* Each button carries its own meaning, so the sentence under them
                  does not try to gloss a subset. Assembling one from two picked
                  statuses produced copy that named Spam after Spam had been
                  chosen and never mentioned Closed at all. */}
              <dl className="mt-3 space-y-1 border-t border-mist-100 pt-3">
                {ENQUIRY_STATUSES.filter((status) => status !== enquiry.status).map((status) => (
                  <div key={status} className="flex gap-2 text-[12px]">
                    <dt className="w-14 shrink-0 font-semibold text-slate-600">
                      {humanise(status)}
                    </dt>
                    <dd className="min-w-0 flex-1 text-slate-600">{MOVES[status]}</dd>
                  </div>
                ))}
              </dl>

              {enquiry.handledByName && (
                <p className="mt-3 border-t border-mist-100 pt-3 text-[12px] text-slate-600">
                  Last moved by {enquiry.handledByName}
                </p>
              )}
            </Card>
          </aside>
        }
      >
        <div className="space-y-4">
          {/* The thread replaces the old single-message card. A chat renders as
              a conversation with a reply box; a form enquiry still renders as
              one quoted message, because that is all it is. */}
          <Conversation enquiry={enquiry} onChange={setEnquiry} />

          <Card>
            <CardHead title="Internal note" />
            <p className="mb-2 text-[12px] text-slate-600">
              Only the team sees this. It is never sent to the person who wrote in.
            </p>
            {/* The drag-to-resize corner does not answer to a finger, so below
                `sm` the box is simply the size it is and the save bar is the
                workflow. */}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              placeholder="What was agreed, what is outstanding, who is picking it up."
              className={`${inputClass} resize-none sm:resize-y`}
            />
          </Card>
        </div>
      </PageColumns>
    </>
  );
}
