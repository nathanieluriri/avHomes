"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
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
 *
 * ON A PHONE THAT TRADE IS MADE TWICE, in opposite directions, and the split is
 * what most of the responsive classes in this file are for. What is DRAWN stays
 * dense, because the ramp is the design and a console inflated to app-store
 * proportions stops being a briefing. What is TOUCHED grows, because a finger
 * needs 44px and a 28px control is a mis-tap whatever it looks like. Controls
 * that stand alone in a row grow their real height here in the size map;
 * controls that must keep their drawn size, such as a pager chevron beside a
 * count, keep it and gain a 44px hit area from `.c-tap` in console.css.
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
      {/* An error sentence can name a field path or a URL, and neither has a
          space in it. Inside a 288px card an unbreakable token pushes the whole
          notice into horizontal scroll, which on a fixed frame means the entire
          console scrolls sideways. */}
      <p className="font-semibold [overflow-wrap:anywhere]">{error.message}</p>

      {b.issues && b.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-800">
          {b.issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`} className="[overflow-wrap:anywhere]">
              <code className="font-mono text-xs">{issue.path}</code>: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {b.hint && <p className="mt-2 text-red-800 [overflow-wrap:anywhere]">{b.hint}</p>}

      {/* Real boxes below sm, not underlined words. These two are the whole
          recovery path from a failed screen, and an underlined 12px run of text
          is the smallest target in the console at the moment it matters most. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:gap-3">
        <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono">
          {error.status} {b.error}
        </span>
        {b.requestId && (
          <button
            type="button"
            className="c-tap inline-flex h-9 items-center rounded-lg bg-red-100 px-2.5 font-mono text-red-800 sm:h-auto sm:bg-transparent sm:px-0 sm:text-red-700 sm:underline sm:underline-offset-2"
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
          <button
            type="button"
            className="c-tap inline-flex h-9 items-center rounded-lg bg-red-100 px-2.5 font-semibold text-red-800 sm:h-auto sm:bg-transparent sm:px-0 sm:font-normal sm:text-red-700 sm:underline sm:underline-offset-2"
            onClick={onRetry}
          >
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
  spotlight,
}: {
  children: ReactNode;
  className?: string;
  /** Off for cards whose content owns its own padding, such as a table. */
  padded?: boolean;
  /** A tutorial anchor, rendered as `data-spotlight`. */
  spotlight?: string;
}) {
  return (
    /* 16px of padding on a phone rather than 20px. On a 360px screen the sheet
       already spends 32px on its own gutters, so a 20px card pad leaves 276px
       of content: the four pixels back are the difference between a two-column
       thumbnail grid fitting and not. */
    <div
      data-spotlight={spotlight}
      className={`rounded-2xl bg-white shadow-card ${padded ? "p-4 sm:p-5" : ""} ${className}`}
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
    /* Stacked below `sm`, explicitly rather than by letting flex-wrap decide.
       The row does wrap on a phone, but `justify-between` with one line left
       resolves to `flex-start`, so the actions landed left-aligned under a
       left-aligned title with nothing to separate them, and each one kept its
       content width. Stacking says what was meant and lets the actions go full
       width, which is also what makes them a real touch target. */
    <div className="mb-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
      <div className="min-w-0">
        {backTo && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1">
            <Link
              href={backTo}
              /* A real 44px target on a phone, pulled left by its own padding so
                 the crumb still lines up with the title under it. */
              className="c-tap -ml-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-mist-200/70 hover:text-plum-950 sm:ml-0 sm:h-6 sm:px-1.5"
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
              {backLabel ?? "Back"}
            </Link>
            {/* The trailing crumb is the page's own title, which is drawn again
                in full immediately below. On a phone that is one truncated copy
                of the heading spending a line to say nothing, so only the
                parent link survives there. */}
            <ChevronRight
              className="hidden h-3.5 w-3.5 shrink-0 text-mist-300 sm:block"
              aria-hidden="true"
            />
            <span
              className="hidden truncate px-1 text-[13px] text-slate-550 sm:block"
              aria-current="page"
            >
              {title}
            </span>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {Icon && !backTo && (
            <Icon className="h-5 w-5 shrink-0 text-slate-550" aria-hidden />
          )}
          {/* Wrapped to two lines on a phone, truncated in a desktop row. A
              listing title is the one thing the screen exists to name, and a
              328px card truncates most of them to "3 bedroom apartment in..." */}
          <h1 className="line-clamp-2 text-xl font-bold tracking-tight text-plum-950 sm:truncate sm:line-clamp-none">
            {title}
          </h1>
          {badge}
        </div>

        {subtitle && <p className="mt-1 text-[13px] text-slate-600">{subtitle}</p>}
      </div>

      {/* Primary action last, at the far right, where the eye lands after the
          title. Secondary things go to its left. On a phone the cluster takes
          the full width and its buttons stretch, so a one-action header gets a
          full-width button rather than a 90px one in the corner. */}
      {actions && (
        <div className="flex shrink-0 items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ LAYOUT ════ */

/**
 * The record layout: a main column and an aside.
 *
 * Seven screens hand-rolled the same `grid lg:grid-cols-[minmax(0,1fr)_Nrem]`,
 * and every one of them read wrong on a phone in the same way, because a grid
 * that collapses puts the aside LAST. That is right for a reference card and
 * badly wrong for everything else the console keeps there: the enquiry's phone
 * number sat below the whole thread and a note box, the property's status and
 * lifecycle buttons sat below a forty-photo gallery, and Settings and Profile
 * both put the live preview of what you are typing below the fields and below
 * the keyboard, where it cannot do the one job a live preview has.
 *
 * So the flip is a decision the caller makes once, by name, instead of a
 * side-effect of source order.
 */
export function PageColumns({
  children,
  aside,
  asideWidth = "20rem",
  asideFirstOnMobile = false,
  className = "",
}: {
  children: ReactNode;
  aside: ReactNode;
  /** The `lg` track width. The screens use 18rem, 19rem and 20rem. */
  asideWidth?: string;
  /** True for a live preview, a status panel or a primary form. False for a
   *  reference card that is genuinely a footnote to the main column. */
  asideFirstOnMobile?: boolean;
  className?: string;
}) {
  return (
    <div
      style={{ "--c-aside": asideWidth } as CSSProperties}
      className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_var(--c-aside)] ${className}`}
    >
      <div className={`min-w-0 ${asideFirstOnMobile ? "order-2 lg:order-none" : ""}`}>
        {children}
      </div>
      <div className={`min-w-0 ${asideFirstOnMobile ? "order-1 lg:order-none" : ""}`}>
        {aside}
      </div>
    </div>
  );
}

