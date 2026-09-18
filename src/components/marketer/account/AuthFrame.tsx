"use client";

/**
 * The two doors into the marketer app: sign in, and join.
 *
 * Deliberately NOT the app's own shell. Every screen inside is a wine hero with
 * the body sheet notched into it, and that notch means "you are inside a
 * section of something". Nobody at a door is inside anything yet, so the doors
 * are one flat screen on the app's own ground, with the person's name as the
 * only thing on it carrying any weight.
 */

import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { ChevronLeft, Eye, EyeOff, Pencil } from "lucide-react";
import { useKeyboardInset } from "@/lib/admin/hooks";
import { inputCls } from "../ui";

/**
 * The door: one flat screen, and no wine.
 *
 * Every other screen in this app is a wine hero with the body sheet notched
 * into it. The door deliberately is not, and the reason is what a door is for.
 * The notch says "you are inside a section of something"; somebody signing in
 * is not inside anything yet. Dropping it also means the one thing on screen
 * with any weight is the person's own name, rather than a slab of brand colour
 * above it.
 *
 * The mark stays as a watermark rather than a banner, so the screen is still
 * recognisably AV Homes without spending the top third of a phone on saying so.
 */
export function AuthDoor({
  back,
  head,
  children,
  foot,
}: {
  /** Where the chevron goes. Omitted on a door with nothing behind it. */
  back?: string;
  head: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  useKeyboardInset();

  return (
    <div className="m-app relative flex min-h-dvh flex-col overflow-x-clip px-6">
      <Watermark />

      <div
        className="flex items-center justify-between gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="m-tap m-press-light -ml-2 grid h-10 w-10 place-items-center rounded-full text-m-text"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden />
          </Link>
        ) : (
          <span />
        )}
        <DoorMark />
      </div>

      <div className="mt-8">{head}</div>

      <div className="mt-7 flex-1">{children}</div>

      {foot && (
        <div
          className="pt-6"
          style={{ paddingBottom: "calc(1.5rem + var(--safe-b) + var(--c-kb))" }}
        >
          {foot}
        </div>
      )}
    </div>
  );
}

/** The mark alone, small, at the end of the top row. No wordmark: the name is in the copy. */
function DoorMark() {
  return (
    <Image
      src="/brand/logo-mark-reversed.png"
      alt="AV Homes"
      width={279}
      height={178}
      priority
      className="h-7 w-auto shrink-0 opacity-90"
    />
  );
}

/**
 * The mark again, enormous and nearly invisible, bleeding off the right edge.
 *
 * It is `aria-hidden` and sits behind everything: it is texture, not content,
 * and at this opacity it survives a bright screen outdoors as a shape rather
 * than as a logo competing with the form.
 */
function Watermark() {
  return (
    <Image
      src="/brand/logo-mark-reversed.png"
      alt=""
      aria-hidden
      width={279}
      height={178}
      className="pointer-events-none absolute right-[-18%] top-[24%] w-[80%] select-none opacity-[0.045]"
    />
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
    <div>
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full text-[26px] font-bold text-white ring-[3px] ring-(color:--m-link)/60"
          style={{
            background:
              "radial-gradient(circle at 34% 28%, #e06c8d 0%, #a83550 46%, #5d1b2d 100%)",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-[19px] font-normal leading-tight text-m-text">
            Welcome back
          </span>
          <span className="block truncate text-[26px] font-bold leading-tight tracking-[-0.02em] text-m-text">
            {name}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={onForget}
        className="m-tap m-press-light mt-5 inline-flex max-w-full items-center gap-3 rounded-full bg-m-raised py-3 pl-5 pr-4 text-[15px] text-m-text"
      >
        <span className="truncate">{email}</span>
        <span aria-hidden className="h-5 w-px shrink-0 bg-m-line" />
        <Pencil className="h-[18px] w-[18px] shrink-0 text-m-muted" strokeWidth={1.9} aria-hidden />
        <span className="sr-only">Not you? Use a different account</span>
      </button>
    </div>
  );
}

/** The door's own heading, when the phone has not seen anybody before. */
export function DoorTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h1 className="text-[30px] font-bold leading-[1.12] tracking-[-0.025em] text-m-text">
        {title}
      </h1>
      {hint && (
        <p className="mt-2 max-w-[21rem] text-[14.5px] leading-relaxed text-m-muted">{hint}</p>
      )}
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
