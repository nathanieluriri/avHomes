import Image from "next/image";
import AgentChat from "@/components/AgentChat";
import { OptionAwareContact } from "@/components/listing/EnquiryOption";
import type { FeeKind, ListingFee, Property, RentPeriod } from "@/lib/types";
import { RECURRING_FEE_KINDS } from "@/lib/types";
import {
  estateSummary,
  formatPrice,
  isEstate,
  isPriceReduced,
  listingLabel,
  moveInTotalMinor,
  normalizeFees,
} from "@/lib/data";

const TRUST_LINES = [
  "Verified listing, checked by our team",
  "No hidden fees",
  "Response within one business day",
];

const PERIOD_LABELS: Record<RentPeriod, string> = {
  year: "Billed yearly",
  month: "Billed monthly",
  night: "Billed nightly",
};

const FEE_KIND_LABELS: Record<FeeKind, string> = {
  agency: "Agency fee",
  legal: "Legal fee",
  caution: "Caution deposit",
  "service-charge": "Service charge",
};

/** A fee has no period of its own, so it is always shown flat, never with a "/yr" suffix. */
function formatFlat(minor: number, currency: string): string {
  return formatPrice(minor, { listingType: "rent", rentPeriod: null, currency });
}

function excludedFeesLine(excluded: FeeKind[]): string {
  const names = excluded.map((kind) => FEE_KIND_LABELS[kind]);
  const verb = names.length > 1 ? "are" : "is";
  return `${names.join(" and ")} ${verb} billed in another currency, so left out of this total.`;
}

function FeeGroup({ label, fees }: { label: string; fees: ListingFee[] }) {
  if (fees.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {fees.map((fee) => (
          <li key={fee.kind} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-plum-950/80">{FEE_KIND_LABELS[fee.kind]}</span>
            <span className="font-semibold text-plum-950">{formatFlat(fee.amountMinor, fee.currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rightmove's letting details: period and deposit read at the same weight as
 * the rent above, fees itemised on their own line rather than footnoted, and
 * recurring charges kept out of the one-off group so a tenant cannot mistake
 * a yearly service charge for money they get back.
 */
// TODO(test): a service-charge fee lands in "Billed with the rent" and nowhere else, every
//   other fee kind lands in "Paid once, at move in", and a foreign-currency fee shows up in
//   the excluded line instead of the total.
function RentalTerms({ property }: { property: Property }) {
  const fees = normalizeFees(property.fees);
  const oneOff = fees.filter((fee) => !RECURRING_FEE_KINDS.includes(fee.kind));
  const recurring = fees.filter((fee) => RECURRING_FEE_KINDS.includes(fee.kind));
  const moveIn = moveInTotalMinor({
    priceMinor: property.priceMinor,
    currency: property.currency,
    listingType: property.listingType,
    fees: property.fees,
  });

  return (
    <div className="mt-5 rounded-xl border border-mist-200 bg-mist-50 p-4 sm:p-5">
      {property.rentPeriod && (
        <p className="text-sm font-semibold text-plum-950">{PERIOD_LABELS[property.rentPeriod]}</p>
      )}

      <FeeGroup label="Paid once, at move in" fees={oneOff} />
      <FeeGroup label="Billed with the rent" fees={recurring} />

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-mist-200 pt-3">
        <span className="text-sm font-semibold text-plum-950">Total to move in</span>
        <span className="text-base font-bold text-plum-950">
          {formatFlat(moveIn.minor, property.currency)}
        </span>
      </div>

      {moveIn.excluded.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {excludedFeesLine(moveIn.excluded)}
        </p>
      )}
    </div>
  );
}

export default function AgentPanel({ property }: { property: Property }) {
  const { agent } = property;
  const telHref = `tel:${agent.phone.replace(/[^+\d]/g, "")}`;
  const estate = isEstate(property.type);
  // An estate's from-price moves when options sell or change, which is not a price cut.
  const reduced = !estate && isPriceReduced(property.priceHistory);
  const summary = estate ? estateSummary(property.prototypes) : null;
  const soldOut = summary?.soldOut ?? false;
  const priceMinor = summary ? summary.fromMinor : property.priceMinor;

  return (
    <div className="lg:sticky lg:top-28">
      <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-wine-50 px-3.5 py-1.5 text-xs font-semibold text-wine-700">
            {soldOut ? "Sold out" : listingLabel(property.listingType, property.status)}
          </span>
          {reduced && (
            <span className="inline-flex items-center rounded-full bg-wine-600 px-3.5 py-1.5 text-xs font-semibold text-white">
              Price reduced
            </span>
          )}
        </div>

        {priceMinor > 0 && (
          <>
            {estate && (
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">From</p>
            )}
            <p
              className={`break-words text-3xl font-bold leading-[1.05] tracking-tight text-plum-950 sm:text-4xl ${
                estate ? "mt-1" : "mt-4"
              }`}
            >
              {formatPrice(priceMinor, {
                listingType: property.listingType,
                rentPeriod: property.rentPeriod,
                currency: property.currency,
              })}
            </p>
          </>
        )}

        {estate && property.paymentPlan && !soldOut && (
          <p className="mt-3 text-sm text-plum-950/80">
            Payment plan: {property.paymentPlan.depositPercent}% deposit, balance over{" "}
            {property.paymentPlan.months} {property.paymentPlan.months === 1 ? "month" : "months"}.
          </p>
        )}

        {property.listingType === "rent" && <RentalTerms property={property} />}

        <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-6">
          {/*
            An agent has no avatar until somebody uploads one: the admin seeds
            the field with "" on every listing it creates. next/image treats ""
            as a missing src and throws, so the empty case needs its own
            rendering rather than a falsy src. The initial is the same fallback
            the article byline uses.
          */}
          <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-mist-200 bg-wine-50">
            {agent.avatarUrl ? (
              <Image
                src={agent.avatarUrl}
                alt={agent.name}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-wine-700" aria-hidden="true">
                {agent.name.trim().slice(0, 1).toUpperCase() || "A"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-plum-950">
              {agent.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>

        {/* A conversation on the page, not a mailto. The old link handed the
            buyer to a mail client they may not have configured, lost everyone on
            a shared machine, and left the team with no record until somebody
            forwarded it. */}
        {/* The agent's name and face are no longer passed down. The widget
            resolves them live from the thread, so an agent who uploads a photo
            or a site that switches to a team identity is reflected in an open
            conversation without this page knowing anything about it. */}
        {estate ? (
          // Carries the option picked in the Options list, when there is one.
          <OptionAwareContact
            propertyId={property.id}
            propertySlug={property.slug}
            propertyTitle={property.title}
          />
        ) : (
          <AgentChat
            propertyId={property.id}
            propertySlug={property.slug ?? undefined}
            propertyTitle={property.title}
          />
        )}
        <a
          href={telHref}
          className="mt-3 block rounded-full border border-mist-200 bg-white px-7 py-3.5 text-center text-sm font-semibold text-plum-950 transition-colors duration-200 hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
        >
          {estate ? "Book a site inspection" : "Schedule a tour"}
        </a>
      </div>

      <ul className="mt-6 space-y-2.5 rounded-2xl border border-mist-200 bg-mist-50 p-4 text-sm text-plum-950/80">
        {TRUST_LINES.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-wine-600" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