/**
 * Label and value, side by side with room and stacked without it.
 *
 * Every detail aside in the console draws this shape and every one of them
 * truncated the value, which is the fact the row exists to show: a work email,
 * a slug, a revision id. Below `sm` the label takes its own line and the value
 * gets the full width; above it they share a row.
 *
 * `overflow-wrap: anywhere` rather than `truncate`, because these values have
 * no natural break and no shorter form. A slug broken across two lines is
 * readable; a slug ending in an ellipsis is not the slug.
 */
export function DefinitionList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={`space-y-2 ${className}`}>{children}</dl>;
}

export function DRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <dt className="shrink-0 text-[12px] text-slate-600">{label}</dt>
      <dd className="min-w-0 text-[13px] font-medium text-plum-950 [overflow-wrap:anywhere] sm:text-right">
        {children}
      </dd>
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
/*
 * The LIVE appearance only. Nothing here says anything about `:disabled`,
 * because the disabled state is not a variant of these three: it is one flat
 * grey plate declared once in console.css, where an unlayered rule beats every
 * utility written here and every hover fill above it. A `disabled:` class in
 * this map would be dead code that looks load-bearing.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "c-bevel-primary bg-wine-600 text-white hover:bg-wine-700",
  ghost: "c-bevel bg-white text-plum-950 hover:bg-mist-50",
  danger: "c-bevel bg-white text-red-700 hover:bg-red-50",
};

/*
 * THE RESPONSIVE HEIGHT LIVES HERE AND NOWHERE ELSE, and that is a correctness
 * rule rather than a tidiness one.
 *
 * `BUTTON_BASE`, `SIZE`, `VARIANT` and the caller's `className` are
 * concatenated in that order, but Tailwind v4 emits utilities in ITS own sort
 * order, not the order they appear in the attribute. So a call site passing
 * `className="h-11"` to beat the map's `h-8` is relying on build order: it can
 * look right in dev, survive review, and change the day an unrelated class is
 * added somewhere else in the project. Each size therefore declares exactly one
 * height, and declares it responsively.
 *
 * `sm` is the exception and stays 28px at every width. It is the in-table
 * variant, drawn beside other dense chrome where growing it would break the row
 * it sits in; those call sites carry `.c-tap` instead.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[12px]",
  md: "h-11 gap-1.5 px-4 text-[13px] sm:h-8 sm:px-3",
  lg: "h-11 gap-2 px-4 text-[13px] sm:h-9 sm:px-3.5",
};

/* `c-tap` is inert on a mouse and expands the hit area to 44px on a finger, so
   even the `sm` variant answers to a thumb without changing what it draws. */
