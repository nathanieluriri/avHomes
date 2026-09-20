"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import {
  ACCOUNT_PROVIDERS,
  ACCOUNT_PROVIDER_LABEL,
  DEAL_KINDS,
  OWNERSHIPS,
  OWNERSHIP_LABEL,
  RATING_WEIGHT_LABEL,
  RENT_BASES,
  SHARE_KEYS,
  SHARE_LABEL,
  formatMoney,
  matrixRefusal,
  minorUnitsFor,
  moneyRefusalMessage,
  parseMajor,
  personRates,
  plainMajor,
  ratingWeightTotal,
  ratingWeightsRefusal,
  splitTotal,
  type AccountProvider,
  type CommissionMatrix,
  type CommissionSplit,
  type DealKind,
  type MarketingSettings,
  type Ownership,
  type RatingWeights,
  type RentBasis,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import { SaveBar } from "@/components/admin/SaveBar";
import { MoneyInput } from "@/components/admin/listing/MoneyInput";
import {
  Card,
  CardHead,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
  PhoneField,
  Skeleton,
  Switch,
  inputClass,
} from "@/components/admin/ui";

/**
 * Commission: what a deal pays, to whom, and when.
 *
 * Every number here is a percentage of somebody else's money, so the screen
 * shows the arithmetic rather than the rule. Three fields reading 5, 2 and 1
 * tell you nothing about whether that is a reasonable thing to hand out; the
 * same three beside a real sale price do.
 *
 * Rates are snapshotted onto a deal at approval, so changing one here never
 * moves money that has already been worked out.
 */

/** A sale big enough to be recognisable, and a year's rent beside it. */
const SALE_EXAMPLE_MAJOR = 60_000_000;

/**
 * Every number is held as TEXT while it is being typed.
 *
 * A controlled number input whose state is a number cannot be empty: clearing
 * it writes 0, and the next digit typed lands after that zero. Parsing happens
 * once, on save, where a refusal can be reported.
 */
/** One cell, as strings, because that is what the five inputs hold. */
type SplitDraft = Record<keyof CommissionSplit, string>;

/** The four cells, keyed exactly as the matrix is. */
type MatrixDraft = Record<Ownership, Record<DealKind, SplitDraft>>;

interface Draft {
  commission: MatrixDraft;
  rewardPoolName: string;
  foundationName: string;
  rating: Record<keyof RatingWeights, string>;
  rentBasis: RentBasis;
  issueWindowDays: string;
  payCutoffDay: string;
  requireApproval: boolean;
  joinOpen: boolean;
  blockSelfDeals: boolean;
  /** Major units, because that is what the field asks for. */
  minPayout: string;
  supportPhone: string;
  accountProvider: AccountProvider;
  /** Always blank on load: the saved key is never sent to the browser. */
  paystackKey: string;
}

function toSplitDraft(split: CommissionSplit): SplitDraft {
  return {
    level1: String(split.level1),
    level2: String(split.level2),
    level3: String(split.level3),
    rewardPool: String(split.rewardPool),
    foundation: String(split.foundation),
  };
}

function fromSplitDraft(draft: SplitDraft): CommissionSplit {
  return {
    level1: Number(draft.level1),
    level2: Number(draft.level2),
    level3: Number(draft.level3),
    rewardPool: Number(draft.rewardPool),
    foundation: Number(draft.foundation),
  };
}

function fromMatrixDraft(draft: MatrixDraft): CommissionMatrix {
  return {
    av: { sale: fromSplitDraft(draft.av.sale), rent: fromSplitDraft(draft.av.rent) },
    partner: {
      sale: fromSplitDraft(draft.partner.sale),
      rent: fromSplitDraft(draft.partner.rent),
    },
  };
}

function toDraft(settings: MarketingSettings): Draft {
  return {
    commission: {
      av: {
        sale: toSplitDraft(settings.commission.av.sale),
        rent: toSplitDraft(settings.commission.av.rent),
      },
      partner: {
        sale: toSplitDraft(settings.commission.partner.sale),
        rent: toSplitDraft(settings.commission.partner.rent),
      },
    },
    rewardPoolName: settings.rewardPoolName,
    foundationName: settings.foundationName,
    rating: {
      value: String(settings.rating.value),
      deals: String(settings.rating.deals),
      conversion: String(settings.rating.conversion),
      speed: String(settings.rating.speed),
    },
    rentBasis: settings.rentBasis,
    issueWindowDays: String(settings.issueWindowDays),
    payCutoffDay: String(settings.payCutoffDay),
    requireApproval: settings.requireApproval,
    joinOpen: settings.joinOpen,
    blockSelfDeals: settings.blockSelfDeals,
    minPayout: plainMajor(settings.minPayoutMinor, settings.currency),
    supportPhone: settings.supportPhone,
    accountProvider: settings.accountProvider,
    paystackKey: "",
  };
}

