"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Field, inputClass } from "@/components/admin/ui";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "className"
>;

/**
 * A whole number in the draft, and a STRING on screen.
 *
 * Rendering `value={value}` and writing back `Number(text) || 0` meant clearing
 * the box put a literal 0 in it under the caret, so every edit started by
 * deleting a zero somebody never typed. With a mouse that is hidden by
 * select-all; on a phone, where clearing means backspacing to empty and there is
 * no cheap select-all, it happened on every spec field every time.
 *
 * So the box holds the raw text and the draft holds the number. An empty box
 * stays empty and the draft carries 0 (or null, for a field where empty means
 * "not stated"), which is what the server would store for a blank anyway.
 *
 * The parent still owns the value: a save response, a discard or "Load theirs"
 * all reset the draft, and this adopts that DURING RENDER, the way `useAsync`
 * resets for a changed input. The guard is what stops it fighting the typist:
 * a value that already agrees with the text on screen came FROM this box, and
 * rewriting it would turn "05" into "5" mid-keystroke.
 *
 * `min` and `max` are applied on blur rather than per keystroke, because
 * clamping while typing turns the "1" of "12" into the minimum.
 */
export function NumberInput({
  value,
  onChange,
  nullable = false,
  min,
  max,
  className = inputClass,
  ...rest
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Empty means null rather than 0. */
  nullable?: boolean;
  min?: number;
  max?: number;
  className?: string;
} & NativeProps) {
  const read = (text: string): number | null =>
    text.trim() === "" ? (nullable ? null : 0) : Math.trunc(Number(text)) || 0;
  const show = (v: number | null) => (v === null ? "" : String(v));

  const [raw, setRaw] = useState(show(value));
  const [seen, setSeen] = useState(value);

  if (seen !== value) {
    setSeen(value);
    if (read(raw) !== value) setRaw(show(value));
  }

  return (
    <input
      {...rest}
      className={className}
      type="number"
      inputMode="numeric"
      autoComplete="off"
      min={min}
      max={max}
      value={raw}
      /* A wheel over a focused number input scrolls the value instead of the
         page, which rewrote a bedroom count on the way past it. Blurring on
         the wheel stops that without taking the spinners away: they are a
         mouse affordance and this console has always drawn them. */
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(read(e.target.value));
      }}
      onBlur={(e) => {
        let next = read(raw);
        if (next !== null && min !== undefined && next < min) next = min;
        if (next !== null && max !== undefined && next > max) next = max;
        if (next !== value) onChange(next);
        setRaw(show(next));
        rest.onBlur?.(e);
      }}
    />
  );
}

/** A labelled NumberInput for a field that is never blank. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput value={value} min={min} max={max} onChange={(v) => onChange(v ?? 0)} />
    </Field>
  );
}
