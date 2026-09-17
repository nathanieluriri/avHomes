"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { formatMoney, leadRefusal, type DealKind, type Page, type Property } from "@avhomes/contracts";
import { AppShell, BottomBar, useMarketer, useReportBlock } from "@/components/marketer/AppShell";
import { NairaInput } from "@/components/marketer/deals/NairaInput";
import { IconHandshake } from "@/components/marketer/icons3d";
import {
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  Segmented,
  Skeleton,
  inputCls,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import type { LeadRow } from "@avhomes/contracts";

/**
 * Log somebody who might buy.
 *
 * One screen, not a stepper. Reporting a deal is a stepper because it needs
 * proof files and an amount that has to be right; this needs a name, a number
 * and a sentence, and a three-step wizard over three fields is ceremony that
 * costs leads.
 *
 * The property is optional on purpose. Most real leads start vague, and a
 * required picker does not make a marketer find the right listing, it makes
 * them pick a near-enough one that the admin then works from as if it were
 * true.
 */

interface Picked {
  id: string;
  title: string;
  kind: DealKind;
}

/**
 * The state lives here; both the fields and the pinned bar are the shell's.
 *
 * Two constraints meet awkwardly and this is the shape that satisfies both.
 * `useMarketer` and `useReportBlock` read a context AppShell provides, so
 * nothing above AppShell may call them. And `BottomBar` is `position: fixed`,
 * so it must not sit inside `.m-body`, which sets `overflow-x: clip` and
 * therefore becomes its containing block and clips it.
 *
 * So the page owns the form state and passes it down, AppShell renders both
 * slots inside its provider, and the two children do their own hook reads.
 */
export default function LogBuyerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [listing, setListing] = useState<Picked | null>(null);
  const [kind, setKind] = useState<DealKind>("sale");
  const [area, setArea] = useState("");
  const [budget, setBudget] = useState(0);
  const [brief, setBrief] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [touched, setTouched] = useState(false);

  const draft = {
    buyerName: name,
    buyerPhone: phone,
    listingId: listing?.id ?? null,
    wantArea: area,
    wantBudgetMinor: budget,
  };
  const refusal = leadRefusal(draft);

  async function send() {
    setTouched(true);
    if (refusal) return;
    setBusy(true);
    setError(null);
    try {
      const lead = await api.post<LeadRow>("/marketing/leads", {
        buyerName: name.trim(),
        buyerPhone: phone.trim(),
        listingId: listing?.id ?? null,
        listingTitle: listing?.title ?? "",
        wantKind: listing ? listing.kind : kind,
        wantArea: area.trim(),
        wantBudgetMinor: budget,
        brief: brief.trim(),
      });
      router.replace(`/m/buyers/${lead.id}?logged=1`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Log a buyer"
      hint="Give us their name and number. We take it from there."
      back="/m/buyers"
      nav={null}
      tab="Who are they?"
      bottomBar={<Submit busy={busy} onSend={() => void send()} />}
    >
      <Fields
        name={name}
        setName={setName}
        phone={phone}
        setPhone={setPhone}
        listing={listing}
        setListing={setListing}
        kind={kind}
        setKind={setKind}
        area={area}
        setArea={setArea}
        budget={budget}
        setBudget={setBudget}
        brief={brief}
        setBrief={setBrief}
        touched={touched}
        refusal={refusal}
        error={error}
        onRetry={() => void send()}
      />
    </AppShell>
  );
}

/** Hidden entirely for an account that may not report, the same rule the orb follows. */
function Submit({ busy, onSend }: { busy: boolean; onSend: () => void }) {
  if (useReportBlock()) return null;
  return (
    <BottomBar>
      <PrimaryButton busy={busy} onClick={onSend}>
        Send to AV Homes
      </PrimaryButton>
    </BottomBar>
  );
}

interface FieldsProps {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  listing: Picked | null;
  setListing: (v: Picked | null) => void;
  kind: DealKind;
  setKind: (v: DealKind) => void;
  area: string;
  setArea: (v: string) => void;
  budget: number;
  setBudget: (v: number) => void;
  brief: string;
  setBrief: (v: string) => void;
  touched: boolean;
  refusal: { path: string; message: string } | null;
  error: ApiError | null;
  onRetry: () => void;
}

function Fields({
  name,
  setName,
  phone,
  setPhone,
  listing,
  setListing,
  kind,
  setKind,
  area,
  setArea,
  budget,
  setBudget,
  brief,
  setBrief,
  touched,
  refusal,
  error,
  onRetry,
}: FieldsProps) {
  const { me } = useMarketer();
  const block = useReportBlock();

  if (block) {
    return (
      <div className="px-4">
        <Note tone="warn">{block}</Note>
      </div>
    );
  }

  const rate = me?.rates.sale[0] ?? 0;
  const bad = (path: string) => touched && refusal?.path === path;

  return (
    <>
      {/* Said out loud, not only shown. A tap on Send that silently does
          nothing is the form failing without telling anybody. */}
      <p role="alert" className="sr-only">
        {touched && refusal ? refusal.message : ""}
      </p>

      <div className="space-y-5 px-4 pb-6">
        <Field label="Their name" error={bad("buyerName") ? refusal!.message : ""}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Chidi Okonkwo"
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={bad("buyerName") || undefined}
            className={`${inputCls} ${bad("buyerName") ? "m-bad" : ""}`}
          />
        </Field>

        <Field
          label="Their phone number"
          hint="We call this number. Make sure they are expecting us."
          error={bad("buyerPhone") ? refusal!.message : ""}
        >
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="0803 000 0000"
            autoComplete="off"
            aria-invalid={bad("buyerPhone") || undefined}
            className={`${inputCls} ${bad("buyerPhone") ? "m-bad" : ""}`}
          />
        </Field>

        <div role="group" aria-labelledby="want-heading">
          <h2 id="want-heading" className="mb-2 text-[14px] font-bold text-m-text">
            What do they want?
          </h2>
          {listing ? (
            <div className="m-card flex items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-m-text">
                {listing.title}
              </span>
              <button
                type="button"
                onClick={() => setListing(null)}
                aria-label="Clear the property"
                className="m-tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-m-muted active:bg-m-raised"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <ListingPick onPick={setListing} />
              <p className="mb-2 mt-4 text-[13px] text-m-faint">
                Or tell us roughly, if they have not picked one.
              </p>
              <div className="space-y-4">
                <Segmented
                  value={kind}
                  options={[
                    { value: "sale" as const, label: "To buy" },
                    { value: "rent" as const, label: "To rent" },
                  ]}
                  onChange={setKind}
                  label="Buying or renting"
                />
                <Field
                  label="Where"
                  error={bad("wantArea") ? refusal!.message : ""}
                >
                  <input
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    placeholder="Lekki Phase 1"
                    autoCapitalize="words"
                    aria-invalid={bad("wantArea") || undefined}
                    className={`${inputCls} ${bad("wantArea") ? "m-bad" : ""}`}
                  />
                </Field>
                <Field label="Roughly their budget" hint="A guess is fine. It helps us show the right homes.">
                  <NairaInput value={budget} onChange={setBudget} label="Roughly their budget" />
                </Field>
              </div>
            </>
          )}
        </div>

        <Field label="Anything we should know" hint="Optional. When they want to move, who they are, anything useful.">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={3}
            maxLength={600}
            placeholder="My cousin. Relocating from Abuja in March, has the cash ready."
            className={`${inputCls} resize-none`}
          />
        </Field>

        {error && <ErrorNote error={error} onRetry={onRetry} />}

        <div className="m-card flex items-start gap-3 px-4 py-4">
          <IconHandshake size={44} />
          <p className="text-[13.5px] leading-relaxed text-m-muted">
            If they buy, you earn the same{" "}
            <span className="font-semibold text-m-text">{rate}%</span> you would have earned closing
            it yourself. We do the calls and the paperwork.
          </p>
        </div>
      </div>
    </>
  );
}

/** Live listings, searched as they type. Optional, so it never blocks the form. */
function ListingPick({ onPick }: { onPick: (picked: Picked) => void }) {
  const [term, setTerm] = useState("");
  const query = useDebounced(term, 280);

  const found = useAsync(
    (signal) =>
      query.trim().length < 2
        ? Promise.resolve(null)
        : api.get<Page<Property>>(
            `/public/properties?limit=6&q=${encodeURIComponent(query.trim())}`,
            signal,
          ),
    [query],
  );

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-m-faint"
          aria-hidden
        />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search a property they liked"
          aria-label="Search a property"
          className={`${inputCls} pl-11`}
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-2 space-y-1.5">
          {found.loading && <Skeleton className="h-12 w-full rounded-[14px]" />}
          {found.data?.items.length === 0 && (
            <p className="px-1 text-[13px] text-m-faint">
              Nothing matched. Describe what they want instead.
            </p>
          )}
          {found.data?.items.map((property) => (
            <button
              key={property.id}
              type="button"
              onClick={() =>
                onPick({
                  id: property.id,
                  title: property.title,
                  kind: property.listingType === "rent" ? "rent" : "sale",
                })
              }
              className="m-press-light flex w-full items-center justify-between gap-3 rounded-[14px] bg-m-card px-3.5 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-m-text">
                  {property.title}
                </span>
                <span className="block truncate text-[12.5px] text-m-muted">{property.city}</span>
              </span>
              {property.priceMinor > 0 && (
                <span className="shrink-0 text-[13px] font-semibold text-m-muted">
                  {formatMoney(property.priceMinor, property.currency)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
