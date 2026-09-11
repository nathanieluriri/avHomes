"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { AlertCircle, Check, Loader2, Monitor, SearchX, X } from "lucide-react";
import { Button } from "../ui";
import { isEditable, landFocus } from "./geometry";
import { lastInput } from "./store";

/**
 * The explanation beside the highlight, and the notices that stand in for it
 * (can't find, nothing to practise on, needs a computer, done).
 *
 * One card shape for all of them, drawn from the console's own parts: the
 * white `shadow-pop` surface its menus use, the 11px label ramp, the bevelled
 * buttons from `ui.tsx`. Below `sm` every one of them is a sheet pinned to the
 * bottom edge, or the top when the highlight is down there.
 */

export type Dock = "float" | "bottom" | "top";

const SURFACE = "rounded-2xl bg-white shadow-pop";

/** Fixed position for a sheet, lifted over the on-screen keyboard and the home indicator. */
function sheetPosition(dock: Dock): string {
  if (dock === "top") return "fixed inset-x-2 top-2 z-[91]";
  return "fixed inset-x-2 bottom-[calc(0.5rem+var(--safe-b)+var(--c-kb))] z-[91]";
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-close=""
      className="c-tap -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-550 transition-colors hover:bg-mist-100 hover:text-plum-950"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function StepCard({
  dock,
  number,
  total,
  title,
  body,
  pending,
  failed,
  onBack,
  next,
  hint,
  onSkip,
  onExit,
  cardRef,
  innerRef,
  caretRef,
}: {
  dock: Dock;
  number: number;
  total: number;
  title: string;
  body: string;
  /** Replaces the body with a working line while the page catches up. */
  pending?: string;
  /** Replaces the body when the page's own action came back without success. */
  failed?: string;
  onBack?: () => void;
  next?: { label: string; onClick: () => void; shortcut?: string };
  /** Said where Next will appear, so an empty slot is not a dead end. */
  hint?: string;
  onSkip?: () => void;
  onExit: () => void;
  cardRef: Ref<HTMLDivElement>;
  innerRef: Ref<HTMLDivElement>;
  caretRef: Ref<HTMLSpanElement>;
}) {
  const float = dock === "float";
  const footer = onBack || next || hint || onSkip;

  return (
    <div
      ref={cardRef}
      data-dock={dock}
      /* Positioned by the engine every frame, and invisible until it has been,
         so the card never paints for a frame in the corner it starts in. */
      className={float ? "fixed left-0 top-0 z-[91] w-[20rem] will-change-transform" : sheetPosition(dock)}
      style={{ visibility: "hidden" }}
    >
      <div ref={innerRef} className={`relative ${SURFACE} p-4`}>
        {float && (
          <span
            ref={caretRef}
            aria-hidden="true"
            className="absolute h-3 w-3 rotate-45 rounded-[2px] bg-white"
          />
        )}
        {/* Focusable but not a tab stop, so a step whose control is irreversible can hold focus without arming it. */}
        <section aria-label="Tutorial" tabIndex={-1} data-card-focus="" className="relative outline-none">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Step {number} of {total}
            </p>
            <CloseButton onClick={onExit} label="Exit the tutorial (Esc)" />
          </div>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-plum-950">{title}</h2>
          {pending ? (
            <p className="mt-1 flex items-start gap-2 text-[13px] leading-relaxed text-slate-600">
              <Loader2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-wine-600 motion-safe:animate-spin" aria-hidden="true" />
              {pending}
            </p>
          ) : failed ? (
            <p className="mt-1 flex items-start gap-2 text-[13px] leading-relaxed text-red-700">
              <AlertCircle className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {failed}
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
          )}
        </section>

        {footer && !pending && (
          <div className="relative mt-3.5 flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {hint && <span className="text-[12px] text-slate-550">{hint}</span>}
              {onSkip && (
                <Button variant="ghost" onClick={onSkip}>
                  Skip
                </Button>
              )}
              {next && (
                <Primary>
                  <Button onClick={next.onClick} title={next.shortcut ? `${next.label} (${next.shortcut})` : undefined}>
                    {next.label}
                  </Button>
                </Primary>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A card that is not beside anything: centred on a wide screen, a sheet on a phone.
 *
 * `autoCloseMs` closes it by itself, but never while it is hovered or holds
 * focus, and for someone on the keyboard not before they have been in it.
 * `takeFocus` moves focus onto the child marked `data-primary` unless the
 * person is typing somewhere. Either way the first Tab after it appears lands
 * there, and focus it held when it closes goes back to the page's content.
 */
export function NoticeCard({
  sheet,
  icon,
  eyebrow,
  title,
  body,
  children,
  onClose,
  closeLabel,
  animate,
  autoCloseMs,
  takeFocus,
  closing,
}: {
  sheet: boolean;
  icon: "missing" | "narrow" | "done" | "saving";
  eyebrow?: string;
  title: string;
  body: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  animate: boolean;
  autoCloseMs?: number;
  takeFocus?: boolean;
  /** The card a run ends on: low on the screen, clear of the work, rather than centred over it. */
  closing?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(() => lastInput() !== "key");
  const held = hovered || focused || !seen;
  const hadFocus = useRef(false);

  useEffect(() => {
    if (!autoCloseMs || held) return;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, held, onClose]);

  const lead = () =>
    rootRef.current?.querySelector<HTMLElement>("[data-primary] a, [data-primary] button:not(:disabled)") ??
    rootRef.current?.querySelector<HTMLElement>("a[href], button:not(:disabled)") ??
    null;

  useEffect(() => {
    if (!takeFocus) return;
    const active = document.activeElement;
    if (active && rootRef.current?.contains(active)) return;
    if (isEditable(active)) return;
    // With no primary action the card itself takes focus, so Enter cannot close it by accident.
    (rootRef.current?.querySelector<HTMLElement>("[data-primary] a, [data-primary] button:not(:disabled)") ??
      rootRef.current?.querySelector<HTMLElement>("section"))?.focus();
  }, [takeFocus]);

  /* The card sits at the end of the page, so the first Tab after it appears is sent to it. */
  useEffect(() => {
    let caught = false;
    const onKey = (event: KeyboardEvent) => {
      if (caught || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      caught = true;
      const active = document.activeElement;
      if (active && rootRef.current?.contains(active)) return;
      const target = lead();
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      target.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(
    () => () => {
      if (!hadFocus.current) return;
      // Deferred past the unmount, so whatever replaces the card can claim focus first.
      window.setTimeout(() => {
        if (document.activeElement === document.body || !document.activeElement) landFocus();
      }, 0);
    },
    [],
  );

  const Glyph = icon === "done" ? Check : icon === "narrow" ? Monitor : icon === "saving" ? Loader2 : SearchX;
  const position = sheet
    ? sheetPosition("bottom")
    : closing
      ? "fixed bottom-6 left-1/2 z-[91] w-[22rem] -translate-x-1/2"
      : "fixed left-1/2 top-1/2 z-[91] w-[22rem] -translate-x-1/2 -translate-y-1/2";
  const motion = animate
    ? sheet || closing
      ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
      : "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
    : "";

  return (
    <div
      ref={rootRef}
      className={position}
      onMouseEnter={() => {
        setHovered(true);
        setSeen(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true);
        setSeen(true);
        hadFocus.current = true;
      }}
      onBlur={(event) => {
        const inside = event.currentTarget.contains(event.relatedTarget as Node | null);
        setFocused(inside);
        // With no destination the card may be going away under focus, which still needs a place to land.
        if (event.relatedTarget) hadFocus.current = inside;
      }}
    >
      <section aria-label={title} tabIndex={-1} className={`${SURFACE} p-4 outline-none ${motion}`}>
        <div className="flex items-start gap-3">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              icon === "done" ? "bg-emerald-50 text-emerald-700" : "bg-wine-50 text-wine-600"
            }`}
          >
            <Glyph className={`h-4 w-4 ${icon === "saving" ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{eyebrow}</p>
            )}
            <h2 className="text-sm font-semibold tracking-tight text-plum-950">{title}</h2>
            <div className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</div>
          </div>
          <CloseButton onClick={onClose} label={closeLabel} />
        </div>
        {children && <div className="mt-3.5 flex items-center justify-end gap-2">{children}</div>}
      </section>
    </div>
  );
}

/** Marks the action a keyboard lands on first. Adds no box of its own. */
export function Primary({ children }: { children: ReactNode }) {
  return (
    <span data-primary="" className="contents">
      {children}
    </span>
  );
}

export function TutorialsLink({ children = "Open Tutorials" }: { children?: ReactNode }) {
  return (
    <Link href="/admin/tutorials" className="font-semibold text-wine-700 underline underline-offset-2 hover:text-wine-600">
      {children}
    </Link>
  );
}
