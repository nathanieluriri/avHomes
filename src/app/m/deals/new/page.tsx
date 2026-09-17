"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import {
  formatMoney,
  readRentPeriod,
  type DealKind,
  type Page,
  type Property,
  type RentPeriod,
} from "@avhomes/contracts";
import {
  AppShell,
  BottomBar,
  useMarketer,
  useReportBlock,
} from "@/components/marketer/AppShell";
import { couldEarn } from "@/components/marketer/deals/DealStatus";
import { NairaInput } from "@/components/marketer/deals/NairaInput";
import {
  ProofPicker,
  toApiError,
  useProofUploads,
  type ProofUploads,
} from "@/components/marketer/deals/ProofPicker";
import { IconListings, IconMoney, IconShield } from "@/components/marketer/icons3d";
import {
  listingPhoto,
  listingPlace,
  listingPrice,
} from "@/components/marketer/listings/ListingCard";
import { Amount, EyeButton } from "@/components/marketer/money/Amount";
import { HeroHint, pct } from "@/components/marketer/team/bits";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  Segmented,
  Skeleton,
  Stepper,
  inputCls,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import {
  dateInputToEpoch,
  todayInput,
  type DealCreated,
  type PreviewResponse,
} from "@/lib/marketer/api";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";

/**
 * Reporting a deal, in three steps.
 *
 * Split because it is nine fields and a camera roll on a screen that shows four
 * fields at a time. One long form means a marketer in a car park scrolls past
 * the field they are on every time the keyboard opens, and gives up at the photos.
 */

const STEPS = ["Which home", "The deal", "Proof"] as const;

/* The tab names the step, so the stepper under it says what comes next instead of repeating it. */
const NEXT = ["Next: the deal", "Next: the proof", "Last step"] as const;

const HINTS = [
  "Find the home you sold or rented.",
  "What was agreed, and who with.",
  "Send a photo, then we check it.",
] as const;

const KINDS = [
  { value: "sale" as const, label: "Sold" },
  { value: "rent" as const, label: "Rented" },
];

const PERIOD_WORDS: Record<RentPeriod, string> = {
  year: " a year",
  month: " a month",
  night: " a night",
};

function onPopState(change: () => void) {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

/**
 * `?listing=<id>`, from a listing card's Report a deal. Read from the address
 * rather than `useSearchParams`, which would need a Suspense boundary to build.
 */
function useListingParam(): string | null {
  return useSyncExternalStore(
    onPopState,
    () => new URLSearchParams(window.location.search).get("listing"),
    () => null,
  );
}

/** The public API reads listings by slug only, so a listing named by id is found by paging. */
async function findListing(id: string, signal: AbortSignal): Promise<Property | null> {
  let cursor: string | null = null;
  // Five pages of a hundred is more homes than AV Homes lists.
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const result: Page<Property> = await api.get<Page<Property>>(
      `/public/properties?${params.toString()}`,
      signal,
    );
    const hit = result.items.find((property) => property.id === id);
    if (hit) return hit;
    if (!result.nextCursor) return null;
    cursor = result.nextCursor;
  }
  return null;
}

