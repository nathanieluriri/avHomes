"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import {
  RENT_BASES,
  formatMoney,
  minorUnitsFor,
  moneyRefusalMessage,
  parseMajor,
  plainMajor,
  ratesRefusal,
  type CommissionRates,
  type MarketingSettings,
  type RentBasis,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import { SaveBar } from "@/components/admin/SaveBar";
import {
  Card,
  CardHead,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
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
const RENT_EXAMPLE_MAJOR = 5_000_000;

/**
 * Every number is held as TEXT while it is being typed.
 *
 * A controlled number input whose state is a number cannot be empty: clearing
 * it writes 0, and the next digit typed lands after that zero. Parsing happens
 * once, on save, where a refusal can be reported.
 */
interface Draft {
  saleRates: [string, string, string];
  rentRates: [string, string, string];
  rentBasis: RentBasis;
  issueWindowDays: string;
  payCutoffDay: string;
  requireApproval: boolean;
  joinOpen: boolean;
  blockSelfDeals: boolean;
  /** Major units, because that is what the field asks for. */
  minPayout: string;
  supportPhone: string;
}

function toDraft(settings: MarketingSettings): Draft {
  return {
    saleRates: settings.saleRates.map(String) as [string, string, string],
    rentRates: settings.rentRates.map(String) as [string, string, string],
    rentBasis: settings.rentBasis,
    issueWindowDays: String(settings.issueWindowDays),
    payCutoffDay: String(settings.payCutoffDay),
    requireApproval: settings.requireApproval,
    joinOpen: settings.joinOpen,
    blockSelfDeals: settings.blockSelfDeals,
    minPayout: plainMajor(settings.minPayoutMinor, settings.currency),
    supportPhone: settings.supportPhone,
  };
}

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
  const { data, error, loading, reload } = useAsync<{ settings: MarketingSettings }>(
    (signal) => api.get<{ settings: MarketingSettings }>("/admin/marketing/settings", signal),
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

  return <CommissionEditor initial={data.settings} />;
}

function CommissionEditor({ initial }: { initial: MarketingSettings }) {
  const [saved, setSaved] = useState<MarketingSettings>(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const currency = saved.currency;
  const scale = minorUnitsFor(currency);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setRate(key: "saleRates" | "rentRates", index: number, value: string) {
    const next = [...draft[key]] as [string, string, string];
    next[index] = value;
    set(key, next);
  }

  const sale = draft.saleRates.map(Number) as CommissionRates;
  const rent = draft.rentRates.map(Number) as CommissionRates;
  const payout = parseMajor(draft.minPayout || "0", currency);
  const cutoff = Number(draft.payCutoffDay);
  const window = Number(draft.issueWindowDays);

  /*
   * The same refusals the API applies, checked here so Save is never a round
   * trip that comes back saying no. `ratesRefusal` is the server's own function,
   * imported rather than restated.
   */
  const refusal =
    ratesRefusal(sale) ??
    ratesRefusal(rent) ??
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
      const res = await api.patch<{ settings: MarketingSettings }>(
        "/admin/marketing/settings",
        {
          saleRates: sale,
          rentRates: rent,
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
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /** What the three levels take out of one deal, at the rates being typed. */
  function worked(major: number, rates: CommissionRates): string {
    const minor = major * scale;
    return rates
      .map((rate) =>
        formatMoney(Number.isFinite(rate) ? Math.floor((minor * rate) / 100) : 0, currency),
      )
      .join(" / ");
  }

  const rateFields = (key: "saleRates" | "rentRates") => (
    <div className="grid grid-cols-3 gap-2">
      {draft[key].map((value, index) => (
        <label key={index} className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Level {index + 1}
          </span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={value}
            onChange={(event) => setRate(key, index, event.target.value)}
          />
        </label>
      ))}
    </div>
  );

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
                <div className="rounded-xl bg-mist-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    On a {formatMoney(SALE_EXAMPLE_MAJOR * scale, currency)} sale
                  </p>
                  <p className="c-num mt-1 text-[13px] font-semibold text-plum-950">
                    {worked(SALE_EXAMPLE_MAJOR, sale)}
                  </p>
                </div>
                <div className="rounded-xl bg-mist-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    On {formatMoney(RENT_EXAMPLE_MAJOR * scale, currency)} of rent
                  </p>
                  <p className="c-num mt-1 text-[13px] font-semibold text-plum-950">
                    {worked(RENT_EXAMPLE_MAJOR, rent)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                Level 1 is whoever closed it, level 2 is who invited them, level
                3 is who invited that person. A paused or banned person earns
                nothing and their share stays with AV Homes.
              </p>
            </Card>
          </aside>
        }
      >
        <div className="space-y-4">
          <Card className="space-y-4">
            <CardHead title="Sale rates" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              Percentages of the sale price, one per level. The three together
              cannot come to more than the whole deal.
            </p>
            <Field label="Rates" as="group" spotlight="commission-sale-rates">
              {rateFields("saleRates")}
            </Field>
          </Card>

          <Card className="space-y-4">
            <CardHead title="Rent rates" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              The same three levels, for a rental rather than a sale.
            </p>
            <Field label="Rates" as="group">
              {rateFields("rentRates")}
            </Field>

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
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.minPayout}
                onChange={(event) => set("minPayout", event.target.value)}
              />
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
            <CardHead title="Help" />
            <Field
              label="Support phone"
              hint="Printed on the sign up page and in the app's help sheet. Leave it empty and neither shows a number."
            >
              <input
                className={inputClass}
                inputMode="tel"
                value={draft.supportPhone}
                placeholder="+234 801 234 5678"
                onChange={(event) => set("supportPhone", event.target.value)}
              />
            </Field>
          </Card>
        </div>
      </PageColumns>
    </>
  );
}