const BUTTON_BASE =
  "c-tap inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed";

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  title,
  spotlight,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** A tutorial anchor, rendered as `data-spotlight`. */
  spotlight?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-spotlight={spotlight}
      className={`${BUTTON_BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A square button whose only content is a glyph.
 *
 * `label` is REQUIRED, and takes no default. An icon-only control has no
 * accessible name of its own, so every one of these that shipped without an
 * `aria-label` was a button a screen reader announced as "button". Making the
 * name a required prop is the only version of this component that cannot be
 * used wrongly, and it doubles as the tooltip for a sighted reader who does not
 * recognise the glyph.
 *
 * 44px on a phone, 36px from `sm` up. Icon-only controls are the worst touch
 * offenders in any console, because the glyph is small enough to look like the
 * target and the padding is invisible.
 */
export function IconButton({
  label,
  icon: Icon,
  onClick,
  type = "button",
  variant = "ghost",
  size = "md",
  disabled = false,
  className = "",
}: {
  /** Becomes both `aria-label` and `title`. Say what happens, not what it is. */
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  /** "dense" keeps the 28px desk size and takes its touch area from `.c-tap`.
   *  For a control drawn inside other dense chrome, such as a pager beside a
   *  row count or a reorder arrow on a thumbnail, where growing the drawn box
   *  would change the thing it sits in. */
  size?: "md" | "dense";
  disabled?: boolean;
  className?: string;
}) {
  const box = size === "dense" ? "h-11 w-11 sm:h-7 sm:w-7" : "h-11 w-11 sm:h-9 sm:w-9";
  const glyph = size === "dense" ? "h-4 w-4" : "h-[18px] w-[18px]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${BUTTON_BASE} ${box} ${VARIANT[variant]} ${className}`}
    >
      <Icon className={glyph} aria-hidden />
    </button>
  );
}

/**
 * A destructive action that asks once, in place.
 *
 * The console has no confirm affordance at all today, and roughly a dozen
 * unconfirmed destructive taps: move to trash, delete an image, revoke an
 * invite, disable a colleague. On a desktop those sit under a deliberate mouse
 * click. On a phone they sit under a thumb, next to a safe control, on a
 * surface the reader is also scrolling, and a scroll that starts on a button
 * registers as a tap often enough to matter.
 *
 * INLINE RATHER THAN A DIALOG, for two reasons. A dialog per destructive
 * control is a sheet mount and a focus trap for something that needs one bit of
 * confirmation, and a dialog on a phone covers the very row whose contents the
 * reader is trying to confirm. The armed label has to NAME THE OUTCOME, not say
 * "Sure?", because the second tap is the one that has to be readable.
 *
 * It disarms on a timeout and on blur, so a button left armed on a screen
 * somebody walked away from is not a loaded control when they come back.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  variant = "danger",
  size = "md",
  disabled = false,
  className = "",
}: {
  /** The resting label. */
  children: ReactNode;
  /** The armed label. Name what happens: "Yes, move to trash". */
  confirmLabel: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      /* The armed state is announced as well as drawn. A colour change is not
         available to a screen reader, and this is the one control where the
         reader has to know which of two things the next press does. */
      aria-live="polite"
      className={`${BUTTON_BASE} ${SIZE[size]} ${
        armed ? "c-bevel-danger bg-red-600 text-white hover:bg-red-700" : VARIANT[variant]
      } ${className}`}
    >
      {armed ? confirmLabel : children}
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

