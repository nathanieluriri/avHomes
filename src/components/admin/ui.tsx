"use client";

import Link from "next/link";
import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ApiError } from "@/lib/admin/client";

/**
 * The console's component set.
 *
 * Deliberately small: composition happens in Tailwind on the screens
 * themselves, and only the shapes that recur across screens get a component
 * here. The one that earns the most is still `ErrorNote`, because the whole
 * point of the server's error table is lost if the client renders every failure
 * as the word "Error".
 *
 * The type ramp is tighter than the marketing site's, on purpose. The largest
 * thing on a console screen is a page title at 20px and everything else is 11
 * to 14. Density is the feature: an operator reading a table all day wants more
 * rows on screen, not larger ones.
 */

/* ══════════════════════════════════════════════════════════════ FEEDBACK ══ */

/**
 * Renders a failure the way the error table intended.
 *
 * The sentence, then the named refusal code, then per-field issues, then a
 * copyable diagnostic carrying the requestId. An operator reporting a problem
 * can paste one line that ties their screen to a server log entry.
 */
export function ErrorNote({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const b = error.body;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">{error.message}</p>

      {b.issues && b.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-800">
          {b.issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>
              <code className="font-mono text-xs">{issue.path}</code>: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {b.hint && <p className="mt-2 text-red-800">{b.hint}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono">
          {error.status} {b.error}
        </span>
        {b.requestId && (
          <button
            type="button"
            className="font-mono text-red-700 underline underline-offset-2"
            onClick={() => {
              void navigator.clipboard.writeText(error.diagnostic);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "copied" : `requestId ${b.requestId.slice(0, 8)}`}
          </button>
        )}
        {onRetry && (
          <button type="button" className="text-red-700 underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>

      {b.debug && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-red-700">
            {b.debug.name} at {b.debug.at}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-100 p-2 text-[11px] leading-relaxed">
            {b.debug.message}
            {"\n"}
            {b.debug.stack.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ SURFACES ══ */

/**
 * White on haze. The hairline in `shadow-card` is the whole edge: a real
 * border at this size makes a page of cards read as a wireframe of boxes
 * rather than as a set of surfaces.
 */
export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** Off for cards whose content owns its own padding, such as a table. */
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-card ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** A card's own heading row, with optional trailing action. */
export function CardHead({
  title,
  action,
  icon: Icon,
}: {
  title: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-550" aria-hidden />}
      <h2 className="text-sm font-semibold text-plum-950">{title}</h2>
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ PAGE HEADER ══ */

/**
 * The page frame's header, and the only place a breadcrumb is drawn.
 *
 * `backTo` turns the title row into a crumb: the parent section, then a
 * chevron, then this page's own title. It replaces a "back" line above the
 * heading, because the crumb says where you are AND takes you up in one object.
 *
 * The parent chip keeps its LABEL rather than collapsing to an icon. The
 * reference admin uses an icon-only chip and then needs a tap-to-peek
 * affordance on touch to explain it, which is a second control paying for the
 * first one's ambiguity. A two word label costs less room than that.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
  badge,
  backTo,
  backLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** A status chip beside the title, for detail screens. */
  badge?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {backTo && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1">
            <Link
              href={backTo}
              className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-mist-200/70 hover:text-plum-950"
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
              {backLabel ?? "Back"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mist-300" aria-hidden="true" />
            <span className="truncate px-1 text-[13px] text-slate-550" aria-current="page">
              {title}
            </span>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {Icon && !backTo && (
            <Icon className="h-5 w-5 shrink-0 text-slate-550" aria-hidden />
          )}
          <h1 className="truncate text-xl font-bold tracking-tight text-plum-950">{title}</h1>
          {badge}
        </div>

        {subtitle && <p className="mt-1 text-[13px] text-slate-600">{subtitle}</p>}
      </div>

      {/* Primary action last, at the far right, where the eye lands after the
          title. Secondary things go to its left. */}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ BUTTONS ══ */

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

/*
 * The bevel classes live in console.css because three stacked inset shadows are
 * not expressible as utilities, and because a border cannot say what they say:
 * a border is the same on all four sides, and the whole effect is a dark
 * hairline under a light one.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "c-bevel-primary bg-wine-600 text-white hover:bg-wine-700 disabled:bg-mist-300",
  ghost: "c-bevel bg-white text-plum-950 hover:bg-mist-50 disabled:text-mist-300",
  danger: "c-bevel bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[12px]",
  md: "h-8 gap-1.5 px-3 text-[13px]",
  lg: "h-9 gap-2 px-3.5 text-[13px]",
};

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed";

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${BUTTON_BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** The same shape as a real link, so middle-click and open-in-new-tab work. */
export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════ FIELDS ══ */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-600">{hint}</span>}
    </label>
  );
}

/*
 * No ring utility here. `.console :focus-visible` in console.css draws one ring
 * for every focusable thing in the console, so a control cannot forget to have
 * one. The previous version paired `outline-none` with `focus:ring-2`, and the
 * global box-shadow reset ate the ring, which left admin inputs with no visible
 * focus state at all.
 */
export const inputClass =
  "w-full rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500";

/* ════════════════════════════════════════════════════════════════ STATUS ══ */

export type Tone = "neutral" | "green" | "amber" | "wine" | "red";

/*
 * A fill plus the ink that is legal ON that fill, never ink chosen against
 * white. Badges are the only saturated surfaces in the console, which is
 * exactly what makes a scan down a status column work.
 *
 * `red` sits one step darker than the other tints. The brand tone used to be
 * blue, so danger was the only red in the column and a 50 ground was enough to
 * name it. Now the brand is a wine red, and a wine tint beside a red tint is
 * two pale pinks: "For rent" and "Deleted" stop being one glance apart. The
 * 100/800 pair keeps danger the louder of the two.
 */
const TONES: Record<Tone, string> = {
  neutral: "bg-mist-100 text-slate-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  wine: "bg-wine-50 text-wine-700",
  red: "bg-red-100 text-red-800",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════ EMPTY ═══ */

/**
 * Two grades, and getting them the wrong way round is the usual composition
 * mistake. The plain ring is right for a filter that matched nothing. The
 * illustrated grade, with an `art` shelf, is for a screen's true first run and
 * only that: an onboarding picture over an empty search result is a picture
 * telling somebody to start something they already started.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon,
  action,
  art,
}: {
  title: string;
  hint?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: ReactNode;
  art?: ReactNode;
}) {
  if (art) {
    return (
      <div className="grid items-center gap-6 rounded-2xl bg-white p-8 shadow-card sm:grid-cols-[minmax(0,1fr)_auto] sm:p-10">
        <div>
          <p className="text-base font-semibold text-plum-950">{title}</p>
          {hint && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-600">{hint}</p>}
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
        <div aria-hidden="true" className="justify-self-center sm:justify-self-end">
          {art}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-card">
      {Icon && (
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-mist-100 text-slate-550">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <p className="font-semibold text-plum-950">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-600">{hint}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ LOADING ════ */

/** A shaped placeholder, not a spinner. See `Spinner` for when each applies. */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  /** For a placeholder whose height comes from an aspect ratio. */
  style?: CSSProperties;
}) {
  return <span className={`c-skeleton block rounded-md ${className}`} style={style} />;
}

/**
 * For a shape that cannot be predicted. Anything whose layout IS known before
 * the data lands gets a `Skeleton` in that exact shape instead, so the page
 * does not reflow on arrival.
 */
export function Spinner() {
  return (
    <div className="flex items-center gap-2 py-10 text-[13px] text-slate-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist-300 border-t-wine-600" />
      Loading
    </div>
  );
}