/** "Thursday 17 September 2026", so a date field showing 09/10 cannot be read the wrong way round. */
function dateWords(value: string): string {
  const at = dateInputToEpoch(value);
  if (at === 0) return "";
  return new Date(at).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ════════════════════════════════════════════════════════════ STEP 1: HOME ══ */

function ListingCard({ property, onPick }: { property: Property; onPick: () => void }) {
  const photo = listingPhoto(property);
  const rent = property.listingType === "rent";
  const period = readRentPeriod(property.rentPeriod, property.listingType);
  const place = listingPlace(property);
  const { minor, from } = listingPrice(property);

  return (
    <button
      type="button"
      onClick={onPick}
      className="m-card m-press m-press-light flex min-h-[7rem] w-full items-stretch overflow-hidden text-left"
    >
      <span className="relative block w-[7.25rem] shrink-0 bg-m-raised">
        {photo ? (
          <Image src={photo} alt="" fill sizes="116px" className="object-cover" />
        ) : (
          <span aria-hidden className="grid h-full place-items-center">
            <IconListings size={48} />
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/15">
          {rent ? "For rent" : "For sale"}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-3.5 pr-3">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] font-bold leading-snug text-m-text">
            {property.title}
          </span>
          {place !== "" && (
            <span className="mt-0.5 block truncate text-[13px] text-m-muted">{place}</span>
          )}
          {minor > 0 ? (
            <span className="m-num mt-1.5 block text-[14px] font-bold text-m-link">
              {from && <span className="font-semibold text-m-muted">From </span>}
              {formatMoney(minor, property.currency)}
              {period ? (
                <span className="font-semibold text-m-muted">{PERIOD_WORDS[period]}</span>
              ) : null}
            </span>
          ) : (
            <span className="mt-1.5 block text-[13px] font-semibold text-m-muted">
              Price on request
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-m-faint" aria-hidden />
      </span>
    </button>
  );
}

function ListingCardSkeleton() {
  return (
    <div aria-hidden className="m-card flex min-h-[7rem] overflow-hidden">
      <Skeleton className="w-[7.25rem] shrink-0" radius="0" />
      <div className="flex-1 px-3.5 py-3.5">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <Skeleton className="mt-3 h-4 w-24" />
      </div>
    </div>
  );
}

function PickHome({ onPick }: { onPick: (property: Property) => void }) {
  const [typed, setTyped] = useState("");
  const query = useDebounced(typed.trim(), 300);

  const results = useAsync(
    (signal) =>
      api.get<Page<Property>>(
        `/public/properties?limit=8${query === "" ? "" : `&q=${encodeURIComponent(query)}`}`,
        signal,
      ),
    [query],
    { keepPrevious: true },
  );

  const items = results.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Field label="Find the home" hint="Type part of the name, the estate or the city.">
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-m-faint"
            aria-hidden
          />
          <input
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Kuje Estate, Lekki, 3 bedroom"
            autoComplete="off"
            enterKeyHint="search"
            className={`${inputCls} pl-11`}
          />
        </span>
      </Field>

      {results.error && <ErrorNote error={results.error} onRetry={results.reload} />}

      {!results.error && results.loading && items.length === 0 && (
        <div className="space-y-3">
          <ListingCardSkeleton />
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </div>
      )}

      {!results.error && !results.loading && items.length === 0 && (
        <EmptyState
          art={<IconListings size={88} />}
          title="No home by that name"
          hint="Try fewer words, or the name of the estate on its own. If the home is not on AV Homes yet, call the office and they will add it."
        />
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-2.5 px-1 text-[13px] font-semibold text-m-muted">
            {query === "" ? "Newest on AV Homes" : "Homes that match"}
          </p>
          <ul
            aria-busy={results.loading || undefined}
            className={`space-y-3 transition-opacity duration-150 ${results.loading ? "opacity-60" : ""}`}
          >
            {items.map((property) => (
              <li key={property.id}>
                <ListingCard property={property} onPick={() => onPick(property)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ STEP 2: DEAL ══ */

/** The home the form is filled in for, found from a listing card's link. */
function FindingHome() {
  return (
    <div aria-hidden className="m-card flex items-center gap-3 p-2.5 pr-3">
      <Skeleton className="h-14 w-14 shrink-0" radius="14px" />
      <span className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2 h-3 w-2/5" />
      </span>
      <Skeleton className="h-9 w-20" radius="12px" />
    </div>
  );
}

function PickedHome({ property, onChange }: { property: Property; onChange: () => void }) {
  const photo = listingPhoto(property);
  const place = listingPlace(property);
  return (
    <div className="m-card flex items-center gap-3 p-2.5 pr-3">
      <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-m-raised">
        {photo ? (
          <Image src={photo} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <span aria-hidden className="grid h-full place-items-center">
            <IconListings size={36} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">
          {property.title}
        </span>
        {place !== "" && (
          <span className="mt-0.5 block truncate text-[13px] text-m-muted">{place}</span>
        )}
      </span>
      <Button size="sm" variant="quiet" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

interface FactsProps {
  kind: DealKind;
  setKind: (next: DealKind) => void;
  amountMinor: number;
  setAmountMinor: (next: number) => void;
  buyerName: string;
  setBuyerName: (next: string) => void;
  buyerPhone: string;
  setBuyerPhone: (next: string) => void;
  closedOn: string;
  setClosedOn: (next: string) => void;
  showErrors: boolean;
}

/** What the amount typed so far would pay, worked out as it is typed from the rates the app was given. */
function LiveEarn({
  amountMinor,
  kind,
  currency,
}: {
  amountMinor: number;
  kind: DealKind;
  currency: string;
}) {
  const { me } = useMarketer();
  const estimate = couldEarn(amountMinor, kind, me?.rates);

  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-m-raised py-2 pl-2 pr-3.5 ring-1 ring-m-line">
      <IconMoney size={40} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-m-text">You could earn</span>
        <span className="block truncate text-[12px] text-m-muted">
          {estimate ? `${pct(estimate.rate)} of it, once it is approved` : "Working it out"}
        </span>
      </span>
      <span className="shrink-0 text-m-text">
        {estimate ? (
          <Amount minor={estimate.minor} currency={currency} size="md" />
        ) : (
          <Skeleton className="h-5 w-20" />
        )}
      </span>
    </div>
  );
}

function DealFacts(props: FactsProps & { currency: string }) {
  const noAmount = props.showErrors && props.amountMinor <= 0;
  const noName = props.showErrors && props.buyerName.trim().length < 2;
  const noDate = props.showErrors && props.closedOn === "";
  const picked = dateWords(props.closedOn);

  return (
    <div className="space-y-5">
      <Field label="What happened" as="group">
        <Segmented
          value={props.kind}
          options={KINDS}
          onChange={props.setKind}
          label="Sold or rented"
        />
      </Field>

      <div className="space-y-2.5">
        <Field
          label="What they paid in the end"
          hint="The final figure, not the asking price."
          error={noAmount ? "Put in the amount they paid." : undefined}
          as="group"
        >
          <NairaInput
            value={props.amountMinor}
            onChange={props.setAmountMinor}
            invalid={noAmount}
            label="What they paid in the end, in naira"
          />
        </Field>
        <LiveEarn amountMinor={props.amountMinor} kind={props.kind} currency={props.currency} />
      </div>

      <Field label="Buyer name" error={noName ? "We need a name to check the deal." : undefined}>
        <input
          type="text"
          value={props.buyerName}
          onChange={(event) => props.setBuyerName(event.target.value)}
          placeholder="Chidinma Okafor"
          autoComplete="off"
          autoCapitalize="words"
          className={`${inputCls} ${noName ? "m-bad" : ""}`}
        />
      </Field>

      <Field label="Buyer phone" hint="Helps the office confirm it. You can leave it out.">
        <input
          type="tel"
          inputMode="tel"
          value={props.buyerPhone}
          onChange={(event) => props.setBuyerPhone(event.target.value)}
          placeholder="0803 000 0000"
          autoComplete="off"
          className={`m-num ${inputCls}`}
        />
      </Field>

      <Field
        label="Date it was done"
        hint={picked !== "" ? `You picked ${picked}.` : "The day they paid, or signed."}
        error={noDate ? "Pick the day it closed." : undefined}
      >
        <input
          type="date"
          value={props.closedOn}
          max={todayInput()}
          onChange={(event) => props.setClosedOn(event.target.value)}
          className={`m-num ${inputCls} ${noDate ? "m-bad" : ""}`}
        />
      </Field>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ STEP 3: PROOF ══ */

/**
 * First on the step, because it is the reason anybody finishes it. It says
 * "could" in every state: nothing is owed until an admin has seen the proof.
 */
function CouldEarn({
  amountMinor,
  kind,
  currency,
}: {
  amountMinor: number;
  kind: DealKind;
  currency: string;
}) {
  const [hidden] = useMoneyHidden();
  const debounced = useDebounced(amountMinor, 400);
  const preview = useAsync(
    () =>
      debounced > 0
        ? api.post<PreviewResponse>("/marketing/deals/preview", {
            amountMinor: debounced,
            listingType: kind,
          })
        : Promise.resolve({ amountMinor: 0, rate: 0 }),
    [debounced, kind],
    { keepPrevious: true },
  );

  const line =
    preview.data && preview.data.rate > 0 && amountMinor > 0
      ? `That is ${preview.data.rate}% of ${formatMoney(amountMinor, currency)}, once AV Homes approves it.`
      : "Put the amount in on the step before this one.";

  return (
    <div className="m-update m-update--wine min-h-0 justify-start pb-4 pt-3">
      <span aria-hidden className="m-update__art">
        <IconMoney size={76} />
      </span>
      <div className="flex items-center gap-1 pr-20">
        <p className="text-[13px] font-semibold text-white/85">You could earn</p>
        <span className="-my-2">
          <EyeButton onWine />
        </span>
      </div>
      <p className="mt-1 pr-20" style={{ "--m-figure": "2.25rem" } as CSSProperties}>
        {preview.loading && !preview.data ? (
          <Skeleton onWine className="h-9 w-40" />
        ) : (
          <Amount minor={preview.data?.amountMinor ?? 0} currency={currency} size="hero" />
        )}
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-white/80">
        {hidden ? maskMoney(line) : line}
      </p>
    </div>
  );
}

function ProofStep({
  uploads,
  note,
  setNote,
  amountMinor,
  kind,
  currency,
  showErrors,
}: {
  uploads: ProofUploads;
  note: string;
  setNote: (next: string) => void;
  amountMinor: number;
  kind: DealKind;
  currency: string;
  showErrors: boolean;
}) {
  return (
    <div className="space-y-5">
      <CouldEarn amountMinor={amountMinor} kind={kind} currency={currency} />

      <ProofPicker
        uploads={uploads}
        label="Proof"
        hint="An alert, a receipt or the signed agreement. Up to five photos."
        error={showErrors && uploads.items.length === 0 ? "Send at least one photo." : undefined}
      />

      <Field label="Anything we should know?" hint="Not required.">
        <textarea
          value={note}
          rows={3}
          maxLength={600}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Paid in two parts, second part cleared on Monday."
          className={`${inputCls} resize-none`}
        />
      </Field>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ FLOW ══ */

/*
 * A paused or closed account is refused on the first photo and again on send,
 * so it is told before three steps of typing. The gate, the tab and the bar
 * each read the block themselves: they render inside AppShell, which is the
 * only place `me` exists.
 */

function ReportGate({ children }: { children: ReactNode }) {
  const block = useReportBlock();
  if (!block) return children;
  return (
    <EmptyState
      art={<IconShield size={96} />}
      title="You cannot report a deal right now"
      hint={`${block} Read Help, or call AV Homes, to find out why.`}
      action={
        <ButtonLink href="/m/help" size="lg" variant="secondary">
          Get help
        </ButtonLink>
      }
    />
  );
}

function FlowTab({ step }: { step: number }) {
  return useReportBlock() ? "Not right now" : STEPS[step - 1];
}

/** The step's hint, or nothing when the body says why the form is closed. */
function FlowHint({ step }: { step: number }) {
  if (useReportBlock()) return null;
  return <HeroHint art={false}>{HINTS[step - 1]}</HeroHint>;
}

function FlowBar({ children }: { children: ReactNode }) {
  return useReportBlock() ? null : <BottomBar>{children}</BottomBar>;
}

export default function NewDealPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);

  const [picked, setPicked] = useState<Property | null>(null);
  const [kind, setKind] = useState<DealKind>("sale");
  const [amountMinor, setAmountMinor] = useState(0);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [closedOn, setClosedOn] = useState(todayInput);
  const [note, setNote] = useState("");
  const uploads = useProofUploads();

  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(property: Property) {
    setPicked(property);
    setKind(property.listingType);
    // The asking price is a starting point, never the answer.
    setAmountMinor(listingPrice(property).minor);
    setShowErrors(false);
    setStep(2);
  }

  // A listing card's Report a deal names its home, so the form opens on step 2 with it picked.
  const listingId = useListingParam();
  const preset = useAsync(
    async (signal) => {
      if (!listingId) return null;
      try {
        return { id: listingId, property: await findListing(listingId, signal) };
      } catch (err) {
        if (signal.aborted) throw err;
        // The search on step 1 still works, and says so if the API is down.
        return { id: listingId, property: null };
      }
    },
    [listingId],
  );
  const [presetFor, setPresetFor] = useState<string | null>(null);
  // Checked against the id, because the first render after the address changes still holds the last answer.
  if (listingId !== null && presetFor !== listingId && preset.data?.id === listingId) {
    setPresetFor(listingId);
    if (preset.data.property) pick(preset.data.property);
  }
  const finding = listingId !== null && presetFor !== listingId;
  const notFound = listingId !== null && presetFor === listingId && picked === null;

  const currency = picked?.currency ?? "NGN";

  const stepOk =
    step === 1
      ? picked !== null
      : step === 2
        ? amountMinor > 0 && buyerName.trim().length >= 2 && closedOn !== ""
        : uploads.items.length > 0;

  async function submit() {
    if (!picked) return;
    setShowErrors(true);
    if (uploads.items.length === 0) return;

    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.post<DealCreated>("/marketing/deals", {
        listingId: picked.id,
        listingTitle: picked.title.slice(0, 300),
        listingLocation: [picked.location, picked.city].filter(Boolean).join(", ").slice(0, 200),
        listingEstate: "",
        listingType: kind,
        unitKey: "",
        amountMinor,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        proof: uploads.urls,
        note: note.trim(),
        closedOn: dateInputToEpoch(closedOn),
      });
      // Replace, not push: back from the deals must not land inside a form already sent.
      router.replace(result.alsoClaimed ? "/m/deals?new=claimed" : "/m/deals?new=1");
    } catch (err) {
      setSubmitError(toApiError(err));
      setBusy(false);
    }
  }

  function next() {
    if (!stepOk) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((was) => Math.min(3, was + 1));
  }

  function back() {
    // Opened from a listing card, step 2 is where the form began, so back is that card.
    const fromCard = listingId !== null && picked?.id === listingId;
    if (step === 1 || (step === 2 && fromCard)) {
      if (listingId !== null && window.history.length > 1) router.back();
      else router.push("/m/deals");
      return;
    }
    setShowErrors(false);
    setStep((was) => was - 1);
  }

  return (
    <AppShell
      title="Report a deal"
      hero={<FlowHint step={step} />}
      onBack={back}
      nav={null}
      tab={<FlowTab step={step} />}
      bottomBar={
        step > 1 ? (
          <FlowBar>
            {step === 2 ? (
              <PrimaryButton onClick={next}>Next</PrimaryButton>
            ) : (
              <PrimaryButton
                onClick={() => void submit()}
                busy={busy}
                disabled={uploads.sending !== null}
              >
                {!busy && <Check className="h-5 w-5" aria-hidden />}
                {busy ? "Sending it in" : "Send it in"}
              </PrimaryButton>
            )}
          </FlowBar>
        ) : null
      }
    >
      <div className="px-4">
        <ReportGate>
          <div className="space-y-5 pb-32">
            <Stepper step={step} labels={NEXT} />

            {step > 1 && picked && (
              <PickedHome
                property={picked}
                onChange={() => {
                  setStep(1);
                  setShowErrors(false);
                }}
              />
            )}

            {step === 1 && finding && <FindingHome />}

            {step === 1 && !finding && (
              <>
                {notFound && (
                  <Note tone="warn">
                    We could not find that home on AV Homes. It may have been taken down. Search
                    for it below.
                  </Note>
                )}
                <PickHome onPick={pick} />
              </>
            )}

            {step === 2 && (
              <DealFacts
                currency={currency}
                kind={kind}
                setKind={setKind}
                amountMinor={amountMinor}
                setAmountMinor={setAmountMinor}
                buyerName={buyerName}
                setBuyerName={setBuyerName}
                buyerPhone={buyerPhone}
                setBuyerPhone={setBuyerPhone}
                closedOn={closedOn}
                setClosedOn={setClosedOn}
                showErrors={showErrors}
              />
            )}

            {step === 3 && (
              <ProofStep
                uploads={uploads}
                note={note}
                setNote={setNote}
                amountMinor={amountMinor}
                kind={kind}
                currency={currency}
                showErrors={showErrors}
              />
            )}

            {submitError && <ErrorNote error={submitError} onRetry={() => void submit()} />}
          </div>
        </ReportGate>
      </div>
    </AppShell>
  );
}
