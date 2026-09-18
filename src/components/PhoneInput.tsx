"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  groupNational,
  joinPhone,
  phoneCountry,
  phoneDigits,
  phonePlaceholder,
  splitPhone,
} from "@avhomes/contracts";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "name" | "className"
>;

/**
 * One phone field for the whole application: the site, the console and the app.
 *
 * It stores E.164 ("+2348030000000") and shows groups ("803 000 0000"), so what
 * a person reads and what the database holds stop being the same string. Before
 * this, six screens each took a free-text number in whatever shape it was
 * typed, and the country was a convention: everyone assumed Nigeria, nobody
 * wrote it down, and a Ghanaian buyer's number was stored as digits that dial
 * nothing from a Lagos handset.
 *
 * THE COUNTRY IS A REAL `<select>` under a chip drawn on top of it.
 *
 * A listbox built by hand would need a focus trap, type-ahead, Escape, arrow
 * keys and a scroll container, and would still open a desktop popover on a
 * phone. The native control is given all of that by the platform, opens the
 * system wheel on iOS and Android, and is already the idiom every other picker
 * in this codebase uses. What it cannot do is show a short label while holding
 * a long one, so the chip beside it renders the flag and the code and the
 * select sits over it at zero opacity, still focusable and still labelled.
 *
 * Fully controlled apart from the country, which has to be remembered: clearing
 * the box clears the stored value, and a value of "" cannot say which country
 * the person had chosen.
 */
export function PhoneInput({
  value,
  onChange,
  name,
  className = "",
  inputClassName = "",
  disabled,
  ...rest
}: {
  /** The stored value. E.164, or whatever was typed before this field existed. */
  value: string;
  onChange: (next: string) => void;
  /** Renders a hidden input, for a form read through FormData. */
  name?: string;
  /** The WRAPPER's look. It owns the border, the background and the padding. */
  className?: string;
  inputClassName?: string;
} & NativeProps) {
  const parsed = splitPhone(value);
  const [iso2, setIso2] = useState(parsed.iso2);
  /* The value's own country wins whenever it names one, so a form that loads a
     record after mount, or resets to somebody else's number, moves the flag
     with it. A cleared box keeps the country the operator picked. */
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    if (value.trim() !== "" && parsed.iso2 !== iso2) setIso2(parsed.iso2);
  }

  const country = phoneCountry(iso2) ?? phoneCountry(DEFAULT_PHONE_COUNTRY);
  const national = value.trim() === "" ? "" : parsed.national;
  const shown = groupNational(iso2, national);

  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  /* The caret is put back after the same number of DIGITS it followed. A group
     appearing mid-type otherwise throws the typist a place to the left, which is
     the whole reason grouped inputs get abandoned. Same mechanism as MoneyInput. */
  useLayoutEffect(() => {
    const el = ref.current;
    const digits = caret.current;
    if (!el || digits === null) return;
    caret.current = null;
    let pos = 0;
    for (let seen = 0; pos < shown.length && seen < digits; pos++) {
      if (shown[pos] !== " ") seen++;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="relative inline-flex shrink-0 items-center">
        {/* THE CODE, NOT A FLAG.
            Windows renders a regional-indicator pair as two boxed letters
            rather than a flag, and at this size that is a smudge beside the
            dial code on the desktop half the console is read on. The letters
            also say something the flag cannot: +1 is the United States and
            Canada, +44 is four places, and "US +1" names which one is
            selected where a picture of a flag at 15px does not. */}
        {/* No colour of its own. The wrapper carries the surface's text colour
            (plum in the console, `--m-text` on the app's dark field) and both
            the code and the divider below inherit it, so one component sits
            correctly on a light form and a dark one. */}
        <span
          aria-hidden="true"
          className="pointer-events-none inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums"
        >
          <span className="text-[11px] tracking-[0.06em] opacity-70">{iso2}</span>
          +{country?.dial}
          <svg viewBox="0 0 10 6" className="h-[5px] w-2.5 opacity-60" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <select
          aria-label="Country calling code"
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={iso2}
          onChange={(e) => {
            const next = e.target.value;
            setIso2(next);
            // The national digits belong to the person, not to the country, so
            // switching flags re-codes the same number rather than clearing it.
            if (national !== "") onChange(joinPhone(next, national));
          }}
        >
          {PHONE_COUNTRIES.map((option) => (
            <option key={option.iso2} value={option.iso2}>
              {option.name} +{option.dial}
            </option>
          ))}
        </select>
      </span>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-current opacity-20" />

      <input
        {...rest}
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete={rest.autoComplete ?? "tel-national"}
        disabled={disabled}
        placeholder={rest.placeholder ?? phonePlaceholder(iso2)}
        className={`w-full min-w-0 bg-transparent tabular-nums outline-none ${inputClassName}`}
        value={shown}
        onChange={(e) => {
          const el = e.target;
          const beforeCaret = el.value.slice(0, el.selectionStart ?? el.value.length);
          caret.current = phoneDigits(beforeCaret).length;
          // Fifteen digits is E.164's whole ceiling including the country code,
          // so nothing longer can be a phone number anywhere.
          const digits = phoneDigits(el.value).slice(0, 15 - (country?.dial.length ?? 0));
          onChange(joinPhone(iso2, digits));
        }}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
