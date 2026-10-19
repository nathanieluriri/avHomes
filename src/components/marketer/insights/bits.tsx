"use client";

import { initials } from "@/lib/marketer/api";

/** Wine, gold, lilac and rose: the icon set's materials, so a list of faces is not one flat colour. */
const TINTS = [
  "bg-[#3d1520] text-[#ff8fa3]",
  "bg-[#3a2912] text-[#ffcf7d]",
  "bg-[#2a2140] text-[#cfc4fa]",
  "bg-[#4a2530] text-[#f2dee3]",
];

export function tintFor(code: string): string {
  let sum = 0;
  for (const char of code) sum += char.charCodeAt(0);
  return TINTS[sum % TINTS.length]!;
}

export function Avatar({
  name,
  code,
  size = 44,
  className = "",
}: {
  name: string;
  code: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold tracking-wide ${tintFor(code)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
    >
      {initials(name, code)}
    </span>
  );
}

/** A row of choices that scrolls sideways at 360px instead of wrapping into a wall. */
export function Pills<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`m-press h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors ${
              on ? "bg-[#ff8fa3] text-[#2a0a14]" : "bg-m-raised text-m-text ring-1 ring-m-line"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
