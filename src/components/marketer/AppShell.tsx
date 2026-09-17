"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Bell, ChevronLeft, Settings } from "lucide-react";
import type { AuthUser } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useKeyboardInset } from "@/lib/admin/hooks";
import type { MeResponse } from "@/lib/marketer/api";
import { NavBar, type NavKey } from "./NavBar";
import { PaperContext, usePaper } from "./paper";
import { Skeleton } from "./ui";

/**
 * The app frame: the wine hero with the logo, the body sheet with its tab, the
 * bottom bar, the session gate, and the one read every screen shares.
 *
 * The gate is client side and deliberately not middleware. The API is the only
 * thing that knows whether a cookie is still good, and a middleware guess would
 * either let a dead session draw a whole screen or bounce a live one on a cold
 * edge cache. `GET /auth/me` answers the question once, here.
 *
 * `/marketing/me` is fired ALONGSIDE the gate rather than after it, so a phone
 * on Lagos mobile data does not pay for two round trips in a row.
 */

/**
 * The brand, drawn the way the console draws it: the mark plus one quiet word.
 * The full horizontal lockup is pink type, which does not survive the wine.
 */
export function Lockup({ size = "bar" }: { size?: "bar" | "tall" }) {
  return (
    <span className="flex items-center gap-2">
      {/* The soft shadow lifts the pink and grey mark off the wine without recolouring it. */}
      <Image
        src="/brand/logo-mark-reversed.png"
        alt="AVHomes"
        width={279}
        height={178}
        priority
        className={`w-auto shrink-0 [filter:drop-shadow(0_1px_5px_rgb(38_6_16/0.5))] ${
          size === "tall" ? "h-9" : "h-7"
        }`}
      />
      <span
        className={`font-medium tracking-tight text-wine-100 ${
          size === "tall" ? "text-[15px]" : "text-[13px]"
        }`}
      >
        marketers
      </span>
    </span>
  );
}

