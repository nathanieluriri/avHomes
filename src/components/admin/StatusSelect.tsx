"use client";

import { Select } from "radix-ui";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import type { Tone } from "./ui";

export interface StatusOption {
  value: string;
  label: string;
  /** One line saying what choosing it does, in plain words. */
  description: string;
  tone?: Tone;
  disabled?: boolean;
  /** Shown instead of the description when disabled, so a refusal is explained. */
  disabledReason?: string;
}

const DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  wine: "bg-wine-600",
  red: "bg-red-600",
};

/**
 * A status picker: the current state on the trigger, every state with its
 * meaning in the list.
 *
 * Radix Select, so it is a real listbox: arrow keys, type-ahead, Escape, and
 * the chosen option announced. `value` is the CURRENT state and `options` may
 * include moves that are not states (a listing's "Back on the market"); picking
 * the current value again does nothing.
 */
export function StatusSelect({
  label,
  value,
  current,
  options,
  onChange,
  busy = false,
  disabled = false,
  spotlight,
}: {
  label: string;
  /** The option value that reflects the current state, or "" when no option does. */
  value: string;
  /** What the trigger shows. Defaults to the selected option. */
  current?: { label: string; description?: string; tone?: Tone };
  options: readonly StatusOption[];
  onChange: (value: string) => void;
  busy?: boolean;
  disabled?: boolean;
  spotlight?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const shown = current ?? selected;

  return (
    <Select.Root
      value={value || undefined}
      onValueChange={(next) => {
        if (next !== value) onChange(next);
      }}
      disabled={disabled || busy}
    >
      <Select.Trigger
        aria-label={label}
        data-spotlight={spotlight}
        className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-mist-200 bg-white px-3 py-2 text-left transition-colors hover:border-mist-300 focus-visible:border-wine-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500/25 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-wine-500 sm:min-h-10"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[shown?.tone ?? "neutral"]}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-plum-950">
            {shown?.label ?? "Choose a status"}
          </span>
          {shown?.description && (
            <span className="block truncate text-[12px] text-slate-600">{shown.description}</span>
          )}
        </span>
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        )}
        {/* Keeps Radix's value node mounted for the accessible name; the visible label is drawn above. */}
        <span className="sr-only">
          <Select.Value />
        </span>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="console-float z-[80] max-h-[min(24rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[16rem] overflow-hidden rounded-xl border border-mist-200 bg-white shadow-pop"
        >
          <Select.Viewport className="p-1.5">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                textValue={option.label}
                className="relative flex cursor-pointer select-none items-start gap-2.5 rounded-lg py-2.5 pl-8 pr-3 outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-mist-100 data-[disabled]:opacity-55"
              >
                <Select.ItemIndicator className="absolute left-2.5 top-3">
                  <Check className="h-4 w-4 text-plum-950" aria-hidden="true" />
                </Select.ItemIndicator>
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[option.tone ?? "neutral"]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <Select.ItemText>
                    <span className="block text-sm font-semibold text-plum-950">{option.label}</span>
                  </Select.ItemText>
                  <span className="mt-0.5 block text-[12px] leading-snug text-slate-600">
                    {option.disabled && option.disabledReason ? option.disabledReason : option.description}
                  </span>
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
