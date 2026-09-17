"use client";

/**
 * Naira in, kobo out.
 *
 * FULLY CONTROLLED BY THE PARENT, with no text of its own. A second copy of the
 * number held locally is the usual way this component is written and it is also
 * how it goes wrong: the two drift the moment the parent resets the form, and
 * the field then shows a figure the form no longer holds.
 *
 * Every non digit is stripped on the way in, so a pasted "N 4,500,000" and a
 * typed "4500000" arrive at the same value. Kobo are not offered: a Nigerian
 * property price has never needed them and a decimal point on a phone keypad is
 * one more way to submit a hundredth of the real figure.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = "0",
  invalid = false,
}: {
  /** Minor units, which is what the API takes. */
  value: number;
  onChange: (minor: number) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const naira = Math.floor(value / 100);
  const text = naira > 0 ? naira.toLocaleString("en-NG") : "";

  return (
    <div
      className={`flex items-center gap-2 rounded-[14px] border bg-white px-3.5 py-2.5 transition-colors focus-within:border-wine-500 ${
        invalid ? "m-bad" : "border-mist-200"
      }`}
    >
      <span aria-hidden className="text-[22px] font-semibold text-slate-550">
        &#8358;
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          // Twelve digits is a trillion naira, comfortably past any real deal
          // and short enough that the value never leaves safe integer range.
          const digits = event.target.value.replace(/\D/gu, "").slice(0, 12);
          onChange(digits === "" ? 0 : Number(digits) * 100);
        }}
        className="m-num m-input-lg w-full min-w-0 bg-transparent font-bold tracking-[-0.02em] text-plum-950 outline-none placeholder:font-semibold placeholder:text-mist-300"
      />
    </div>
  );
}
