"use client";

import {
  FURNISHINGS,
  FURNISHING_LABELS,
  minStayUnit,
  type Furnishing,
  type RentPeriod,
} from "@avhomes/contracts";
import { Field, inputClass } from "@/components/admin/ui";
import { NumberInput } from "./NumberInput";
import { Segmented } from "./Segmented";

export interface RentTermsDraft {
  furnishing: Furnishing | null;
  serviced: boolean;
  /** `YYYY-MM-DD` from the date input, or "" for available now. */
  availableFrom: string;
  minStay: number | null;
}

const FURNISHING_OPTIONS: readonly { value: Furnishing | "none"; label: string }[] = [
  ...FURNISHINGS.map((f) => ({ value: f, label: FURNISHING_LABELS[f] })),
  { value: "none", label: "Not stated" },
];

/** Epoch ms at UTC midnight, the shape `availableFrom` is stored in. */
export function availableFromToDate(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toISOString().slice(0, 10);
}

export function dateToAvailableFrom(date: string): number | null {
  if (date === "") return null;
  // A bare ISO date parses as UTC midnight, which is exactly what is stored.
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

export function RentTerms({
  value,
  onChange,
  rentPeriod,
}: {
  value: RentTermsDraft;
  onChange: (patch: Partial<RentTermsDraft>) => void;
  rentPeriod: RentPeriod;
}) {
  const unit = minStayUnit(rentPeriod);

  return (
    <div className="space-y-4">
      <Field label="Furnishing" as="group">
        <Segmented
          options={FURNISHING_OPTIONS}
          value={value.furnishing ?? "none"}
          onChange={(next) => onChange({ furnishing: next === "none" ? null : next })}
        />
      </Field>

      {/* The same full-height row as the featured switch, for the same reason:
          a bare 16px box beside a line of text is not a thumb target. */}
      <label className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-plum-950 active:bg-mist-100 sm:mx-0 sm:min-h-0 sm:gap-2 sm:px-0">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[var(--wine-600)] sm:h-auto sm:w-auto"
          checked={value.serviced}
          onChange={(e) => onChange({ serviced: e.target.checked })}
        />
        <span>
          Serviced{" "}
          <span className="text-slate-600">· cleaning, power and upkeep are in the service charge</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Available from" hint="Leave empty if it is available now.">
            <input
              type="date"
              className={inputClass}
              value={value.availableFrom}
              onChange={(e) => onChange({ availableFrom: e.target.value })}
            />
          </Field>
          {/* Outside the label, which would otherwise forward this click to the date input. */}
          {value.availableFrom !== "" && (
            <button
              type="button"
              onClick={() => onChange({ availableFrom: "" })}
              className="c-tap mt-1 text-xs font-semibold text-wine-700 hover:underline"
            >
              Make it available now
            </button>
          )}
        </div>
        <Field label="Minimum stay" hint={`In ${unit}. Leave empty for no minimum.`}>
          <span className="flex items-center gap-2">
            <NumberInput
              nullable
              min={1}
              max={3650}
              value={value.minStay}
              onChange={(minStay) => onChange({ minStay })}
            />
            <span className="shrink-0 text-[13px] text-slate-600">{unit}</span>
          </span>
        </Field>
      </div>
    </div>
  );
}
