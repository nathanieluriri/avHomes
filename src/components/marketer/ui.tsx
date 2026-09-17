"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { DEAL_STATUS_LABEL, minorUnitsFor, type DealStatus } from "@avhomes/contracts";
import { ApiError } from "@/lib/admin/client";
import { useMediaQuery } from "@/lib/admin/hooks";
import { isAppPath } from "@/lib/marketer/api";

/**
 * The marketer app's component set, drawn in Night plum.
 *
 * The surfaces are this app's own. The console is a dense briefing read at a
 * desk; this is one column on a phone held in one hand, where type is larger,
 * targets are 44px and money is the loudest thing on the screen. So cards,
 * rows and chips take their colour from the `--m-*` roles in m.css
 * (`bg-m-card`, `text-m-muted`), and the same component is right on the dark
 * ground and inside `.m-paper`.
 *
 * THE BUTTONS ARE THE EXCEPTION, and they are the console's, down to the
 * shadow alphas: the wine fill, the white second tier, the bevel, the pressed
 * face and the flat disabled plate all come from console.css by way of m.css.
 * A button is the one thing an operator uses in both places, and two answers
 * to "what is a button" in one product is one too many. The `--m-*` roles do
 * not reach them, on purpose: a key that changed colour with the ground would
 * be a different key.
 *
 * No screen hand-rolls a card, a row or a button: every surface in `/m` comes
 * from this file, `Sheet.tsx`, `AppShell.tsx` or `NavBar.tsx`.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/* ══════════════════════════════════════════════════════════════════ MOTION ══ */

const COUNT_MS = 260;

/**
 * A number that rolls up once per mount, then holds the real value.
 *
 * Frames drive the roll, and a timer lands it on the real value regardless: a
 * tab in the background runs no frames, and a figure left sitting at zero is
 * the worst thing a money screen can show.
 */
export function useCountUp(value: number, enabled = true): number {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const run = enabled && !reduced;
  const [progress, setProgress] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!run || done.current) return;
    let frame = 0;
    const from = performance.now();
    const finish = () => {
      done.current = true;
      setProgress(1);
    };
    const step = (now: number) => {
      const p = Math.min(1, (now - from) / COUNT_MS);
      if (p >= 1) {
        finish();
        return;
      }
      setProgress(p);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const land = window.setTimeout(finish, COUNT_MS + 160);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(land);
    };
  }, [run]);

  if (!run || progress >= 1) return value;
  return Math.round(value * (1 - (1 - progress) ** 3));
}

/* ═══════════════════════════════════════════════════════════════════ MONEY ══ */

/** A figure split so the sign and the kobo can be set smaller than the whole. */
export function moneyParts(
  minor: number,
  currency = "NGN",
  kobo = false,
): { minus: string; sign: string; whole: string; fraction: string } {
  const units = minorUnitsFor(currency);
  const places = kobo ? Math.round(Math.log10(units)) : 0;
  const parts = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).formatToParts(minor / units);

  let minus = "";
  let sign = "";
  let whole = "";
  let fraction = "";
  for (const part of parts) {
    if (part.type === "minusSign") minus += part.value;
    else if (part.type === "currency") sign += part.value;
    else if (part.type === "integer" || part.type === "group") whole += part.value;
    else if (part.type === "decimal" || part.type === "fraction") fraction += part.value;
  }
  return { minus, sign, whole, fraction };
}

export type MoneySize = "hero" | "lg" | "md" | "sm";

/**
 * Money, meant to win every screen it is on. Tabular digits, with the naira
 * sign (and the kobo, when shown) at a smaller optical size.
 */
export function Money({
  minor,
  currency = "NGN",
  size = "md",
  animate = false,
  kobo = false,
  className = "",
}: {
  minor: number;
  currency?: string;
  size?: MoneySize;
  /** Roll up on first paint. For the one headline figure on a screen, not a list. */
  animate?: boolean;
  /** Show the two decimal places. The home figure does; lists round to the naira. */
  kobo?: boolean;
  className?: string;
}) {
  const shown = useCountUp(minor, animate);
  const { minus, sign, whole, fraction } = moneyParts(shown, currency, kobo);

  return (
    <span className={`m-money m-money--${size} ${className}`}>
      {minus}
      <span className="m-money__sign">{sign}</span>
      {whole}
      {fraction !== "" && <span className="m-money__kobo">{fraction}</span>}
    </span>
  );
}