export interface MarketerState {
  me: MeResponse | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

const MarketerCtx = createContext<MarketerState | null>(null);

/** The shared `/marketing/me` read. Only valid inside `AppShell`. */
export function useMarketer(): MarketerState {
  const value = useContext(MarketerCtx);
  if (!value) throw new Error("useMarketer must be used inside AppShell");
  return value;
}

/**
 * Why this marketer cannot report a deal, in one line, or null when they can.
 * Null while `me` loads too, so an active account never sees a flash of "off".
 */
export function reportBlockedReason(me: MeResponse | null): string | null {
  if (!me || me.marketer.status === "active") return null;
  return me.marketer.status === "paused"
    ? "Your account is paused, so you cannot report a deal for now."
    : "Your account is closed, so you cannot report a deal.";
}

/** `reportBlockedReason` for the screen's own marketer. Only valid inside `AppShell`. */
export function useReportBlock(): string | null {
  return reportBlockedReason(useMarketer().me);
}

/**
 * A round translucent control on the hero: back, the bell, the gear, or a
 * screen's own action. A link when given `href`, a button when given `onClick`.
 */
export function HeroIconButton({
  label,
  href,
  onClick,
  children,
  className = "",
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const cls = `m-glass m-press m-tap grid h-10 w-10 shrink-0 place-items-center rounded-full ${className}`;
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {children}
    </button>
  );
}

/**
 * The first section label on a tab that rises into the hero: rounded top left,
 * a smooth sloped shoulder on the right. `AppShell tab` draws it; it is exported
 * for a screen that composes its own body.
 */
export function SheetTab({ children }: { children: ReactNode }) {
  return (
    <div className="m-tab">
      <h2 className="m-tab__label">{children}</h2>
      <svg
        className="m-tab__shoulder"
        viewBox="0 0 77 48"
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
      >
        <path d="M0 0C33 0 42 48 77 48V49H0Z" />
      </svg>
    </div>
  );
}

function BellLink({ count }: { count: number }) {
  return (
    <HeroIconButton
      href="/m/alerts"
      label={count > 0 ? `Alerts, ${count} to do` : "Alerts"}
      className="relative"
    >
      <Bell className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      {count > 0 && (
        <span aria-hidden className="m-badge">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </HeroIconButton>
  );
}

function BackControl({ back, onBack }: { back?: string; onBack?: () => void }) {
  const icon = <ChevronLeft className="h-6 w-6" strokeWidth={2} aria-hidden />;
  if (onBack) {
    return (
      <HeroIconButton label="Back" onClick={onBack}>
        {icon}
      </HeroIconButton>
    );
  }
  if (back) {
    return (
      <HeroIconButton label="Back" href={back}>
        {icon}
      </HeroIconButton>
    );
  }
  return null;
}

/**
 * The status bar strip. Home, sign in and join have no pinned bar, so once they
 * scroll their content would run under the clock and the Dynamic Island. It
 * covers exactly `env(safe-area-inset-top)`, is zero high where there is no
 * inset, and only shows once the page has moved, so it never sits on a hero at
 * rest.
 */
export function SafeTop() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div aria-hidden className="m-safetop" data-show={scrolled} />;
}

/** True once `target` has scrolled up under the top of the screen. */
function useScrolledPast(target: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = target.current;
    if (!enabled || !node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, enabled]);
  return past;
}

export function AppShell({
  variant = "page",
  title,
  hint,
  back,
  onBack,
  action,
  hero,
  tab,
  nav = "menu",
  paper = false,
  bottomBar,
  alertCount,
  children,
}: {
  /** `home` is the tall hero with the bell and the gear; `page` is an inner screen. */
  variant?: "home" | "page";
  /** An inner screen's name, set large inside the hero. */
  title?: string;
  /** One line under the title. */
  hint?: string;
  back?: string;
  /** For a multi step form, where back means the previous step, not the previous page. */
  onBack?: () => void;
  /** A control at the right of the logo row on an inner screen. */
  action?: ReactNode;
  /** The hero's own content: the home figure, or anything under an inner title. */
  hero?: ReactNode;
  /** The label on the tab that lifts the body into the hero. Without it the sheet is plain. */
  tab?: ReactNode;
  /** Which bar item is lit. Null hides the bar, for a focused flow with its own controls. */
  nav?: NavKey | null;
  /** The light palette, for a screen still drawn in it. */
  paper?: boolean;
  /**
   * A form's pinned controls. It hangs off the shell rather than off the page
   * because `.m-body` clips overflow on the x axis, and a `position: fixed`
   * child of a clipping box is clipped with it in Chromium.
   */
  bottomBar?: ReactNode;
  /**
   * The count of alerts to act on, from a screen that already holds the list.
   * The bell and the Menu then show the same number as that list, even while
   * `/marketing/me` is still on its way.
   */
  alertCount?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  useKeyboardInset();

  const gate = useAsync((signal) => api.get<{ user: AuthUser }>("/auth/me", signal), []);
  const me = useAsync((signal) => api.get<MeResponse>("/marketing/me", signal), []);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const compact = useScrolledPast(titleRef, variant === "page" && Boolean(title));

  const dead = gate.error?.status === 401 || me.error?.status === 401;

  useEffect(() => {
    if (dead) router.replace("/m/sign-in");
  }, [dead, router]);

  if (dead) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <p className="text-[14px] text-m-muted">Taking you to sign in.</p>
      </div>
    );
  }

  const state: MarketerState = {
    me: me.data,
    loading: me.loading,
    error: me.error,
    reload: me.reload,
  };

  const hasTab = tab !== undefined && tab !== null && tab !== false;
  const shell = `m-shell ${hasTab ? "m-shell--tab" : ""} ${nav ? "m-shell--nav" : ""}`;
  const home = variant === "home";
  const toDo = alertCount ?? me.data?.alertCount ?? 0;

