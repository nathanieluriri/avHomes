"use client";

/**
 * Naira in, kobo out, on the dark field.
 *
 * Fully controlled with no text of its own: a local copy of the number drifts
 * from the form the moment the form resets. Every non digit is stripped, so a
 * pasted "N 4,500,000" and a typed "4500000" land on the same value. No kobo:
 * a decimal point on a phone keypad is one more way to send a hundredth.
 */
export function NairaInput({
  value,
  onChange,
  placeholder = "0",
  invalid = false,
  label,
}: {
  /** Minor units, which is what the API takes. */
  value: number;
  onChange: (minor: number) => void;
  placeholder?: string;
  invalid?: boolean;
  label?: string;
}) {
  const naira = Math.floor(value / 100);
  const text = naira > 0 ? naira.toLocaleString("en-NG") : "";

  return (
    <div
      className={`m-field flex items-center gap-2 rounded-[16px] px-4 py-2.5 ${invalid ? "m-bad" : ""}`}
    >
      <span aria-hidden className="text-[22px] font-semibold text-m-muted">
        &#8358;
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          // Twelve digits is a trillion naira, and stays inside safe integers.
          const digits = event.target.value.replace(/\D/gu, "").slice(0, 12);
          onChange(digits === "" ? 0 : Number(digits) * 100);
        }}
        className="m-num m-input-lg w-full min-w-0 bg-transparent font-bold tracking-[-0.02em] text-m-text outline-none placeholder:font-semibold placeholder:text-m-faint"
      />
    </div>
  );
}