/**
 * A labelled control.
 *
 * `as` exists because of a real bug, not for flexibility. A `<label>` with no
 * `for` forwards a click on ANY of its own whitespace to the first labelable
 * descendant, and two of the console's fields wrap a composite rather than a
 * single input. On Photos and Cover image that descendant is `ImagePicker`'s
 * hidden file input, so tapping the padding around the thumbnails opened the
 * camera roll; on Body it is `RichText`'s first toolbar button, so tapping the
 * toolbar's padding toggled bold. Both are near-invisible with a mouse and
 * constant on a phone, where a short scroll gesture that starts on the field
 * registers as a tap.
 *
 * So a composite passes `as="group"` and gets a `role="group"` with an
 * `aria-labelledby`, which names the set for a screen reader without claiming a
 * click target it cannot honour.
 */
export function Field({
  label,
  hint,
  children,
  as = "label",
  spotlight,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** "group" for a field that wraps its own buttons or a hidden file input. */
  as?: "label" | "group";
  /** A tutorial anchor, rendered as `data-spotlight`. */
  spotlight?: string;
}) {
  const id = useId();
  const title = (
    <span
      id={as === "group" ? id : undefined}
      className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
    >
      {label}
    </span>
  );
  const note = hint && <span className="mt-1 block text-xs text-slate-600">{hint}</span>;

  if (as === "group") {
    return (
      <div role="group" aria-labelledby={id} data-spotlight={spotlight} className="block">
        {title}
        {children}
        {note}
      </div>
    );
  }

  return (
    <label data-spotlight={spotlight} className="block">
      {title}
      {children}
      {note}
    </label>
  );
}

/*
 * No ring utility here. `.console :focus-visible` in console.css draws one ring
 * for every focusable thing in the console, so a control cannot forget to have
 * one. The previous version paired `outline-none` with `focus:ring-2`, and the
 * global box-shadow reset ate the ring, which left admin inputs with no visible
 * focus state at all.
 *
 * No font size either, for the same reason: console.css raises every input in
 * the console to 16px on a coarse pointer, because Safari zooms the page on
 * focus of anything smaller and the console is a fixed frame with no scroll to
 * pan back from that zoom. Setting a size here would be a second opinion on a
 * question already answered in one place.
 *
 * NEVER CONCATENATE A CONFLICTING UTILITY ONTO THIS. `${inputClass} py-1` does
 * not reliably win, because Tailwind v4 sorts its own output and the later of
 * `py-1` and `py-2` in the SHEET wins rather than the later one in the string.
 * A denser field wants `inputClassCompact` below.
 */
export const inputClass =
  "w-full rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500";

/** The in-row variant: a select sitting inside a table cell or a list row. */
export const inputClassCompact =
  "w-auto rounded-lg border border-mist-200 bg-white px-2 py-1.5 text-[12px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500";

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
    /* 12px on a phone. 11px is legible in a dense table read at desk distance
       and marginal on a handheld screen in daylight, and the status chip is the
       one value on a list card that a scan is actually looking for. */
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold sm:text-[11px] ${TONES[tone]}`}
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
  bare = false,
}: {
  title: string;
  hint?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: ReactNode;
  art?: ReactNode;
  /** Drops the card, for an empty rendered INSIDE one. `DataTable` puts its
   *  empty inside the table's own white surface, so the card grade drew a
   *  second shadowed rectangle 8px inside the first. */
  bare?: boolean;
}) {
  const shell = bare ? "" : "rounded-2xl bg-white shadow-card";

  if (art) {
    return (
      /* The art goes UNDER the words on a phone, not beside them. Beside them it
         is an auto-width column against a min-content one, which squeezes the
         sentence into a two-word-per-line ribbon. */
      <div className={`grid items-center gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-10 ${shell}`}>
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
    <div className={`px-4 py-10 text-center sm:px-6 sm:py-12 ${shell}`}>
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