  return (
    <MarketerCtx.Provider value={state}>
      <PaperContext.Provider value={paper}>
        <div className={shell}>
          <SafeTop />
          <header className={`m-hero ${home ? "m-hero--home" : ""}`}>
            {/* The logo holds the top of every screen. A marketer showing this
                app to somebody they are inviting is showing them AV Homes. */}
            <div className="flex min-h-11 items-center gap-2">
              {!home && <BackControl back={back} onBack={onBack} />}
              {home ? (
                <span className="flex min-w-0 flex-1 items-center">
                  <Lockup />
                </span>
              ) : (
                <Link
                  href="/m"
                  aria-label="AV Homes marketers home"
                  className="m-tap flex min-w-0 flex-1 items-center transition-opacity active:opacity-70"
                >
                  <Lockup />
                </Link>
              )}
              {home ? (
                <>
                  <BellLink count={toDo} />
                  <HeroIconButton href="/m/profile" label="Account">
                    <Settings className="h-5 w-5" strokeWidth={1.9} aria-hidden />
                  </HeroIconButton>
                </>
              ) : (
                action
              )}
            </div>

            {!home && title && (
              <>
                <h1 ref={titleRef} className="m-hero__title">
                  {title}
                </h1>
                {hint && (
                  <p className="mt-1.5 max-w-[24rem] text-[14px] leading-relaxed text-white/75">
                    {hint}
                  </p>
                )}
              </>
            )}
            {hero}
          </header>

          {!home && title && (
            <div className="m-pagebar" data-show={compact} aria-hidden={!compact} inert={!compact}>
              <div className="flex min-h-11 items-center gap-2.5">
                <BackControl back={back} onBack={onBack} />
                {/* The logo stays when the hero has scrolled away with it. */}
                <span className="shrink-0">
                  <Lockup />
                </span>
                <span aria-hidden className="h-5 w-px shrink-0 bg-white/25" />
                <p className="min-w-0 flex-1 truncate text-[16px] font-bold tracking-[-0.01em]">
                  {title}
                </p>
                {action}
              </div>
            </div>
          )}

          <main className={`m-body ${paper ? "m-paper" : ""}`}>
            {hasTab && <SheetTab>{tab}</SheetTab>}
            {children}
          </main>

          {bottomBar}

          {nav && (
            <NavBar
              active={nav}
              alertCount={toDo}
              reportBlock={reportBlockedReason(me.data)}
              supportPhone={me.data?.supportPhone ?? ""}
            />
          )}
        </div>
      </PaperContext.Provider>
    </MarketerCtx.Provider>
  );
}

/**
 * The bar pinned over the bottom of a form.
 *
 * It carries both insets: the home indicator, which swallows a tap aimed at a
 * button drawn inside it, and the keyboard, which iOS draws straight over a
 * `fixed bottom-0` element without moving it.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  const paper = usePaper();
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-m-line bg-m-card/95 px-4 pt-3 backdrop-blur ${
        paper ? "m-paper" : ""
      }`}
      style={{ paddingBottom: "calc(0.75rem + var(--safe-b) + var(--c-kb))" }}
    >
      {children}
    </div>
  );
}

/**
 * Sign in and join: the same hero, no bar, no gate. The lockup is the reversed
 * one; the standard artwork's charcoal V all but disappears on wine.
 */
export function AuthShell({
  children,
  title,
  hint,
}: {
  children: ReactNode;
  title: string;
  hint?: string;
}) {
  useKeyboardInset();

  return (
    <PaperContext.Provider value>
      <div className="m-shell">
        <header className="m-hero m-hero--auth">
          <Lockup size="tall" />
          <h1 className="mt-7 text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          {hint && (
            <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-white/75">{hint}</p>
          )}
        </header>
        <main className="m-body m-paper px-4 pt-6">{children}</main>
      </div>
    </PaperContext.Provider>
  );
}

/** The circle of initials that stands in for a photo nobody uploaded. */
export function Avatar({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`m-glass grid shrink-0 place-items-center rounded-full text-[15px] font-bold tracking-wide ${className}`}
    >
      {text}
    </span>
  );
}

/** A placeholder row for a list whose shape is already known. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-11 w-11" radius="12px" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}
