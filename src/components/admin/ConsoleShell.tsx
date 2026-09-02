"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { ExternalLink, LogOut, Menu as MenuIcon, Search, Store, X } from "lucide-react";
import { hasDomain, type AuthUser } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useSession } from "@/lib/admin/hooks";
import { NAV, homeFor, isSectionActive } from "./nav";
import { Palette } from "./Palette";
import { Spinner } from "./ui";
import "@/app/admin/console.css";

/**
 * The console shell: a blue bar over a light working panel with a rail.
 *
 * A FIXED FRAME, `inset: 0`, and that is the load-bearing decision in this
 * file. The document itself never scrolls here, so there is no second outer
 * scrollbar chasing the inner one, `.c-main` is unambiguously the scroller, and
 * the mobile drawer can anchor to the bar without a body-scroll lock. The
 * marketing site is a document and scrolls like one; a console is an
 * application frame and does not.
 *
 * Still a client component, because the whole console is driven by the same
 * cookie-authenticated API the browser talks to, and rendering the nav on the
 * server would mean a second, parallel way of asking who is signed in.
 *
 * The nav is filtered by the SAME `hasDomain` the server's permission gate
 * reads, so a link never appears for a screen whose API would 403.
 */

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const [railOpen, setRailOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const isSignIn = pathname === "/admin/sign-in";

  /*
   * Two redirects, and the second one has to compute a destination rather than
   * name one. `/admin` requires the `analytics` domain, so an editor sent there
   * lands on a screen whose own API refuses them and reads a red error box as
   * their first impression of the console. `homeFor` returns the first rail
   * entry the role can actually open.
   */
  const home = session.status === "signed-in" ? homeFor(session.user.role) : "/admin";

  useEffect(() => {
    if (session.status === "signed-out" && !isSignIn) router.replace("/admin/sign-in");
    if (session.status === "signed-in" && isSignIn) router.replace(home);
    // Covers the bookmark and the typed URL as well as the redirect: landing on
    // a section this role does not hold goes to the one it does.
    if (session.status === "signed-in" && !isSignIn && pathname === "/admin" && home !== "/admin") {
      router.replace(home);
    }
  }, [session.status, isSignIn, pathname, home, router]);

  /*
   * The drawer closes itself on any navigation. An overlay that outlives the tap
   * that used it covers the screen it just took you to.
   *
   * Adjusted DURING RENDER rather than in an effect, which is React's own answer
   * to "start over when an input changed": it re-renders immediately instead of
   * painting the open drawer over the new screen for a frame first. Same pattern
   * `useAsync` uses to reset a request.
   */
  const [railPath, setRailPath] = useState(pathname);
  if (railPath !== pathname) {
    setRailPath(pathname);
    setRailOpen(false);
  }

  /* A new screen starts at its top. The scroller is `.c-main`, not the window,
     so the browser's own restoration never sees it, and without this a phone
     user tapping through from the bottom of a long list lands mid-way down the
     next one and reads it as missing rows. */
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!railOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRailOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [railOpen]);

  /* Ctrl+K from anywhere. The palette owns its own Escape. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // `unknown` renders nothing rather than a sign-in form, so an operator who is
  // already signed in never sees a login screen flash on navigation.
  if (session.status === "unknown") {
    return (
      <div className="console grid min-h-screen place-items-center bg-haze">
        <Spinner />
      </div>
    );
  }

  if (isSignIn) return <div className="console min-h-screen bg-haze">{children}</div>;
  if (session.status !== "signed-in") return null;

  const { user } = session;

  return (
    <div className="console fixed inset-0 z-40 flex flex-col bg-chrome-900">
      <header className="c-topbar relative z-50 grid h-(--c-topbar-h) shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/12 hover:text-white lg:hidden"
          >
            {railOpen ? (
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <MenuIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>

          <Link
            href={home}
            className="hidden items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10 sm:flex"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/15 text-[11px] font-bold text-white">
              AV
            </span>
            <span className="text-sm font-bold tracking-tight text-white">
              AVHomes <span className="font-normal text-blue-100">console</span>
            </span>
          </Link>
        </div>

        {/* The search HANDLE, drawn as the field it opens. The real input lives
            in the palette, so focus lands there rather than moving twice. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
          className="flex h-9 w-full max-w-lg items-center gap-2.5 justify-self-center rounded-lg border border-white/15 bg-white/10 px-3 text-left transition-colors hover:border-white/25 hover:bg-white/15"
        >
          <Search className="h-4 w-4 shrink-0 text-blue-100" aria-hidden="true" />
          <span className="flex-1 truncate text-sm text-blue-100">Search</span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-100">
              Ctrl
            </kbd>
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-100">
              K
            </kbd>
          </span>
        </button>

        <div className="flex items-center gap-1 justify-self-end">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            title="Open the storefront in a new tab"
            className="grid h-9 w-9 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/12 hover:text-white"
          >
            <Store className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Open the storefront in a new tab</span>
          </a>
          <UserMenu user={user} />
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-t-xl bg-haze lg:grid-cols-[15rem_minmax(0,1fr)]">
        {railOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setRailOpen(false)}
            className="c-scrim fixed inset-x-0 bottom-0 top-(--c-topbar-h) z-[54] bg-navy-950/45 lg:hidden"
          />
        )}

        <nav
          data-open={railOpen}
          aria-label="Sections"
          onClick={(event) => {
            // Covers a tap on the row for the screen already open, where the
            // pathname effect never fires because nothing navigated.
            if ((event.target as HTMLElement).closest("a")) setRailOpen(false);
          }}
          className="c-rail flex flex-col gap-0.5 overflow-y-auto border-r border-mist-200 px-3 py-3"
        >
          {NAV.map((group) => {
            const visible = group.items.filter((item) => hasDomain(user.role, item.domain));
            if (visible.length === 0) return null;
            return (
              <div key={group.label ?? "root"} className="contents">
                {group.label && (
                  <p className="mt-4 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-550">
                    {group.label}
                  </p>
                )}
                {visible.map((item) => {
                  const active = isSectionActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-9 items-center gap-3 rounded-lg px-2 text-sm transition-colors ${
                        active
                          ? "bg-white font-semibold text-navy-950 shadow-card"
                          : "font-medium text-slate-600 hover:bg-mist-200/60 hover:text-navy-950"
                      }`}
                    >
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          active ? "text-blue-600" : "text-slate-550"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}

          <div className="mt-auto pt-6">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-mist-200/60 hover:text-navy-950"
            >
              <ExternalLink className="h-[18px] w-[18px] shrink-0 text-slate-550" aria-hidden="true" />
              <span className="truncate">View storefront</span>
            </a>
          </div>
        </nav>

        <main ref={mainRef} className="c-main min-w-0 overflow-y-auto">
          {/* Keyed on the pathname so React remounts it per navigation and the
              rise replays without any JavaScript timing. */}
          <div key={pathname} className="c-sheet mx-auto w-full max-w-[66rem] px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} user={user} />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "AV";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

function UserMenu({ user }: { user: AuthUser }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-white/12 sm:pr-2.5"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500/25 text-[11px] font-bold text-white">
            {initials(user.displayName)}
          </span>
          <span className="hidden max-w-[9rem] truncate text-sm font-medium text-white sm:block">
            {user.displayName}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          className="console-float z-[72] w-60 overflow-hidden rounded-xl border border-mist-200 bg-white p-1.5 shadow-pop"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-navy-950">{user.displayName}</p>
            <p className="truncate text-xs text-slate-600">{user.email}</p>
            <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {user.role}
            </span>
          </div>

          <DropdownMenu.Separator className="my-1.5 h-px bg-mist-200" />

          <DropdownMenu.Item
            onSelect={() => {
              // Logout never fails: an expired session and a live one both end
              // with the cookie gone, so the redirect is unconditional.
              void api.post("/auth/logout").finally(() => {
                // A FULL navigation, not router.push. The session cookie just
                // changed and the shell stays mounted across a client-side route
                // change, so its useSession effect would never re-run and the
                // console would render the old identity.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/admin/sign-in";
              });
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-navy-950 outline-none data-[highlighted]:bg-mist-100"
          >
            <LogOut className="h-4 w-4 text-slate-550" aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