/** A figure the reader chose to hide. Says so to a screen reader. */
export function HiddenMoney({ className = "" }: { className?: string }) {
  return (
    <span className={`m-money ${className}`}>
      <span aria-hidden className="m-money__dots">
        ••••••
      </span>
      <span className="sr-only">Amount hidden</span>
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════════ SURFACES ══ */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`m-card ${padded ? "p-4" : ""} ${className}`}>{children}</div>;
}

/** A section's name, with an optional link on the right such as "See all". */
export function SectionLabel({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex min-h-6 items-center justify-between gap-3 ${className}`}>
      <h2 className="m-section-title">{children}</h2>
      {action}
    </div>
  );
}

/** The small link on the right of a section label. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="m-tap m-link inline-flex shrink-0 items-center gap-0.5 text-[13px]"
    >
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/**
 * A link that knows where it goes: a screen in this app through the router,
 * a website in a new tab, a phone number or an email as they are.
 */
export function AppLink({
  href,
  className = "",
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  if (isAppPath(href)) {
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  const web = /^https?:/iu.test(href);
  return (
    <a
      href={href}
      className={className}
      target={web ? "_blank" : undefined}
      rel={web ? "noopener noreferrer" : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}

export type NoteTone = "info" | "warn" | "good" | "bad";

/**
 * A plain sentence on a tinted plate. For the things that are not failures:
 * an explainer, a warning about a second claim, a bank check that is off.
 */
export function Note({ tone = "info", children }: { tone?: NoteTone; children: ReactNode }) {
  return <p className={`m-note ${NOTE_TONE[tone]}`}>{children}</p>;
}

const NOTE_TONE: Record<NoteTone, string> = {
  info: "m-tone-heads",
  warn: "m-tone-warn",
  good: "m-tone-good",
  bad: "m-tone-bad",
};

/* ══════════════════════════════════════════════════════════════════ BUTTONS ══ */

/**
 * The console's key, in five tiers. `primary` is the wine one, one per screen.
 * `secondary` is the raised one. `hero` is the flat pink glass, and it stays
 * flat: it is drawn on the wine header, where a key with an edge of its own
 * reads as a patch stuck on rather than as part of the hero. `quiet` is
 * the wine wash, for a real action that is not the screen's. `ghost` is the old
 * name for `secondary`, kept so a screen not yet redrawn still compiles.
 *
 * Every tier's fill, glare, bevel, press and disabled plate is in m.css. The
 * construction is the console's, with the bevel turned over for a dark ground:
 * the lit lip on top, the dark mass underneath, the face catching its own
 * light. Nothing about how a button looks is decided here.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "hero"
  | "ghost"
  | "quiet"
  | "danger"
  | "whatsapp";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "m-btn--primary",
  secondary: "m-btn--secondary",
  hero: "m-glass",
  ghost: "m-btn--secondary",
  quiet: "m-btn--quiet",
  danger: "m-btn--danger",
  whatsapp: "m-btn--whatsapp",
};

/* `sm` draws at 36px and still answers to a 44px thumb through `.m-tap`. No
   size overrides the radius: the console draws every size at `--radius-lg`,
   and a smaller corner on the dense one made it read as a chip, not a key. */
const BTN_SIZE = {
  sm: "m-tap h-9 px-3.5 text-[13px]",
  md: "h-11 px-4 text-[14px]",
  lg: "h-[52px] px-5 text-[15px]",
} as const;

export type ButtonSize = keyof typeof BTN_SIZE;

function buttonClass(variant: ButtonVariant, size: ButtonSize, full: boolean, extra: string) {
  return `m-btn ${VARIANT[variant]} ${BTN_SIZE[size]} ${full ? "w-full" : ""} ${extra}`;
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  full = false,
  busy = false,
  disabled = false,
  className = "",
  ...aria
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  /** Shows a spinner and blocks the tap. Say what is happening in `children`. */
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, full, className)}
      {...aria}
    >
      {busy && <Spin />}
      {children}
    </button>
  );
}

/** The one big call to action a screen is allowed. Full width, 52px, wine glass. */
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  busy = false,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      variant="primary"
      size="lg"
      full
      busy={busy}
      disabled={disabled}
      className={className}
    >
      {children}
    </Button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  full = false,
  external = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  /** A tel: or wa.me link, which the router must not try to handle. */
  external?: boolean;
  className?: string;
}) {
  const cls = buttonClass(variant, size, full, className);
  if (external) {
    return (
      <a href={href} className={cls} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Inside a button only. A screen that is loading gets skeletons, never this. */
export function Spin() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════ FIELDS ══ */

/**
 * A dark field: card colour, hairline border, wine focus ring. The text is 16px
 * from m.css, so iOS never zooms. Padding stays a utility so a call site can
 * make room for an icon with `pl-11`.
 */
export const inputCls = "m-field w-full rounded-[14px] px-3.5 py-3 outline-none";

/**
 * `as="group"` for a field whose control is not one input: a bank picker, a set
 * of photo buttons. A <label> wrapping several controls sends every tap on its
 * padding to the first one, which on a phone is most of the taps.
 */
export function Field({
  label,
  hint,
  error,
  children,
  as = "label",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  as?: "label" | "group";
}) {
  const id = useId();
  const head = (
    <span
      id={as === "group" ? id : undefined}
      className="mb-1.5 block text-[13px] font-semibold text-m-text"
    >
      {label}
    </span>
  );
  const foot = error ? (
    <span className="mt-1.5 block text-[13px] font-medium text-(color:--m-bad-fg)">{error}</span>
  ) : hint ? (
    <span className="mt-1.5 block text-[13px] text-m-muted">{hint}</span>
  ) : null;

  if (as === "group") {
    return (
      <div role="group" aria-labelledby={id}>
        {head}
        {children}
        {foot}
      </div>
    );
  }
  return (
    <label className="block">
      {head}
      {children}
      {foot}
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════ STATUS ══ */

/**
 * `act`, `heads-up` and `good` are the alert tones. `warn` and `bad` are amber
 * and red. The last four names are the old ones, kept for screens not yet
 * redrawn.
 */
export type ChipTone =
  | "neutral"
  | "act"
  | "heads-up"
  | "good"
  | "warn"
  | "bad"
  | "wine"
  | "amber"
  | "green"
  | "red";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "m-tone-neutral",
  act: "m-tone-act",
  "heads-up": "m-tone-heads",
  good: "m-tone-good",
  warn: "m-tone-warn",
  bad: "m-tone-bad",
  wine: "m-tone-act",
  amber: "m-tone-warn",
  green: "m-tone-good",
  red: "m-tone-bad",
};

/** A short label on a tinted pill: a status, a level, a code. */
export function Chip({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  /** A leading dot, for a live status such as Active. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`m-chip ${CHIP_TONE[tone]} ${className}`}>
      {dot && <span aria-hidden className="m-chip__dot" />}
      {children}
    </span>
  );
}

const DEAL_TONE: Record<DealStatus, ChipTone> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
  info: "act",
  cancelled: "neutral",
};

export function StatusPill({ status }: { status: DealStatus }) {
  return <Chip tone={DEAL_TONE[status]}>{DEAL_STATUS_LABEL[status]}</Chip>;
}

/* ═════════════════════════════════════════════════════════════════════ ROWS ══ */

/**
 * The list primitive: a label, a line under it, and a value on the right.
 * A link, a button or a plain row depending on what it is given.
 */
export function StatRow({
  label,
  sub,
  value,
  lead,
  href,
  onClick,
  className = "",
}: {
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  /** A thumbnail, an avatar or a 3D icon. */
  lead?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const tappable = Boolean(href ?? onClick);
  const body = (
    <>
      {lead && <span className="shrink-0">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">{label}</span>
        {sub && <span className="mt-0.5 block truncate text-[13px] text-m-muted">{sub}</span>}
      </span>
      {value && <span className="shrink-0 text-right">{value}</span>}
      {tappable && <ChevronRight className="h-4 w-4 shrink-0 text-m-faint" aria-hidden />}
    </>
  );

  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left ${
    tappable ? "m-press m-press-light" : ""
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Rows in one card, hairlined between. */
export function RowGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`m-card divide-y divide-m-line overflow-hidden ${className}`}>{children}</div>
  );
}

/**
 * A square-ish tile with a 3D icon over a short label, for Quick access and
 * any other grid of places to go.
 */
export function IconTile({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="m-card m-press m-press-light flex min-h-[6.75rem] flex-col items-center justify-center gap-2 px-2 py-3 text-center"
    >
      <span aria-hidden className="grid h-12 w-12 place-items-center">
        {icon}
      </span>
      <span className="text-[13px] font-semibold leading-tight text-m-text">{label}</span>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════════════════ CONTROL ══ */

/**
 * The segmented control, with an indicator that slides.
 *
 * The count and the index go to CSS as custom properties because the
 * indicator's width is `100% / count` and only this component knows the count.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  /** Names the set for a screen reader. "Which deals", not "Tabs". */
  label: string;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`m-seg ${options.length > 2 ? "m-seg--tight" : ""} ${className}`}
      style={{ "--m-seg-count": options.length, "--m-seg-index": index } as CSSProperties}
    >
      <span aria-hidden className="m-seg__ind" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className="m-seg__btn"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Where you are in a multi step form, and how much is left. */
export function Stepper({
  step,
  labels,
}: {
  /** 1 based. */
  step: number;
  labels: readonly string[];
}) {
  const total = labels.length;
  const pct = Math.round((step / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-bold text-m-text">{labels[step - 1]}</p>
        <p className="m-num shrink-0 text-[12px] font-semibold text-m-muted">
          Step {step} of {total}
        </p>
      </div>
      <div
        className="m-prog"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label="How far through"
      >
        <span className="m-prog__fill block" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ FEEDBACK ══ */

/**
 * The server's own sentence, then a way back.
 *
 * Never the word "Error" and never a status code on its own: the API writes a
 * sentence for every refusal it makes, and that sentence is the only part a
 * marketer can act on.
 */
export function ErrorNote({
  error,
  onRetry,
  className = "",
}: {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`m-tone-bad rounded-[16px] p-4 ${className}`}>
      <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">{error.message}</p>
      {error.body.issues && error.body.issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] opacity-90">
          {error.body.issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`} className="[overflow-wrap:anywhere]">
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * An empty section that says what happens next, over a 3D icon or a piece of
 * quiet art. `compact` for a strip on the home screen, where a tall card would
 * push everything else down.
 */
export function EmptyState({
  art,
  title,
  hint,
  action,
  compact = false,
}: {
  art?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="m-card flex items-center gap-4 px-4 py-4">
        {art && (
          <span aria-hidden className="grid shrink-0 place-items-center">
            {art}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-m-text">{title}</span>
          {hint && (
            <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">{hint}</span>
          )}
        </span>
        {action}
      </div>
    );
  }
  return (
    <div className="m-card px-6 py-9 text-center">
      {art && (
        <div aria-hidden className="mx-auto mb-5 flex w-[132px] justify-center">
          {art}
        </div>
      )}
      <p className="text-[17px] font-bold text-m-text">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-[19rem] text-[14px] leading-relaxed text-m-muted">
          {hint}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ LOADING ══ */

/** A shaped placeholder. Never a spinner over a whole screen. */
export function Skeleton({
  className = "",
  onWine = false,
  radius = "0.5rem",
}: {
  className?: string;
  /** For a placeholder drawn on the wine hero, where the dark one disappears. */
  onWine?: boolean;
  /** The corner, as a CSS length. */
  radius?: string;
}) {
  return (
    <span
      aria-hidden
      className={`m-skel block ${onWine ? "m-skel--onwine" : ""} ${className}`}
      style={{ borderRadius: radius }}
    />
  );
}
