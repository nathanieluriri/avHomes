"use client";

import type { CSSProperties, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useMoneyHidden } from "@/lib/marketer/prefs";
import { HiddenMoney, Money, moneyParts, type MoneySize } from "../ui";

/**
 * Money that respects the eye on home: the figure, or the dots when the
 * marketer hid their amounts on this phone.
 */
export function Amount({
  minor,
  currency = "NGN",
  size = "md",
  kobo = false,
  className = "",
}: {
  minor: number;
  currency?: string;
  size?: MoneySize;
  /** The exact figure, kobo and all. A receipt sets it; a scannable list does not. */
  kobo?: boolean;
  className?: string;
}) {
  const [hidden] = useMoneyHidden();
  if (hidden) return <HiddenMoney className={`m-money--${size} ${className}`} />;
  return <Money minor={minor} currency={currency} size={size} kobo={kobo} className={className} />;
}

/** A take-back: a true minus sign and the bad tone, so it never reads as money coming in. */
export function NegativeAmount({
  minor,
  currency = "NGN",
  size = "md",
}: {
  minor: number;
  currency?: string;
  size?: MoneySize;
}) {
  return (
    <span className="whitespace-nowrap text-(color:--m-bad-fg)">
      <span aria-hidden className="m-money mr-px">
        &minus;
      </span>
      <span className="sr-only">minus </span>
      <Amount minor={Math.abs(minor)} currency={currency} size={size} />
    </span>
  );
}

/**
 * An amount that says which way it went.
 *
 * Three signals, not one. Colour is the fastest to read and the one that fails
 * first: about one man in twelve cannot separate this green from this red, and
 * nobody can in a greyscale screenshot. So the sign is real text and the
 * direction is spelled out for a screen reader, and the row beside this carries
 * the words "Money In" or "Money Out". Colour is the accelerator, never the
 * carrier.
 */
export function DirectedAmount({
  minor,
  currency = "NGN",
  size = "md",
  kobo = false,
  plain = false,
  className = "",
}: {
  /** Signed. Negative is money leaving the marketer. */
  minor: number;
  currency?: string;
  size?: MoneySize;
  /** The exact figure. A receipt shows kobo; a list rounds to the naira. */
  kobo?: boolean;
  /** No colour, for money that was cancelled and went neither way. */
  plain?: boolean;
  className?: string;
}) {
  const out = minor < 0;
  const tone = plain
    ? ""
    : out
      ? "text-(color:--m-out-fg)"
      : "text-(color:--m-in-fg)";
  return (
    <span className={`whitespace-nowrap ${tone} ${className}`}>
      <span aria-hidden className="m-money mr-px">
        {out ? "−" : "+"}
      </span>
      <span className="sr-only">{out ? "minus " : "plus "}</span>
      <Amount minor={Math.abs(minor)} currency={currency} size={size} kobo={kobo} />
    </span>
  );
}

/** The eye that hides and shows every amount in the app. */
export function EyeButton({ onWine = false }: { onWine?: boolean }) {
  const [hidden, setHidden] = useMoneyHidden();
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-label={hidden ? "Show amounts" : "Hide amounts"}
      aria-pressed={hidden}
      className={`m-press m-tap grid h-9 w-9 shrink-0 place-items-center rounded-full ${
        onWine ? "text-white/80 active:bg-white/15" : "text-m-muted active:bg-m-raised"
      }`}
    >
      {hidden ? (
        <Eye className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      ) : (
        <EyeOff className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      )}
    </button>
  );
}

/** Home's rule: sized from the whole number so a long figure fits a 360px screen beside the eye. */
function figureSize(whole: string): string {
  return `min(2.75rem, calc((100vw - 6.75rem) / ${(whole.length * 0.6 + 1.1).toFixed(2)}))`;
}

/**
 * The big figure on a wine hero, drawn the way home draws it: naira sign and
 * kobo smaller, dots laid over the real box when hidden so nothing moves.
 */
export function HeroFigure({
  label,
  icon,
  minor,
  currency = "NGN",
  children,
}: {
  label: string;
  icon?: ReactNode;
  minor: number;
  currency?: string;
  children?: ReactNode;
}) {
  const [hidden] = useMoneyHidden();
  const size = figureSize(moneyParts(minor, currency, true).whole);

  return (
    <div className="mt-5 flex flex-col items-center text-center">
      <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/85">
        {icon}
        {label}
      </p>
      {/* The left pad matches the eye, so the figure itself reads as centred. */}
      <div className="mt-2 flex max-w-full items-center justify-center gap-1 pl-10">
        <p className="min-w-0" style={{ "--m-figure": size } as CSSProperties}>
          <span className={`m-figure ${hidden ? "m-figure--hidden" : ""}`}>
            <Money minor={minor} currency={currency} size="hero" kobo animate />
            {hidden && (
              <>
                <span aria-hidden className="m-figure__dots">
                  {[0, 1, 2, 3, 4, 5].map((dot) => (
                    <span key={dot} />
                  ))}
                </span>
                <span className="sr-only">Amount hidden</span>
              </>
            )}
          </span>
        </p>
        <EyeButton onWine />
      </div>
      {children}
    </div>
  );
}
