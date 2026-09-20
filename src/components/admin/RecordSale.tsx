"use client";

import { useEffect, useState } from "react";
import {
  CLOSER_KINDS,
  CLOSER_KIND_HINT,
  CLOSER_KIND_LABEL,
  formatMoney,
  parseMajor,
  moneyRefusalMessage,
  recordSaleRefusal,
  type ChainMember,
  type CloserKind,
  type DealKind,
  type DealSplit,
  type FundKind,
  type Ownership,
} from "@avhomes/contracts";
import { api, ApiError } from "@/lib/admin/client";
import { toApiError } from "@/lib/admin/marketing";
import { BottomSheet } from "./BottomSheet";
import ImagePicker from "./ImagePicker";
import { MoneyInput } from "./listing/MoneyInput";
import { Segmented } from "./listing/Segmented";
import { OwnershipBadge } from "./OwnershipBadge";
import { SplitBreakdown } from "./SplitBreakdown";
import { Button, ErrorNote, Field, inputClass } from "./ui";

/**
 * The ONE door from live to closed.
 *
 * Reachable from three places and identical in all three: the listing's own "Mark
 * as sold" action, the alert raised when a marketer's deal is approved, and
 * "Record a deal" for a sale that happened offline. One component, so the
 * evidence a closed listing carries never depends on which button somebody used.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ORDER OF THE QUESTIONS IS THE DESIGN.
 *
 * Each answer narrows the next, and the breakdown is LAST, immediately above the
 * confirm button, because it is what the person is actually confirming. Putting it
 * at the top would make it a thing they scrolled past before the amount existed.
 *
 * The refusal comes from `recordSaleRefusal`, the server's own function, so the
 * sheet never says yes to something the API will refuse.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Remounted per opening, which is how the pre-fill happens without an effect.
 *
 * The `key` carries the listing and the deal, so opening the sheet builds fresh
 * state from `useState` initialisers rather than seeding it in an effect and
 * cascading a second render. It also means a sheet closed halfway through never
 * reopens holding last time's half-typed amount.
 */
export function RecordSale(props: Parameters<typeof RecordSaleForm>[0]) {
  if (!props.open) return null;
  return <RecordSaleForm key={`${props.listing.id}:${props.fromDeal?.dealId ?? "new"}`} {...props} />;
}

