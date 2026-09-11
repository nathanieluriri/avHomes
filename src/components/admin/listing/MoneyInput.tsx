"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/admin/ui";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

/** Digits and one decimal point, nothing else. What the draft stores and `parseMajor` reads. */
export function rawMajor(text: string): string {
  const [whole, ...fraction] = text.replace(/[^\d.]/g, "").split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
}

/** "2500000.5" as "2,500,000.5". */
export function groupedMajor(raw: string): string {
  const [whole, fraction] = rawMajor(raw).split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * An amount that reads as one while it is typed: 2500000 shows as 2,500,000.
 *
 * The draft keeps the raw digits, so a saved listing compares clean and every
 * existing parse keeps working. Only the box is grouped, and the caret is put
 * back after the same number of digits it followed, so a comma appearing never
 * throws the typist a place to the left.
 */
export function MoneyInput({
  value,
  onChange,
  className = inputClass,
  ...rest
}: {
  value: string;
  onChange: (raw: string) => void;
  className?: string;
} & NativeProps) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const shown = groupedMajor(value);

  useLayoutEffect(() => {
    const el = ref.current;
    const digits = caret.current;
    if (!el || digits === null) return;
    caret.current = null;
    let pos = 0;
    for (let seen = 0; pos < shown.length && seen < digits; pos++) {
      if (shown[pos] !== ",") seen++;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <input
      {...rest}
      ref={ref}
      className={className}
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const el = e.target;
        const beforeCaret = el.value.slice(0, el.selectionStart ?? el.value.length);
        caret.current = beforeCaret.replace(/[^\d.]/g, "").length;
        onChange(rawMajor(el.value));
      }}
    />
  );
}