interface SettingsResponse {
  settings: MarketingSettings;
  /** Whether the chosen provider can actually run a check right now. */
  bankCheck: boolean;
  paystackKeySaved: boolean;
}

const PROVIDER_BLURB: Record<AccountProvider, string> = {
  kora:
    "No key needed, and it answers in well under a second. It is reachable without credentials because of a gap in Kora's own auth rather than because they offer it free, so treat it as temporary and keep a Paystack key ready.",
  paystack:
    "Free, documented and 1500 checks a minute. Needs a secret key from your Paystack dashboard, under Settings then API Keys.",
};

const BASIS: Record<RentBasis, { label: string; blurb: string }> = {
  upfront: {
    label: "Everything paid at move in",
    blurb:
      "The whole sum the tenant handed over on day one, which here is usually a year up front. Commission is a slice of that.",
  },
  period: {
    label: "One period's rent",
    blurb:
      "A single month or year of rent, whatever the listing is priced per. Use this when a tenant pays in instalments.",
  },
};

export default function CommissionPage() {
  const { data, error, loading, reload } = useAsync<SettingsResponse>(
    (signal) => api.get<SettingsResponse>("/admin/marketing/settings", signal),
    [],
  );

  if (loading) {
    return (
      <>
        <PageHeader
          icon={Percent}
          backTo="/admin/marketers"
          backLabel="Marketers"
          title="Commission"
        />
        <div aria-busy="true">
          <span className="sr-only">Loading commission settings</span>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader
          icon={Percent}
          backTo="/admin/marketers"
          backLabel="Marketers"
          title="Commission"
        />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }
  if (!data) return null;

  return <CommissionEditor initial={data.settings} hasKey={data.paystackKeySaved} />;
}

function CommissionEditor({
  initial,
  hasKey,
}: {
  initial: MarketingSettings;
  hasKey: boolean;
}) {
  const [saved, setSaved] = useState<MarketingSettings>(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [keySaved, setKeySaved] = useState(hasKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const currency = saved.currency;
  const scale = minorUnitsFor(currency);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setShare(
    ownership: Ownership,
    kind: DealKind,
    share: keyof CommissionSplit,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      commission: {
        ...current.commission,
        [ownership]: {
          ...current.commission[ownership],
          [kind]: { ...current.commission[ownership][kind], [share]: value },
        },
      },
    }));
  }

  function setWeight(key: keyof RatingWeights, value: string) {
    setDraft((current) => ({ ...current, rating: { ...current.rating, [key]: value } }));
  }

  const matrix = fromMatrixDraft(draft.commission);
  const weights: RatingWeights = {
    value: Number(draft.rating.value),
    deals: Number(draft.rating.deals),
    conversion: Number(draft.rating.conversion),
    speed: Number(draft.rating.speed),
  };
  const payout = parseMajor(draft.minPayout || "0", currency);
  const cutoff = Number(draft.payCutoffDay);
  const window = Number(draft.issueWindowDays);

  /*
   * The same refusals the API applies, checked here so Save is never a round
   * trip that comes back saying no. `ratesRefusal` is the server's own function,
   * imported rather than restated.
   */
  const refusal =
    matrixRefusal(matrix) ??
    ratingWeightsRefusal(weights) ??
    (draft.rewardPoolName.trim() === "" || draft.foundationName.trim() === ""
      ? "Both funds need a name."
      : null) ??
    (!payout.ok ? moneyRefusalMessage(payout.reason, currency) : null) ??
    (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 28
      ? "The cut off day is a day of the month between 1 and 28."
      : null) ??
    (!Number.isInteger(window) || window < 1 || window > 90
      ? "The payment problem window is between 1 and 90 days."
      : null);

  async function save() {
    if (refusal || !payout.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<SettingsResponse>(
        "/admin/marketing/settings",
        {
          accountProvider: draft.accountProvider,
          // Absent leaves the saved key alone; this form can never prefill it.
          ...(draft.paystackKey.trim() === "" ? {} : { paystackKey: draft.paystackKey.trim() }),
          commission: matrix,
          rewardPoolName: draft.rewardPoolName.trim(),
          foundationName: draft.foundationName.trim(),
          rating: weights,
          rentBasis: draft.rentBasis,
          issueWindowDays: window,
          payCutoffDay: cutoff,
          requireApproval: draft.requireApproval,
          joinOpen: draft.joinOpen,
          blockSelfDeals: draft.blockSelfDeals,
          minPayoutMinor: payout.minor,
          supportPhone: draft.supportPhone,
        },
      );
      setSaved(res.settings);
      setDraft(toDraft(res.settings));
      setKeySaved(res.paystackKeySaved);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /** What the three levels take out of one deal, at the rates being typed. */
  /** What the three people take out of one deal, at the rates being typed. */
  function worked(major: number, cell: SplitDraft): string {
    const minor = major * scale;
    return personRates(fromSplitDraft(cell))
      .map((rate) =>
        formatMoney(Number.isFinite(rate) ? Math.floor((minor * rate) / 100) : 0, currency),
      )
      .join(" / ");
  }

  /**
   * One row of the grid: four cells, five shares each.
   *
   * The row carries its OWN total and turns red past 100, so the refusal is
   * visible while somebody is typing rather than when they press Save. Five
   * shares that are each legal can still add up past the deal, which is the whole
   * reason this total is on screen.
   */
  const rateRow = (ownership: Ownership, kind: DealKind) => {
    const cell = draft.commission[ownership][kind];
    const total = splitTotal(fromSplitDraft(cell));
    const over = total > 100;
    return (
      <div key={`${ownership}-${kind}`} className="border-t border-mist-200 pt-3 first:border-0 first:pt-0">
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-plum-950">
            {OWNERSHIP_LABEL[ownership]} {kind === "sale" ? "sale" : "rent"}
          </h3>
          <span
            className={`ml-auto text-[11px] font-semibold tabular-nums ${
              over ? "text-red-600" : "text-slate-550"
            }`}
          >
            {total}% of the deal
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SHARE_KEYS.map((share) => (
            <label key={share} className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {SHARE_LABEL[share]}
              </span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={cell[share]}
                onChange={(event) => setShare(ownership, kind, share, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <SaveBar
        when={dirty}
        saving={busy}
        disabled={refusal !== null}
        onDiscard={() => {
          setDraft(toDraft(saved));
          setError(null);
        }}
        onSave={() => void save()}
      />

      <PageHeader
        icon={Percent}
        backTo="/admin/marketers"
        backLabel="Marketers"
        title="Commission"
        subtitle="What a closed deal pays, and the rules around paying it."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}
      {refusal && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {refusal}
        </p>
      )}

      {/* `asideFirstOnMobile`, because the aside is a live reading of the
          numbers being typed two cards below it. Collapsed the other way it
          lands under the on-screen keyboard, which is where the one thing that
          reflects what you are typing must not be. */}
      <PageColumns
        asideFirstOnMobile
        aside={
          <aside>
            <Card spotlight="commission-example">
              <CardHead title="What that pays out" />
              <div className="space-y-3">
                {OWNERSHIPS.map((ownership) => (
                  <div key={ownership} className="rounded-xl bg-mist-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {OWNERSHIP_LABEL[ownership]}, on a{" "}
                      {formatMoney(SALE_EXAMPLE_MAJOR * scale, currency)} sale
                    </p>
                    <p className="c-num mt-1 text-[13px] font-semibold text-plum-950">
                      {worked(SALE_EXAMPLE_MAJOR, draft.commission[ownership].sale)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                Direct is whoever closed it, upline 1 is who invited them, upline
                2 is who invited that person. A paused or banned person earns
                nothing and their share stays with AV Homes.
              </p>
              {/* The most important fact on this screen, and it was previously
                  nowhere. A rate change is not retroactive: every settled deal
                  carries the cell it was priced by. */}
              <p className="mt-2 rounded-lg bg-wine-50 px-3 py-2 text-[12px] leading-relaxed text-wine-700">
                A change here applies to deals approved from now on. It never
                rewrites a deal that has already been settled.
              </p>
            </Card>
          </aside>
        }
      >
        <div className="space-y-4">
          <Card className="space-y-4">
            <CardHead title="What a deal pays" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              Percentages of what the property sold or let for. AV Homes earns
              far less on a property it does not own, so its own stock and
              everybody else&apos;s are priced separately. Each row&apos;s five
              shares cannot come to more than the whole deal.
            </p>
            <div className="space-y-3" data-spotlight="commission-sale-rates">
              {OWNERSHIPS.map((ownership) =>
                DEAL_KINDS.map((kind) => rateRow(ownership, kind)),
              )}
            </div>
          </Card>

          <Card className="space-y-4">
            <CardHead title="The two funds" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              Every recorded deal puts a share into each of these, whoever closed
              it and whether or not anybody earned commission on it. Rename them
              to whatever you call them; the records keep pointing at the right
              one.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="The prize pool" hint="Paid to the best seller each quarter.">
                <input
                  className={inputClass}
                  value={draft.rewardPoolName}
                  onChange={(event) => set("rewardPoolName", event.target.value)}
                />
              </Field>
              <Field label="The community fund" hint="Spent on the community, with a receipt.">
                <input
                  className={inputClass}
                  value={draft.foundationName}
                  onChange={(event) => set("foundationName", event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card className="space-y-4">
            <CardHead title="How a seller is scored" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              The score on the people page is these four weighted together, and
              every person&apos;s breakdown is shown beside their score. The
              quarterly prize is decided on value closed alone, which is the one
              number nobody can argue with.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(draft.rating) as (keyof RatingWeights)[]).map((key) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {RATING_WEIGHT_LABEL[key]}
                  </span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={draft.rating[key]}
                    onChange={(event) => setWeight(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            {/* The total, because weights that do not sum to 100 make a score out
                of something other than 100 and the screen should say so. */}
            <p className="text-[12px] text-slate-600">
              These add up to{" "}
              <span className="c-num font-semibold text-plum-950">
                {ratingWeightTotal(weights)}
              </span>
              , so a top performer scores that out of 100.
            </p>
          </Card>

          <Card className="space-y-4">
            <CardHead title="Rent" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              What a rent commission is a percentage of.
            </p>

            {/* Radios, not a switch. Two named outcomes with a paragraph each is
                not an on/off state, and a switch would force the reader to work
                out what "off" means. */}
            <div className="space-y-2">
              {RENT_BASES.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                    draft.rentBasis === value
                      ? "border-wine-500 bg-wine-50/50"
                      : "border-mist-200 hover:bg-mist-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="rentBasis"
                    value={value}
                    checked={draft.rentBasis === value}
                    onChange={() => set("rentBasis", value)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-plum-950">
                      {BASIS[value].label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-600">
                      {BASIS[value].blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <CardHead title="Paying" />

            <Field
              label="Cut off day"
              hint="A deal approved after this day of the month waits for next month's list. 1 to 28, so it exists in February."
            >
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.payCutoffDay}
                onChange={(event) => set("payCutoffDay", event.target.value)}
              />
            </Field>

            <Field
              label="Smallest payout"
              hint="A balance under this is carried into the next month instead of being sent. 0 pays every balance."
            >
              {/* An amount, so it is grouped as one. This box holds figures in
                  the hundreds of thousands and read as an unbroken run of
                  digits, which is the field where a misplaced zero costs the
                  most and is hardest to see. */}
              <MoneyInput value={draft.minPayout} onChange={(raw) => set("minPayout", raw)} />
            </Field>

            <Field
              label="Payment problem window"
              hint="How many days a marketer has to say a transfer never arrived."
            >
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.issueWindowDays}
                onChange={(event) => set("issueWindowDays", event.target.value)}
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <CardHead title="Signing up" />
            <Switch
              checked={draft.requireApproval}
              onChange={(next) => set("requireApproval", next)}
              label="New marketers need approving"
              description="Off means somebody who signs up can report a deal straight away."
            />
            <Switch
              checked={draft.joinOpen}
              onChange={(next) => set("joinOpen", next)}
              label="Sign up is open"
              description="Off closes the join page. Everyone already signed up keeps working."
            />
            <Switch
              checked={draft.blockSelfDeals}
              onChange={(next) => set("blockSelfDeals", next)}
              label="Block a marketer buying through themselves"
              description="Refuses a deal whose buyer phone is the marketer's own number."
            />
          </Card>

          <Card className="space-y-4">
            <CardHead title="Checking bank accounts" />
            <p className="text-[12.5px] text-slate-600">
              Who answers &ldquo;what name is on this account number&rdquo;. This lives here rather
              than in the deployment so it can be changed without a release.
            </p>

            <Field label="Provider" as="group">
              <div className="flex gap-1.5">
                {ACCOUNT_PROVIDERS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => set("accountProvider", option)}
                    aria-pressed={draft.accountProvider === option}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                      draft.accountProvider === option
                        ? "bg-wine-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {ACCOUNT_PROVIDER_LABEL[option]}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[12.5px] leading-relaxed text-slate-600">
              {PROVIDER_BLURB[draft.accountProvider]}
            </p>

            <Field
              label="Paystack secret key"
              hint={
                keySaved
                  ? "A key is saved. Type a new one to replace it, or leave this empty to keep it."
                  : "Starts with sk_live_ or sk_test_. Only needed when Paystack is the provider."
              }
            >
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                value={draft.paystackKey}
                placeholder={keySaved ? "A key is saved" : "sk_live_..."}
                onChange={(event) => set("paystackKey", event.target.value)}
              />
            </Field>

            {draft.accountProvider === "paystack" && !keySaved && draft.paystackKey.trim() === "" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                Paystack is selected with no key saved, so account checks will not run and new
                marketers will be taken with their account unchecked.
              </p>
            )}
          </Card>

          <Card className="space-y-4">
            <CardHead title="Help" />
            <Field
              label="Support phone"
              hint="Printed on the sign up page and in the app's help sheet. Leave it empty and neither shows a number."
              as="group"
            >
              <PhoneField value={draft.supportPhone} onChange={(next) => set("supportPhone", next)} />
            </Field>
          </Card>
        </div>
      </PageColumns>
    </>
  );
}
