"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { useKeyboardInset } from "@/lib/admin/hooks";
import { Lockup, SafeTop, SheetTab } from "../AppShell";
import { HeroArt } from "../team/bits";
import { inputCls } from "../ui";

/**
 * Sign in and join in Night plum: the wine hero with the logo, then the dark
 * body sheet on its tab. No bottom bar and no session gate.
 *
 * Its own frame because the shared `AuthShell` still draws the light palette.
 * The hero pads like every inner screen's, so the logo, the title and the tab
 * label share one left edge.
 */
export function AuthFrame({
  title,
  hint,
  art,
  head,
  hero,
  tab,
  children,
}: {
  title: string;
  hint?: string;
  /** Replaces the title and hint entirely. The passport block uses it. */
  head?: ReactNode;
  /** A 3D object level with the title. The hint wraps short of it. */
  art?: ReactNode;
  /** Anything under the title inside the wine. */
  hero?: ReactNode;
  /** The label on the tab that lifts the body into the hero. */
  tab: ReactNode;
  children: ReactNode;
}) {
  useKeyboardInset();

  return (
    <div className="m-shell m-shell--tab">
      <SafeTop />
      <header className="m-hero m-hero--auth px-4">
        <Lockup size="tall" />
        {art && !head && <HeroArt>{art}</HeroArt>}
        {head ?? (
          <>
            <h1
              className={`mt-7 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] ${art ? "pr-[5.5rem]" : ""}`}
            >
              {title}
            </h1>
            {hint && (
              <p
                className={`mt-2 max-w-[22rem] text-[14px] leading-relaxed text-white/75 ${art ? "pr-[5.5rem]" : ""}`}
              >
                {hint}
              </p>
            )}
          </>
        )}
        {hero}
      </header>
      <main className="m-body">
        <SheetTab>{tab}</SheetTab>
        <div className="px-4">{children}</div>
      </main>
    </div>
  );
}

/**
 * A returning marketer's own name, in place of a title.
 *
 * The identity IS the heading here. A screen that already knows who you are and
 * still opens with a generic "Welcome back" over a blank email field is asking
 * you to prove something it has in front of it, and the ALAT-style avatar bolted
 * beside a title would be a second heading competing with the first.
 *
 * So the disc, the name and the address are one block on the hero's own left
 * gutter, and the sheet below is reduced to a single field. The pencil is the
 * way out: it forgets this phone's memory and gives back the full form, which a
 * marketer handing their phone to a colleague needs to be obvious.
 */
export function Passport({
  name,
  email,
  onForget,
}: {
  name: string;
  email: string;
  onForget: () => void;
}) {
  return (
    <div className="mt-7">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center rounded-full bg-white/12 text-[22px] font-bold text-white ring-2 ring-white/35"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-white/70">Welcome back</span>
          <span className="block truncate text-[27px] font-bold leading-[1.15] tracking-[-0.025em] text-white">
            {name}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={onForget}
        className="m-tap m-glass m-press mt-4 inline-flex max-w-full items-center gap-2 rounded-full py-2 pl-4 pr-3 text-[14px]"
      >
        <span className="truncate">{email}</span>
        <span aria-hidden className="h-4 w-px shrink-0 bg-white/30" />
        <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <span className="sr-only">Not you? Use a different account</span>
      </button>
    </div>
  );
}

/** The quiet line under a form that sends you to the other door. */
export function OtherDoor({ question, href, action }: { question: string; href: string; action: string }) {
  return (
    <p className="mt-6 text-center text-[14px] text-m-muted">
      {question}{" "}
      <Link href={href} className="m-tap m-link">
        {action}
      </Link>
    </p>
  );
}

/** A password with a show and hide eye. The caller's Field must be `as="group"`. */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  bad = false,
  label = "Password",
}: {
  value: string;
  onChange: (next: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  bad?: boolean;
  label?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={label}
        className={`${inputCls} pr-14 ${bad ? "m-bad" : ""}`}
      />
      <button
        type="button"
        onClick={() => setShown((was) => !was)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="m-tap m-tap-abs right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[12px] text-m-muted active:bg-m-raised"
      >
        {shown ? (
          <EyeOff className="h-[18px] w-[18px]" aria-hidden />
        ) : (
          <Eye className="h-[18px] w-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
}
