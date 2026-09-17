"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Phone, UserRoundSearch } from "lucide-react";
import {
  LEAD_NOTE_MAX,
  LEAD_NOTE_MIN,
  LEAD_REASONS,
  LEAD_STATES,
  LEAD_STATE_HINT,
  LEAD_STATE_LABEL,
  formatMoney,
  isLeadOpen,
  leadWantLine,
  moneyRefusalMessage,
  parseMajor,
  type DealKind,
  type Lead,
  type LeadState,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime } from "@/lib/admin/format";
import { LEAD_TONE, groupDigits, toApiError } from "@/lib/admin/marketing";
import {
  Badge,
  Button,
  Card,
  CardHead,
  DRow,
  DefinitionList,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * One potential buyer, and what to do with them next.
 *
 * The history is on the left because it is the reading, and the controls are on
 * the right because they are the decision. The marketer sees this same history,
 * word for word, on their phone: there is no admin-only note anywhere on this
 * screen, and that is deliberate rather than missing. The moment a second
 * hidden history exists, theirs stops being the history.
 */

export default function BuyerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync<Lead>(
    (signal) => api.get<Lead>(`/admin/marketing/leads/${id}`, signal),
    [id],
  );

  if (error) {
    return (
      <>
        <PageHeader icon={UserRoundSearch} title="Potential buyer" backTo="/admin/marketers/buyers" />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }

  if (!data || loading) {
    return (
      <>
        <PageHeader icon={UserRoundSearch} title="Potential buyer" backTo="/admin/marketers/buyers" />
        <PageColumns aside={<Skeleton className="h-64 w-full" />}>
          <Skeleton className="h-96 w-full" />
        </PageColumns>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={UserRoundSearch}
        title={data.buyerName}
        subtitle={leadWantLine(data)}
        backTo="/admin/marketers/buyers"
        badge={<Badge tone={LEAD_TONE[data.state]}>{LEAD_STATE_LABEL[data.state]}</Badge>}
      />

      <PageColumns asideWidth="22rem" asideFirstOnMobile aside={<Controls lead={data} onDone={reload} />}>
        <Card>
          <CardHead title="What has happened" />
          <p className="mb-4 text-[12.5px] text-slate-600">
            The marketer reads this exact list on their phone, word for word.
          </p>
          <div className="pb-1">
            <Timeline lead={data} />
          </div>
        </Card>
      </PageColumns>
    </>
  );
}

function Timeline({ lead }: { lead: Lead }) {
  return (
    <ol className="space-y-0">
      {lead.events
        .slice()
        .reverse()
        .map((event, index, all) => {
          const last = index === all.length - 1;
          const moved = event.from !== event.to;
          return (
            <li key={`${event.at}-${index}`} className="flex gap-3 pb-5 last:pb-0">
              <span className="flex flex-col items-center">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    index === 0 ? "bg-wine-600" : "bg-slate-300"
                  }`}
                />
                {!last && <span className="mt-1 w-px flex-1 bg-slate-200" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-plum-950">
                  {moved ? LEAD_STATE_LABEL[event.to] : last ? "Logged" : "Note added"}
                  {event.reason !== "" && (
                    <span className="ml-2 font-normal text-wine-700">{event.reason}</span>
                  )}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700">{event.note}</p>
                <p className="mt-1 text-[12px] text-slate-600">
                  {event.bySide === "admin" ? event.byName : `${event.byName} (marketer)`} ·{" "}
                  {dateTime(event.at)}
                </p>
              </div>
            </li>
          );
        })}
    </ol>
  );
}

function Controls({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  /* "" is "no move picked". A finished lead opens on it deliberately: seeding
     the select from the pipeline order would leave a completed sale showing
     "Move to: We called them" with the clawback warning already up, one tap
     from reversing a deal nobody asked to reverse. */
  const [to, setTo] = useState<LeadState | "">(lead.state === "won" ? "" : nextFor(lead.state));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  /* Which rate table pays out. Seeded from what the marketer said the buyer
     wanted, but shown and changeable, because that value arrived from a phone
     and nothing has checked it against the real listing. */
  const [kind, setKind] = useState<DealKind>(lead.wantKind ?? "sale");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const winning = to === "won";
  const picked = to !== "";
  const parsed = winning && amount.trim() !== "" ? parseMajor(amount, lead.currency) : null;
  const amountMinor = parsed?.ok ? parsed.minor : 0;
  const moneyBad = parsed && !parsed.ok ? moneyRefusalMessage(parsed.reason, lead.currency) : null;
  const ready: boolean =
    picked &&
    reason !== "" &&
    note.trim().length >= LEAD_NOTE_MIN &&
    (!winning || (amountMinor > 0 && lead.listingId !== null));

  async function move() {
    if (to === "" || !ready) return;
    setBusy(true);
    setError(null);
    try {
      if (winning) {
        await api.post(`/admin/marketing/leads/${lead.id}/convert`, {
          listingId: lead.listingId,
          listingTitle: lead.listingTitle,
          listingType: kind,
          amountMinor,
          reason,
          note: note.trim(),
        });
      } else {
        await api.post(`/admin/marketing/leads/${lead.id}/state`, { to, reason, note: note.trim() });
      }
      setReason("");
      setNote("");
      setAmount("");
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="The buyer" />
        <div>
          <DefinitionList>
            <DRow label="Name">{lead.buyerName}</DRow>
            <DRow label="Phone">
              <a href={`tel:${lead.buyerPhone}`} className="inline-flex items-center gap-1.5 underline">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {lead.buyerPhone}
              </a>
            </DRow>
            <DRow label="Looking for">{leadWantLine(lead)}</DRow>
            {lead.wantBudgetMinor > 0 && (
              <DRow label="Budget">{formatMoney(lead.wantBudgetMinor, lead.currency)}</DRow>
            )}
            <DRow label="Sent by">
              <Link href={`/admin/marketers/${lead.reporterId}`} className="underline">
                {lead.reporterName} ({lead.reporterCode})
              </Link>
            </DRow>
            <DRow label="Logged">{dateTime(lead.createdAt)}</DRow>
            {lead.dealId && (
              <DRow label="Deal">
                <Link href={`/admin/marketers/deals/${lead.dealId}`} className="underline">
                  Open the deal
                </Link>
              </DRow>
            )}
          </DefinitionList>
        </div>
      </Card>

      <Card>
        <CardHead title="Move it along" />
        <p className="mb-3 text-[12.5px] text-slate-600">
          A reason and a note are required. The marketer reads both.
        </p>
        <div className="space-y-3">
          <Field label="Move to">
            <select
              value={to}
              onChange={(event) => {
                setTo(event.target.value as LeadState | "");
                setReason("");
              }}
              className={inputClass}
            >
              <option value="">Pick a move</option>
              {LEAD_STATES.filter((state) => state !== lead.state).map((state) => (
                <option key={state} value={state}>
                  {LEAD_STATE_LABEL[state]}
                </option>
              ))}
            </select>
          </Field>

          {picked && <p className="text-[12px] text-slate-600">{LEAD_STATE_HINT[to]}</p>}

          {winning && (
            <>
              <Field label="Sale or rent" as="group">
                <div className="flex gap-1.5">
                  {(["sale", "rent"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setKind(option)}
                      aria-pressed={kind === option}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                        kind === option
                          ? "bg-wine-700 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {option === "sale" ? "Sale" : "Rent"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="What did it sell for?"
                hint={
                  moneyBad ??
                  "The commission is worked out from this. It creates an approved deal."
                }
              >
                <input
                  value={amount}
                  onChange={(event) => setAmount(groupDigits(event.target.value))}
                  inputMode="decimal"
                  placeholder="80,000,000"
                  className={inputClass}
                />
              </Field>
              {lead.listingId === null && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                  This buyer has no property attached, so there is nothing to sell them yet. Report
                  the deal from the marketer&apos;s side, or ask them to log which property it was.
                </p>
              )}
            </>
          )}

          {lead.state === "won" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              Moving this off Bought cancels the deal it created. Money already paid comes back as a
              clawback on the marketer&apos;s next pay run, and they see this reason.
            </p>
          )}

          <Field label="Why" as="group">
            <div className="flex flex-wrap gap-1.5">
              {(to === "" ? [] : (LEAD_REASONS[to] ?? [])).map((option: string) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  aria-pressed={reason === option}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                    reason === option
                      ? "bg-wine-700 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Field>

          <Field label="What happened" hint={`At least ${LEAD_NOTE_MIN} characters. The marketer reads this.`}>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={LEAD_NOTE_MAX}
              placeholder="Spoke to him this morning, viewing booked for Saturday at 11."
              className={`${inputClass} resize-y`}
            />
          </Field>

          {error && <ErrorNote error={error} />}

          <Button onClick={() => void move()} disabled={!ready || busy} className="w-full">
            {busy
              ? "Saving..."
              : winning
                ? "Mark as bought, and pay the marketer"
                : picked
                  ? `Move to ${LEAD_STATE_LABEL[to]}`
                  : "Pick a move first"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** The state after this one, so the commonest move is already selected. */
function nextFor(state: LeadState): LeadState {
  const order: LeadState[] = ["new", "contacted", "meeting", "viewed", "offer", "won"];
  const at = order.indexOf(state);
  if (at >= 0 && at < order.length - 1) return order[at + 1]!;
  return isLeadOpen(state) ? "won" : "contacted";
}
