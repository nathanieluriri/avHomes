"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MessageSquarePlus, Phone, XCircle } from "lucide-react";
import {
  LEAD_NOTE_MAX,
  LEAD_NOTE_MIN,
  LEAD_REASONS,
  LEAD_STATE_HINT,
  formatMoney,
  isLeadOpen,
  leadWantLine,
  type LeadRow,
} from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { Sheet } from "@/components/marketer/Sheet";
import { SuccessBurst } from "@/components/marketer/SuccessBurst";
import { LeadState, LeadTimeline } from "@/components/marketer/buyers/LeadBits";
import { IconHandshake } from "@/components/marketer/icons3d";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  SectionLabel,
  Skeleton,
  inputCls,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

/**
 * One potential buyer: where they have got to, and every step that got them
 * there.
 *
 * The timeline is the screen. A marketer handed over somebody they know and
 * then lost sight of them, so the thing that keeps them sending more is seeing
 * that real work happened and reading the actual words somebody wrote.
 */

export default function BuyerPage() {
  const { id } = useParams<{ id: string }>();
  const lead = useAsync((signal) => api.get<LeadRow>(`/marketing/leads/${id}`, signal), [id]);
  const [closing, setClosing] = useState(false);
  const [noting, setNoting] = useState(false);

  const data = lead.data;
  const open = data ? isLeadOpen(data.state) : false;

  return (
    <AppShell
      title={data?.buyerName ?? "Buyer"}
      hint={data ? leadWantLine(data) : undefined}
      back="/m/buyers"
      tab="What has happened"
      hero={data ? <HeroState lead={data} /> : undefined}
    >
      <div className="px-4">
        {lead.error && <ErrorNote error={lead.error} onRetry={lead.reload} />}

        {!data && lead.loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[20px]" />
            <Skeleton className="h-40 w-full rounded-[20px]" />
          </div>
        )}

        {data && (
          <>
            <Suspense fallback={null}>
              <LoggedBurst name={data.buyerName} />
            </Suspense>

            {data.state === "won" && data.myShareMinor > 0 && <Paid lead={data} />}

            <div className="mb-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => (window.location.href = `tel:${data.buyerPhone}`)}
              >
                <Phone className="h-4 w-4" aria-hidden />
                Call them
              </Button>
              {open && (
                <Button variant="secondary" className="flex-1" onClick={() => setNoting(true)}>
                  <MessageSquarePlus className="h-4 w-4" aria-hidden />
                  Add a note
                </Button>
              )}
            </div>

            <SectionLabel>What has happened</SectionLabel>
            <Card className="mt-2 px-4 py-4">
              <LeadTimeline events={data.events} />
            </Card>

            {open && (
              <button
                type="button"
                onClick={() => setClosing(true)}
                className="m-tap m-press-light mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] py-3 text-[14.5px] font-semibold text-(color:--m-bad-fg)"
              >
                <XCircle className="h-4 w-4" aria-hidden />
                This one is over
              </button>
            )}

            <MoveSheet
              open={closing}
              onClose={() => setClosing(false)}
              id={data.id}
              onDone={lead.reload}
            />
            <NoteSheet
              open={noting}
              onClose={() => setNoting(false)}
              id={data.id}
              onDone={lead.reload}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function HeroState({ lead }: { lead: LeadRow }) {
  return (
    <div className="mt-4">
      <div className="inline-flex rounded-full bg-white/10 px-1 py-1">
        <LeadState state={lead.state} showTrack={false} />
      </div>
      <p className="mt-2 max-w-[20rem] text-[13.5px] leading-relaxed text-white/75">
        {LEAD_STATE_HINT[lead.state]}
      </p>
    </div>
  );
}

/** What this buyer earned them, once it closed. */
function Paid({ lead }: { lead: LeadRow }) {
  return (
    <div className="m-card mb-4 flex items-center gap-3 px-4 py-4">
      <IconHandshake size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-m-muted">You earned</p>
        <p className="text-[22px] font-bold text-(color:--m-in-fg)">
          {formatMoney(lead.myShareMinor, lead.currency)}
        </p>
      </div>
      <Link href="/m/money" className="m-tap m-link shrink-0 text-[14px] font-semibold">
        Your money
      </Link>
    </div>
  );
}

/** The confetti, once, straight after logging. `?logged=1` is dropped on close. */
function LoggedBurst({ name }: { name: string }) {
  const params = useSearchParams();
  const [shown, setShown] = useState(params.get("logged") === "1");
  if (!shown) return null;

  return (
    <Sheet open onClose={() => setShown(false)} title="" >
      <div className="px-6 pb-4 text-center">
        <SuccessBurst label="Buyer sent to AV Homes" />
        <p className="-mt-4 text-[20px] font-bold text-m-text">{name} is with us</p>
        <p className="mx-auto mt-2 max-w-[18rem] text-[14px] leading-relaxed text-m-muted">
          We will call them and you will see every step on this screen, with the reason for it.
        </p>
        <PrimaryButton className="mt-6" onClick={() => setShown(false)}>
          See what happens
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/**
 * Closing a buyer: a reason, then words.
 *
 * Both are required, and the button stays off until both are there. An app that
 * lets a state change through with an empty reason has a pipeline nobody can
 * read six months later, which is the whole thing this feature is for.
 */
function MoveSheet({
  open,
  onClose,
  id,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const ready = reason !== "" && note.trim().length >= LEAD_NOTE_MIN;

  async function send() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/marketing/leads/${id}/state`, { to: "lost", reason, note: note.trim() });
      onDone();
      onClose();
      setReason("");
      setNote("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Close this buyer"
      hint="Tell us why, so we know not to keep calling them."
    >
      <div className="space-y-4 px-4 pb-2">
        <Field label="Why is it over?" as="group">
          <div className="flex flex-wrap gap-2">
            {LEAD_REASONS.lost.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                aria-pressed={reason === option}
                className={`m-tap rounded-full px-3.5 py-2 text-[13.5px] font-semibold ${
                  reason === option
                    ? "bg-[#a83550] text-white"
                    : "bg-m-raised text-m-muted active:bg-m-line"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What happened?" hint="A line is enough. AV Homes reads this.">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={LEAD_NOTE_MAX}
            placeholder="Said they have put off buying until next year."
            className={`${inputCls} resize-none`}
          />
        </Field>

        {error && <ErrorNote error={error} onRetry={() => void send()} />}

        <PrimaryButton busy={busy} disabled={!ready} onClick={() => void send()}>
          Close this buyer
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/** A line on the timeline that moves nothing. Useful, and still needs words. */
function NoteSheet({
  open,
  onClose,
  id,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send() {
    if (note.trim().length < LEAD_NOTE_MIN) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/marketing/leads/${id}/note`, { note: note.trim() });
      onDone();
      onClose();
      setNote("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a note"
      hint="Anything AV Homes should know about this buyer."
    >
      <div className="space-y-4 px-4 pb-2">
        <Field label="Your note">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={LEAD_NOTE_MAX}
            placeholder="They asked about the payment plan again."
            className={`${inputCls} resize-none`}
          />
        </Field>

        {error && <ErrorNote error={error} onRetry={() => void send()} />}

        <PrimaryButton
          busy={busy}
          disabled={note.trim().length < LEAD_NOTE_MIN}
          onClick={() => void send()}
        >
          Add it
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
