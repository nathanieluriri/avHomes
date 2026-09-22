"use client";

/* eslint-disable @next/next/no-img-element */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Handshake, TriangleAlert } from "lucide-react";
import {
  DEAL_STATUS_LABEL,
  formatMoney,
  formatPhone,
  moneyRefusalMessage,
  parseMajor,
  personRates,
  plainMajor,
  splitFor,
  type AwaitingClose,
  type Deal,
  type DealShare,
  type MarketingSettings,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, fullDate } from "@/lib/admin/format";
import { DEAL_TONE, toApiError } from "@/lib/admin/marketing";
import { MoneyInput } from "@/components/admin/listing/MoneyInput";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfirmButton,
  DRow,
  DefinitionList,
  EmptyState,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * One deal, and the decision it is waiting for.
 *
 * The evidence is on the left and the money is on the right, because those are
 * two different readings: somebody checks the receipt against the listing
 * first, then decides what it was worth. The split also means the three buttons
 * never move as the proof grid grows.
 */

interface DealDetail {
  deal: Deal;
  /** Settled shares once approved, a preview at today's rates before that. */
  shares: DealShare[];
  alsoClaimed: Deal[];
  rates: MarketingSettings;
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<DealDetail>(
    (signal) => api.get<DealDetail>(`/admin/marketing/deals/${id}`, signal),
    [id],
  );

