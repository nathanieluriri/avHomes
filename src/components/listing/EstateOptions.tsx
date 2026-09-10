import Image from "next/image";
import { Bath, Bed, LandPlot, Maximize } from "lucide-react";
import type { EstatePrototype, Property } from "@/lib/types";
import { estateSummary, formatSqm, prototypeLabel } from "@/lib/data";
import { AskAboutOption } from "./EnquiryOption";
import { availabilityLine, estateRangeLine, planLine, saleMoney } from "./estate-text";

/**
 * The house types and plots inside one estate, in the order the team set.
 *
 * A sold out option stays on the list, muted and labelled, so a buyer can see
 * what went and at what price. Every row can start an enquiry that names it.
 */
export default function EstateOptions({ property }: { property: Property }) {
  const { prototypes } = property;
  if (prototypes.length === 0) return null;
  const summary = estateSummary(prototypes);
  const availability = availabilityLine(summary);
  // Availability is already in the heading row, so this line is only the ranges.
  const range = estateRangeLine(summary);

  return (
    <section aria-labelledby="estate-options">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="estate-options" className="text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
          Options
        </h2>
        {availability && (
          <p className="text-sm font-semibold text-wine-700">{availability}</p>
        )}
      </div>
      {range && <p className="mt-2 text-sm text-muted-foreground">{range}</p>}

      <ul className="mt-6 space-y-3">
        {prototypes.map((p) => (
          <OptionRow key={p.id} option={p} property={property} />
        ))}
      </ul>
    </section>
  );
}

function OptionRow({ option, property }: { option: EstatePrototype; property: Property }) {
  const label = prototypeLabel(option);
  const sold = !option.available;
  const src = option.image ?? property.images[0] ?? null;
  const plot = option.kind === "plot";

  return (
    <li
      className={`grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 rounded-2xl border border-mist-200 p-3 sm:grid-cols-[9.5rem_1fr_auto] sm:items-center sm:p-4 ${
        sold ? "bg-mist-50" : "bg-white"
      }`}
    >
      <div className="relative aspect-[4/3] self-start overflow-hidden rounded-xl bg-mist-100 sm:self-center">
        {src && (
          <Image
            src={src}
            alt={label}
            fill
            sizes="(min-width:640px) 152px, 104px"
            className={`object-cover ${sold ? "opacity-60 grayscale" : ""}`}
          />
        )}
        {sold && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-plum-950 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Sold out
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h3 className={`text-base font-semibold tracking-tight ${sold ? "text-plum-950/70" : "text-plum-950"}`}>
          {label}
        </h3>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-500">
          {plot ? (
            <span className="inline-flex items-center gap-1.5">
              <LandPlot className="h-4 w-4 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
              Plot
            </span>
          ) : (
            <>
              {option.bedrooms > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Bed className="h-4 w-4 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
                  {option.bedrooms} bed
                </span>
              )}
              {option.bathrooms > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Bath className="h-4 w-4 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
                  {option.bathrooms} bath
                </span>
              )}
            </>
          )}
          {option.sizeSqm > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Maximize className="h-4 w-4 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
              {formatSqm(option.sizeSqm)}
            </span>
          )}
        </p>

        {option.priceMinor > 0 && (
          <p
            className={`mt-2 text-lg font-bold tracking-tight ${sold ? "text-slate-500" : "text-plum-950"}`}
          >
            {saleMoney(option.priceMinor, property)}
            {sold && <span className="sr-only"> (sold out)</span>}
          </p>
        )}

        {property.paymentPlan && !sold && option.priceMinor > 0 && (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {planLine(option.priceMinor, property.paymentPlan, property)}
          </p>
        )}
      </div>

      <div className="col-span-2 sm:col-span-1">
        <AskAboutOption
          option={{ id: option.id, label }}
          target={{ propertyId: property.id, propertySlug: property.slug, propertyTitle: property.title }}
        />
      </div>
    </li>
  );
}
