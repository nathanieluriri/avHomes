"use client";

/**
 * A row of pressed/unpressed buttons for a choice of two to four.
 *
 * Each option is its own tab stop with `aria-pressed`, the same contract the
 * list's status filters use, so it must sit inside a `Field as="group"` that
 * names the set.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`c-tap h-9 rounded-lg px-4 text-[13px] font-semibold transition-colors sm:h-7 sm:px-3.5 ${
              active
                ? "bg-plum-950 text-white"
                : "bg-mist-100 text-slate-600 hover:bg-mist-200/70 hover:text-plum-950"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
