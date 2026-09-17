"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  hero,
  tab,
  children,
}: {
  title: string;
  hint?: string;
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
        {art && <HeroArt>{art}</HeroArt>}
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
        {hero}
      </header>
      <main className="m-body">
        <SheetTab>{tab}</SheetTab>
        <div className="px-4">{children}</div>
      </main>
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