  /* Both branches keep the header, so the way back survives a failure and the
     rise never animates an empty sheet. */
  if (loading) {
    return (
      <>
        <PageHeader
          icon={Handshake}
          backTo="/admin/marketers/deals"
          backLabel="Deals"
          title="A deal"
        />
        <div aria-busy="true">
          <span className="sr-only">Loading this deal</span>
          <PageColumns
            asideFirstOnMobile
            aside={
              <div className="space-y-4">
                <Skeleton className="h-56 rounded-2xl" />
                <Skeleton className="h-40 rounded-2xl" />
              </div>
            }
          >
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          </PageColumns>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          icon={Handshake}
          backTo="/admin/marketers/deals"
          backLabel="Deals"
          title="A deal"
        />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }

  if (!data) return null;

  // Keyed, so moving between deals builds fresh amount and reason state rather
  // than carrying one decision's typing onto the next deal.
  return <DealScreen key={data.deal.id} initial={data} />;
}

function DealScreen({ initial }: { initial: DealDetail }) {
  const [deal, setDeal] = useState<Deal>(initial.deal);
  const [shares, setShares] = useState<DealShare[]>(initial.shares);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const settled = deal.status === "approved";

  /*
   * The final amount, and what it does to the split.
   *
   * Two values rather than one: the TEXT is what is being typed, and the MINOR
   * is the last thing that parsed. Re-splitting on every keystroke means the
   * preview flickers through the values somebody types on the way to the number
   * they meant, so the commit is on blur.
   */
  const [amountText, setAmountText] = useState(plainMajor(deal.amountMinor, deal.currency));
  const [amountMinor, setAmountMinor] = useState(deal.amountMinor);
  const [amountRefusal, setAmountRefusal] = useState<string | null>(null);

  function commitAmount() {
    const parsed = parseMajor(amountText, deal.currency);
    if (!parsed.ok) {
      setAmountRefusal(moneyRefusalMessage(parsed.reason, deal.currency));
      return;
    }
    if (parsed.minor < 1) {
      setAmountRefusal("A deal has to be worth something.");
      return;
    }
    setAmountRefusal(null);
    setAmountMinor(parsed.minor);
    // Normalised, so what is on screen is the number that will be sent. The
    // grouping is `MoneyInput`'s job and happens as it is typed.
    setAmountText(plainMajor(parsed.minor, deal.currency));
  }

  /*
   * The preview is the server's own arithmetic, repeated.
   *
   * `splitCommission` floors each share at `amount * rate / 100` against the
   * same chain and the same rates the API just handed back in `shares`, so
   * rescaling those lines to a new amount lands on exactly the numbers the
   * approval will write. It is not a second opinion about who earns.
   */
  const lines = settled
    ? shares
    : shares.map((share) => ({
        ...share,
        amountMinor: Math.floor((amountMinor * share.rate) / 100),
      }));
  const paidOut = lines.reduce((sum, line) => sum + line.amountMinor, 0);

  function announce() {
    // The rail's Deals badge is fed by a poll; this is what makes it follow a
    // decision made in this tab instead of up to a minute later.
    window.dispatchEvent(new Event("avhomes:deals-reviewed"));
  }

  async function review(status: "approved" | "rejected" | "info") {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.post<{ deal: Deal }>(`/admin/marketing/deals/${deal.id}/review`, {
        status,
        reason,
        ...(status === "approved" ? { amountMinor } : {}),
      });
      setDeal(res.deal);
      if (res.deal.status === "approved") setShares(res.deal.shares);
      setReason("");
      announce();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.post<{ deal: Deal }>(`/admin/marketing/deals/${deal.id}/cancel`, {
        reason,
      });
      setDeal(res.deal);
      setReason("");
      announce();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /*
   * APPROVED, AND THE HOUSE IS STILL ADVERTISED. Approving settles the money and
   * leaves the listing live, because checking proof and taking a house down are
   * two decisions. Read after every decision, so approving shows the next step
   * at once, and closing it clears the prompt.
   */
  const awaiting = useAsync<{ items: AwaitingClose[] }>(
    (signal) =>
      settled
        ? api.get<{ items: AwaitingClose[] }>(
            `/admin/marketing/awaiting-close?dealId=${encodeURIComponent(deal.id)}`,
            signal,
          )
        : Promise.resolve({ items: [] }),
    [settled, deal.id, deal.updatedAt],
  );
  const stillListed = awaiting.data?.items[0] ?? null;

  async function takeDown() {
    setBusy(true);
    setActionError(null);
    try {
      // Writes no money: that was written when this deal was approved.
      await api.post(`/admin/marketing/deals/${deal.id}/close-listing`);
      awaiting.reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /* A cancelled deal stays cancelled. Everything else is still a decision. */
  const canReview =
    deal.status === "pending" || deal.status === "info" || deal.status === "rejected";

  /* The cell this deal would be priced by TODAY, read by the deal's own ownership
     rather than by a single rate table: a Non-AV property pays less, and an admin
     approving one needs to see the number they are actually approving. */
  const todaysRates = personRates(
    splitFor(initial.rates.commission, deal.ownership, deal.listingType),
  );

  /*
   * A VARIABLE, not a nested component. Declaring `function Aside()` inside
   * this one makes a new element type on every render, so React unmounts the
   * panel and mounts a fresh one each time: the amount field and the reason
   * field would lose focus on every keystroke typed into them.
   */
  const aside = (
    <aside className="space-y-4">
      {/* `deal-decided` tells the walkthrough there is no decision left to make here. */}
      <Card spotlight={canReview ? undefined : "deal-decided"}>
        <CardHead title="Who gets paid" />

        <Field
          label="Final amount"
          spotlight="deal-amount"
          hint={
            settled
              ? "This deal is settled. The shares below are what was written when it was approved."
              : "Correct it if the receipt says something else. The split below follows."
          }
        >
          {/* Grouped while it is typed, like every other amount in the console.
              This one decides what several people are paid, and it read as an
              unbroken run of eight digits. */}
          <MoneyInput
            value={amountText}
            disabled={settled}
            onChange={setAmountText}
            onBlur={commitAmount}
          />
        </Field>
        {amountRefusal && <p className="mt-1 text-[12px] text-red-700">{amountRefusal}</p>}

        <div className="mt-4 space-y-2" data-spotlight="deal-split">
          {lines.length === 0 ? (
            <EmptyState
              bare
              title="Nobody earns on this one"
              hint="The marketer is paused or banned, or every rate is zero. Approving it still records the sale."
            />
          ) : (
            lines.map((line) => (
              <div
                key={line.marketerId}
                className="flex items-baseline justify-between gap-3 rounded-xl bg-mist-50 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-plum-950">
                    {line.marketerName}
                  </span>
                  <span className="block truncate text-[12px] text-slate-600">
                    Level {line.level} · {line.rate}% · {line.code}
                  </span>
                </span>
                <span className="c-num shrink-0 text-[13px] font-semibold text-plum-950">
                  {formatMoney(line.amountMinor, deal.currency)}
                </span>
              </div>
            ))
          )}
        </div>

        <p className="mt-3 border-t border-mist-100 pt-2 text-[12px] leading-relaxed text-slate-600">
          {lines.length > 0 && (
            <>
              {formatMoney(paidOut, deal.currency)} of{" "}
              {formatMoney(settled ? deal.amountMinor : amountMinor, deal.currency)} goes out in
              commission.{" "}
            </>
          )}
          {settled
            ? "Rates were snapshotted when this was approved, so a later change does not move it."
            : `Today's ${deal.listingType === "rent" ? "rent" : "sale"} rates: ${todaysRates.join(" / ")}%.`}
        </p>
      </Card>

      {canReview && (
        <Card spotlight="deal-decide">
          <CardHead title="Decide" />
          <Field
            label="Reason"
            hint="One line, and the marketer reads it. Needed to ask for information or to refuse."
          >
            <input
              className={inputClass}
              value={reason}
              placeholder="The receipt does not show the buyer's name"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <div className="mt-3 flex flex-col gap-2">
            <Button
              size="lg"
              disabled={busy || amountRefusal !== null}
              onClick={() => void review("approved")}
            >
              {busy ? "Working" : "Approve deal"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || reason.trim() === ""}
              onClick={() => void review("info")}
            >
              Ask for info
            </Button>
            <Button
              variant="danger"
              disabled={busy || reason.trim() === ""}
              onClick={() => void review("rejected")}
            >
              Refuse
            </Button>
          </div>
        </Card>
      )}

      {settled && (
        <Card>
          <CardHead title="If it fell through" />
          <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
            Cancelling voids anything not yet sent. Money already paid becomes a
            take-back on the next pay run, subtracted from what that marketer is
            owed then.
          </p>
          <Field label="Reason" hint="The marketer reads this on their own screen.">
            <input
              className={inputClass}
              value={reason}
              placeholder="The buyer pulled out"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="mt-3">
            <ConfirmButton
              confirmLabel="Yes, cancel this deal"
              disabled={busy || reason.trim() === ""}
              onConfirm={() => void cancel()}
              className="w-full"
            >
              Cancel deal
            </ConfirmButton>
          </div>
        </Card>
      )}
    </aside>
  );

  return (
    <>
      <PageHeader
        icon={Handshake}
        backTo="/admin/marketers/deals"
        backLabel="Deals"
        title={deal.listingTitle || "Untitled listing"}
        badge={<Badge tone={DEAL_TONE[deal.status]}>{DEAL_STATUS_LABEL[deal.status]}</Badge>}
        subtitle={`${deal.listingType === "rent" ? "Rental" : "Sale"} reported by ${deal.reporterName} (${deal.reporterCode}).`}
      />

      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}

      {/* The step after approval, offered the moment it applies: the proof was
          just checked, so this is where somebody already knows the house sold. */}
      {stillListed && (
        <div
          data-spotlight="deal-take-down"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-900">
            <span className="font-semibold">The money is on the record.</span> {stillListed.listingTitle || "The listing"} is
            still on the site {stillListed.kind === "rent" ? "to let" : "for sale"}, so buyers can still enquire about it.
          </p>
          <Button onClick={() => void takeDown()} disabled={busy}>
            Take it off the market
          </Button>
        </div>
      )}

      {/* `asideFirstOnMobile`: the aside is the decision, not a footnote to the
          evidence. Collapsed the other way it landed under a grid of receipts on
          a phone, which is where the one thing this screen is for would be. */}
      <PageColumns asideFirstOnMobile aside={aside}>
        <div className="space-y-4">
          <Card spotlight="deal-proof">
            <CardHead title="Proof" />
            {deal.proof.length === 0 ? (
              <EmptyState
                bare
                title="No proof attached"
                hint="The app asks for at least one photo, so this deal predates that rule or came in another way."
              />
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Proof of the deal">
                {deal.proof.map((url) => (
                  <li key={url} className="overflow-hidden rounded-lg border border-mist-200">
                    {/* A plain anchor to the file. A receipt is read by zooming
                        into it, which is the browser's own image view, and a
                        lightbox here would be a worse version of that. */}
                    <a href={url} target="_blank" rel="noreferrer" title="Open full size">
                      <img src={url} alt="" className="aspect-[4/3] w-full bg-mist-100 object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="The deal" />
            <DefinitionList>
              <DRow label="Listing">
                <Link
                  href={`/admin/properties/${deal.listingId}`}
                  className="text-wine-700 underline underline-offset-2"
                >
                  {deal.listingTitle || "Untitled listing"}
                </Link>
              </DRow>
              {deal.unitKey && <DRow label="Unit">{deal.unitKey}</DRow>}
              {deal.listingEstate && <DRow label="Estate">{deal.listingEstate}</DRow>}
              {deal.listingLocation && <DRow label="Location">{deal.listingLocation}</DRow>}
              <DRow label="Kind">{deal.listingType === "rent" ? "Rental" : "Sale"}</DRow>
              <DRow label="Buyer">{deal.buyerName || "Not given"}</DRow>
              <DRow label="Buyer phone">{formatPhone(deal.buyerPhone) || "Not given"}</DRow>
              <DRow label="Marketer">
                <Link
                  href={`/admin/marketers/${deal.reporterId}`}
                  className="text-wine-700 underline underline-offset-2"
                >
                  {deal.reporterName} ({deal.reporterCode})
                </Link>
              </DRow>
              <DRow label="Reported">{dateTime(deal.createdAt)}</DRow>
              {deal.closedOn > 0 && <DRow label="Closed on">{fullDate(deal.closedOn)}</DRow>}
              {deal.reviewedAt !== null && (
                <DRow label="Last decided">
                  {dateTime(deal.reviewedAt)}
                  {deal.reviewedByName ? ` by ${deal.reviewedByName}` : ""}
                </DRow>
              )}
            </DefinitionList>

            {deal.note && (
              <div className="mt-4 border-t border-mist-100 pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  What the marketer wrote
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-plum-950 [overflow-wrap:anywhere]">
                  {deal.note}
                </p>
              </div>
            )}

            {deal.reason && (
              <div className="mt-4 border-t border-mist-100 pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  What we told them
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-plum-950 [overflow-wrap:anywhere]">
                  {deal.reason}
                </p>
              </div>
            )}
          </Card>

          {initial.alsoClaimed.length > 0 && (
            <Card>
              <CardHead title="Somebody else claimed this listing" icon={TriangleAlert} />
              <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
                Only one deal can be approved per listing. Open each one, decide
                which marketer actually closed it, and refuse the rest.
              </p>
              <ul className="space-y-2">
                {initial.alsoClaimed.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/admin/marketers/deals/${other.id}`}
                      className="flex items-center gap-3 rounded-xl border border-mist-200 p-3 transition-colors hover:bg-mist-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-plum-950">
                          {other.reporterName} ({other.reporterCode})
                        </span>
                        <span className="block truncate text-[12px] text-slate-600">
                          {formatMoney(other.amountMinor, other.currency)} · reported{" "}
                          {fullDate(other.createdAt)}
                        </span>
                      </span>
                      <Badge tone={DEAL_TONE[other.status]}>
                        {DEAL_STATUS_LABEL[other.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </PageColumns>
    </>
  );
}