function RecordSaleForm({
  open,
  onOpenChange,
  listing,
  /** Pre-filled from a marketer's approved deal, when that is what this settles. */
  fromDeal,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: {
    id: string;
    title: string;
    ownership: Ownership;
    listingType: DealKind;
    priceMinor: number;
    currency: string;
  };
  fromDeal?: {
    dealId: string;
    amountMinor: number;
    buyerName: string;
    buyerPhone: string;
    proof: string[];
    closerKind: CloserKind;
    closerId: string;
    closerName: string;
  };
  onDone: () => void;
}) {
  const sold = listing.listingType === "sale";
  /*
   * Seeded from the deal being settled, or from the asking price, in the
   * INITIALISER rather than an effect. An admin confirming a marketer's report has
   * to be confirming that marketer's numbers, not retyping them and risking a
   * different figure; and a new sale opens on the asking price because that is
   * what it usually went for and always the number somebody is about to correct.
   */
  const [amount, setAmount] = useState(
    String((fromDeal?.amountMinor ?? listing.priceMinor) / 100),
  );
  const [buyerName, setBuyerName] = useState(fromDeal?.buyerName ?? "");
  const [buyerPhone, setBuyerPhone] = useState(fromDeal?.buyerPhone ?? "");
  const [closedOn, setClosedOn] = useState(today());
  const [proof, setProof] = useState<string[]>(fromDeal?.proof ?? []);
  const [note, setNote] = useState("");
  const [closerKind, setCloserKind] = useState<CloserKind>(
    fromDeal?.closerKind ?? "marketer",
  );
  const [marketer, setMarketer] = useState<ChainMember | null>(
    fromDeal && fromDeal.closerKind === "marketer"
      ? { id: fromDeal.closerId, name: fromDeal.closerName, code: "", status: "active" }
      : null,
  );
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<ChainMember[]>([]);
  const [split, setSplit] = useState<DealSplit | null>(null);
  const [fundNames, setFundNames] = useState<Record<FundKind, string>>({
    reward: "Reward Pool",
    foundation: "AV Foundation",
  });
  const [splitOpen, setSplitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /** Named so the preview effect can depend on it without the closer object. */
  const marketerId = marketer?.id ?? "";

  const parsed = parseMajor(amount || "0", listing.currency);
  const amountMinor = parsed.ok ? parsed.minor : 0;

  const closer =
    closerKind === "marketer"
      ? marketer
        ? ({ kind: "marketer", marketerId: marketer.id } as const)
        : null
      : closerKind === "staff"
        ? ({ kind: "staff", userId: "", name: "" } as const)
        : ({ kind: "direct" } as const);

  const refusal =
    !parsed.ok
      ? moneyRefusalMessage(parsed.reason, listing.currency)
      : (recordSaleRefusal({
          amountMinor,
          buyerName,
          proof,
          closer: { kind: closerKind },
          closedOn: Date.parse(`${closedOn}T12:00:00`),
        }) ??
        (closerKind === "marketer" && !marketer ? "Pick which marketer closed it." : null));

  /* The live breakdown. Re-read whenever the amount or the closer changes, because
     those are the two things that change the answer, and the number somebody
     confirms has to be the number the server would produce. */
  useEffect(() => {
    /* No `setSplit(null)` on the way out. Clearing state synchronously inside an
       effect cascades a render, so the stale value is DERIVED away below instead:
       see `shownSplit`. */
    if (!open || amountMinor <= 0) return;
    /*
     * REBUILT HERE from `closerKind` and the marketer id, rather than closing over
     * the `closer` above. That one is a fresh object on every render, so naming it
     * as a dependency would re-fire this effect on every keystroke anywhere in the
     * form; these two primitives are what actually change the answer.
     */
    const body =
      closerKind === "marketer"
        ? marketerId
          ? { kind: "marketer" as const, marketerId }
          : null
        : closerKind === "staff"
          ? { kind: "staff" as const, userId: "", name: "" }
          : { kind: "direct" as const };
    if (!body) return;

    let live = true;
    const timer = window.setTimeout(() => {
      void api
        .post<{ split: DealSplit; fundNames: Record<FundKind, string> }>(
          "/admin/marketing/sales/preview",
          {
            listingId: listing.id,
            kind: listing.listingType,
            amountMinor,
            closer: body,
          },
        )
        .then((res) => {
          if (!live) return;
          setSplit(res.split);
          setFundNames(res.fundNames);
        })
        .catch(() => {
          // A preview that fails is not worth an error over the form. The confirm
          // still refuses on the server if anything is actually wrong.
          if (live) setSplit(null);
        });
      // Debounced, because this fires on every keystroke in the amount field.
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, amountMinor, closerKind, marketerId, listing.id, listing.listingType]);

  useEffect(() => {
    // Same rule as above: the stale list is derived away in `shownFound`.
    if (closerKind !== "marketer" || search.trim().length < 2) return;
    let live = true;
    const timer = window.setTimeout(() => {
      void api
        .get<{ closers: ChainMember[] }>(
          `/admin/marketing/closers?q=${encodeURIComponent(search.trim())}`,
        )
        .then((res) => {
          if (live) setFound(res.closers);
        })
        .catch(() => {
          if (live) setFound([]);
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search, closerKind]);

  /*
   * DERIVED, not cleared.
   *
   * A split fetched for one amount must not be shown beside another, and a search
   * list must not survive the box being emptied. Both are dropped here, at render,
   * rather than with a setState inside an effect, which would cascade a render for
   * something a comparison answers.
   */
  const shownSplit = amountMinor > 0 && closer ? split : null;
  const shownFound = closerKind === "marketer" && search.trim().length >= 2 ? found : [];

  async function confirm() {
    if (refusal || !closer) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/marketing/sales", {
        listingId: listing.id,
        unitKey: "",
        kind: listing.listingType,
        amountMinor,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        closedOn: Date.parse(`${closedOn}T12:00:00`),
        proof,
        note: note.trim(),
        closer,
        ...(fromDeal ? { dealId: fromDeal.dealId } : {}),
      });
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={sold ? "Record the sale" : "Record the let"}
      description={listing.title}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* The button says what it will DO, both halves of it, because it closes
              a listing as well as recording money and "Submit" would hide that. */}
          <Button onClick={() => void confirm()} disabled={busy || refusal !== null}>
            {busy
              ? "Recording..."
              : sold
                ? "Record it and close this listing"
                : "Record it and mark this let"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote error={error} />}

        {fromDeal && (
          <p className="rounded-xl bg-wine-50 px-3 py-2 text-[12px] leading-relaxed text-wine-700">
            Filled in from the deal {fromDeal.closerName} reported, proof included.
            Change anything that is wrong before you confirm.
          </p>
        )}

        <div className="flex items-center gap-2">
          <OwnershipBadge ownership={listing.ownership} />
          <span className="text-[12px] text-slate-600">
            {listing.ownership === "av"
              ? "AV Homes' own property."
              : "Somebody else's property, so it pays a smaller commission."}
          </span>
        </div>

        <Field
          label={sold ? "What it sold for" : "What was paid"}
          hint="Correct the asking price if the final figure was different."
        >
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <Field label="Who closed it" as="group">
          <Segmented
            value={closerKind}
            onChange={(next) => setCloserKind(next as CloserKind)}
            options={CLOSER_KINDS.map((kind) => ({
              value: kind,
              label: CLOSER_KIND_LABEL[kind],
            }))}
          />
          {/* The consequence of the choice, in one line, under it. This is the
              field that decides whether anybody gets paid. */}
          <p className="mt-1.5 text-[12px] text-slate-600">{CLOSER_KIND_HINT[closerKind]}</p>

          {closerKind === "marketer" && (
            <div className="mt-2">
              {marketer ? (
                <div className="flex items-center gap-2 rounded-lg bg-mist-100 px-3 py-2">
                  <span className="text-[13px] font-medium text-plum-950">{marketer.name}</span>
                  {marketer.code && (
                    <span className="c-num text-[12px] text-slate-550">{marketer.code}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMarketer(null);
                      setSearch("");
                    }}
                    className="c-tap ml-auto text-[12px] font-medium text-wine-700 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className={inputClass}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Their code or their name"
                  />
                  {shownFound.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {shownFound.map((option) => (
                        <li key={option.id}>
                          <button
                            type="button"
                            onClick={() => setMarketer(option)}
                            className="c-tap flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-mist-100"
                          >
                            <span className="text-[13px] text-plum-950">{option.name}</span>
                            <span className="c-num text-[12px] text-slate-550">
                              {option.code}
                            </span>
                            {option.status !== "active" && (
                              <span className="ml-auto text-[11px] text-amber-700">
                                {option.status} · earns nothing
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {search.trim().length >= 2 && shownFound.length === 0 && (
                    <p className="mt-1 text-[12px] text-slate-600">Nobody by that name or code.</p>
                  )}
                </>
              )}
            </div>
          )}
        </Field>

        <Field label="Who bought it">
          <input
            className={inputClass}
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            placeholder="Their full name"
          />
        </Field>

        <Field label="Their phone" hint="Optional, but it is what makes the record traceable.">
          <input
            className={inputClass}
            value={buyerPhone}
            onChange={(event) => setBuyerPhone(event.target.value)}
            inputMode="tel"
          />
        </Field>

        <Field label="When it closed">
          <input
            className={inputClass}
            type="date"
            value={closedOn}
            max={today()}
            onChange={(event) => setClosedOn(event.target.value)}
          />
        </Field>

        <Field
          label="The proof"
          hint="At least one: a receipt, a bank alert, or the signed agreement."
        >
          <ImagePicker value={proof} onChange={setProof} max={8} />
        </Field>

        <Field label="Anything worth noting" hint="Optional.">
          <input
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {/*
          LAST, above the button, because it is what is being confirmed. Collapsed,
          so the sheet does not end in five lines of arithmetic somebody has to
          scroll past to reach the button.
        */}
        {shownSplit && (
          <SplitBreakdown
            amountMinor={amountMinor}
            currency={listing.currency}
            people={shownSplit.people}
            funds={shownSplit.funds}
            keptMinor={shownSplit.keptMinor}
            names={fundNames}
            open={splitOpen}
            onToggle={() => setSplitOpen((was) => !was)}
            heading="What this pays out"
          />
        )}

        {refusal && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {refusal}
          </p>
        )}

        {!refusal && shownSplit && (
          <p className="text-[12px] leading-relaxed text-slate-600">
            This records {formatMoney(amountMinor, listing.currency)} against{" "}
            {listing.title} and takes it off the market. It can be reversed by
            cancelling the deal.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/** Today as `YYYY-MM-DD`, for the date input's value and its ceiling. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
