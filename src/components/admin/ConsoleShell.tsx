"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  AlertTriangle,
  ExternalLink,
  LogOut,
  Menu as MenuIcon,
  Search,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { hasDomain, type AuthUser } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useIsNarrow, useKeyboardInset, useSession } from "@/lib/admin/hooks";
import { initials } from "@/lib/admin/format";
import { NAV, canSeeNavItem, homeFor, isSectionActive } from "./nav";
import { Palette } from "./Palette";
import { ResponsiveMenu } from "./BottomSheet";
import { ButtonLink, Spinner } from "./ui";
import { SpotlightHost } from "./spotlight/Spotlight";
import "@/app/admin/console.css";

/**
 * The console shell: a wine bar over a light working panel with a rail.
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
  const railRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /* The console's ONE subscription to the on-screen keyboard. It publishes
     `--c-kb` on the document root, and every bottom-pinned surface under this
     shell (the save bar, a sheet footer, the chat composer) reads the variable
     rather than each one measuring `visualViewport` for itself. */
  useKeyboardInset();

  /* Below lg the rail is a modal drawer; at lg and up it is the grid's first
     column and `railOpen` is meaningless. The trap, the focus restore and
     `aria-modal` below are gated on this so a desktop rail is never announced
     as a dialog. Layout is not gated on it: that is CSS, in console.css. */
  const isNarrow = useIsNarrow();
  const drawerOpen = railOpen && isNarrow;

  const isSignIn = pathname === "/admin/sign-in";

  /*
   * The studios take the whole window.
   *
   * Two screens qualify, for the same reason. The writing studio is a DOCUMENT
   * rather than a record in a frame; the customize studio is the whole site in a
   * frame. The console chrome was actively costing both: the rail ate 15rem, the
   * sheet capped them at 66rem and padded them again inside that, so a full-page
   * editor was drawn as a card in a column and the site was drawn as a postcard.
   * Nothing in the chrome serves a writer mid-paragraph or a reviewer mid-page
   * either. So the shell steps out of the way entirely and each studio's own bar
   * carries the way back, the same deal `/admin/sign-in` already gets below.
   */
  const isStudio =
    /^\/admin\/posts\/[^/]+\/advanced\/?$/.test(pathname) || pathname === "/admin/customize";

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

  /*
   * The drawer's focus contract, hand-rolled rather than borrowed from a Dialog.
   *
   * Radix Dialog would hand over the trap, the focus restore, `aria-modal` and
   * Escape in one place. It would also PORTAL the panel to the body, and above
   * lg this exact element is the grid's first column, so a Dialog rebuild means
   * two different trees behind a width branch. That branch hydrates NARROW
   * (`useMediaQuery`'s server snapshot is false), so a desktop would mount the
   * drawer for a frame and swap it for the rail, and the close-on-navigate above
   * would have to move out of render and into whatever the Dialog's open state
   * was. One element in two CSS modes stays the cheaper truth. The four
   * behaviours are wired by hand here and in the `onKeyDown` below.
   *
   * DECLARED BEFORE the navigation effect on purpose. Both fire on the same
   * commit when a drawer row navigates, and the later one wins the focus: the
   * hamburger is the right answer when Escape or the scrim closed the drawer,
   * and the new screen is the right answer when a link did.
   */
  const wasDrawerOpen = useRef(false);
  useEffect(() => {
    if (drawerOpen) {
      wasDrawerOpen.current = true;
      railRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    } else if (wasDrawerOpen.current) {
      wasDrawerOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  /* A new screen starts at its top. The scroller is `.c-main`, not the window,
     so the browser's own restoration never sees it, and without this a phone
     user tapping through from the bottom of a long list lands mid-way down the
     next one and reads it as missing rows. */
  const firstRender = useRef(true);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    /*
     * And focus goes with it. Activating a row dropped focus back to <body>, so
     * a keyboard operator restarted at the top of the topbar on every
     * navigation: twelve tabs to reach the breadcrumb that takes them back.
     * Skipped on the first render, because stealing focus from a fresh page
     * load is its own bug.
     */
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRailOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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

  /* Tab cycles inside the open drawer instead of walking into the content the
     scrim is covering. Only the wrap-around needs handling: the browser does
     the rest of the order by itself. */
  function trapTab(event: ReactKeyboardEvent<HTMLElement>) {
    if (!drawerOpen || event.key !== "Tab") return;
    const stops = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    );
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // `unknown` renders nothing rather than a sign-in form, so an operator who is
  // already signed in never sees a login screen flash on navigation.
  if (session.status === "unknown") {
    return (
      <div className="console grid min-h-[100dvh] place-items-center bg-haze">
        <Spinner />
      </div>
    );
  }

  if (isSignIn) return <div className="console min-h-[100dvh] bg-haze">{children}</div>;
  if (session.status !== "signed-in") return null;

  /* AFTER the auth gate, unlike sign-in: the studio is a signed-in screen and
     has to stay behind the same redirect every other one is behind. The
     document scrolls here rather than an inner pane, so the studio's sticky bar
     and its slide-over panels anchor to the viewport with nothing in between. */
  /* The spotlight sits beside the frame at the same position in both branches
     below, so a walkthrough that crosses into a studio keeps running rather
     than remounting. */
  if (isStudio) {
    return (
      <>
        <div className="console min-h-[100dvh] bg-mist-50">{children}</div>
        <SpotlightHost />
      </>
    );
  }

  const { user } = session;

  const frame = (
    <div className="console fixed inset-0 z-40 flex flex-col bg-chrome-900">
      {/* First tab stop in the console. The rail is up to eight links before
          the content starts, and this is a tool somebody uses all day. */}
      <a
        href="#c-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-plum-950 focus:not-sr-only focus:absolute focus:left-3 focus:top-2.5 focus:z-[60]"
      >
        Skip to content
      </a>

      <header className="c-topbar relative z-50 grid h-(--c-topbar-h) shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 sm:gap-3 sm:px-4">
        {/* The real mark, not an "AV" square. This bar is the one place the
            product names itself, and a two letter chip is a placeholder for a
            brand rather than the brand. The reversed lockup, because the
            standard one's charcoal V all but disappears on this ground.

            The mark stays at every width and the word drops, rather than the
            whole thing vanishing below sm. A phone had no product name in the
            chrome at all and no route home outside the drawer. It has the left
            edge to itself now that the hamburger has moved right. */}
        <Link
          href={home}
          aria-label="AVHomes console home"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
        >
          <Image
            src="/brand/logo-mark-reversed.png"
            alt="AVHomes"
            width={279}
            height={178}
            priority
            className="h-7 w-auto shrink-0"
          />
          <span className="hidden text-sm font-medium tracking-tight text-wine-100 sm:block">
            console
          </span>
        </Link>

        {/* The search HANDLE, drawn as the field it opens. The real input lives
            in the palette, so focus lands there rather than moving twice. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
          className="flex h-11 w-full max-w-lg items-center gap-2.5 justify-self-center rounded-lg border border-white/15 bg-white/10 px-3 text-left transition-colors hover:border-white/25 hover:bg-white/15 sm:h-9"
        >
          <Search className="h-4 w-4 shrink-0 text-wine-100" aria-hidden="true" />
          <span className="flex-1 truncate text-sm text-wine-100">Search</span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-wine-100">
              Ctrl
            </kbd>
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-wine-100">
              K
            </kbd>
          </span>
        </button>

        {/* EVERYTHING TOUCHABLE IS IN THIS ONE CLUSTER, and on a phone that is
            the whole reachability story. The top-left corner is the furthest
            point on a phone from the hand holding it, and the hamburger is the
            control every section change goes through below lg, so it sits here
            beside the avatar rather than across the bar. It buys what a bottom
            tab bar would have bought and costs no vertical space, which a 56px
            bar under a 52px topbar and sometimes a save bar could not afford.

            `gap-2` below sm because these are 44px boxes and 4px between two of
            them is a shared edge. Back to `gap-1` from sm up, where they are
            36px and driven by a mouse.

            None of the three is an `IconButton`. That primitive's variants are
            the working panel's white bevelled chips and these are transparent
            glyphs on the chrome gradient, and its `c-bevel` is a plain class no
            utility can reliably beat. The SIZE CONTRACT is copied exactly
            instead, 44px on a phone and 36px from sm up, so they answer a thumb
            the way every other icon-only control in the console does. */}
        <div className="flex items-center gap-2 justify-self-end sm:gap-1">
          {/* Hidden below sm, and it costs a phone nothing: the drawer's last
              row is the same link with a label on it. The ~44px this gives back
              is what lets a 360px bar carry the rest at full size. */}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            title="Open the storefront in a new tab"
            className="hidden h-9 w-9 place-items-center rounded-lg text-wine-100 transition-colors hover:bg-white/12 hover:text-white sm:grid"
          >
            <Store className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Open the storefront in a new tab</span>
          </a>

          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center rounded-lg text-wine-100 transition-colors hover:bg-white/12 hover:text-white sm:h-9 sm:w-9 lg:hidden"
          >
            {railOpen ? (
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <MenuIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>

          <UserMenu user={user} />
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-t-xl bg-haze lg:grid-cols-[15rem_minmax(0,1fr)]">
        {railOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setRailOpen(false)}
            className="c-scrim fixed inset-x-0 bottom-0 top-(--c-topbar-h) z-[54] bg-plum-950/45 lg:hidden"
          />
        )}

        <nav
          ref={railRef}
          data-open={railOpen}
          aria-label="Sections"
          /* Modal only while it is a drawer. Above lg this is a landmark in the
             page, not a thing covering it, and claiming otherwise would tell a
             screen reader the rest of the console is unavailable. */
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen || undefined}
          onKeyDown={trapTab}
          onClick={(event) => {
            // Covers a tap on the row for the screen already open, where the
            // pathname effect never fires because nothing navigated.
            if ((event.target as HTMLElement).closest("a")) setRailOpen(false);
          }}
          className="c-rail flex flex-col gap-1 overflow-y-auto border-r border-mist-200 px-3 py-3 lg:gap-0.5"
        >
          {NAV.map((group) => {
            const visible = group.items.filter((item) => canSeeNavItem(user.role, item));
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
                    /* 44px below lg. Below that breakpoint this drawer is the
                       ONLY route between sections, so these are the most
                       tapped controls in the phone build, and a mis-tap here
                       navigates away from unsaved work. The rail keeps its
                       36px density where a mouse is doing the pointing. */
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-11 items-center gap-3 rounded-lg px-2 text-sm transition-colors lg:h-9 ${
                        active
                          ? "bg-white font-semibold text-plum-950 shadow-card"
                          : "font-medium text-slate-600 hover:bg-mist-200/60 hover:text-plum-950"
                      }`}
                    >
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          active ? "text-wine-600" : "text-slate-550"
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
              className="flex h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-mist-200/60 hover:text-plum-950 lg:h-9"
            >
              <ExternalLink className="h-[18px] w-[18px] shrink-0 text-slate-550" aria-hidden="true" />
              <span className="truncate">View storefront</span>
            </a>
          </div>
        </nav>

        <main
          ref={mainRef}
          id="c-content"
          /* Programmatically focusable for the effect above, but not a tab stop
             of its own, which -1 is exactly for. */
          tabIndex={-1}
          className="c-main min-w-0 overflow-y-auto outline-none"
        >
          {/* Keyed on the pathname so React remounts it per navigation and the
              rise replays without any JavaScript timing. */}
          <div key={pathname} className="c-sheet mx-auto w-full max-w-[66rem] px-4 py-6 sm:px-6 sm:py-8">
            <AvatarNag user={user} pathname={pathname} />
            {children}
          </div>
        </main>
      </div>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} user={user} />
    </div>
  );

  return (
    <>
      {frame}
      <SpotlightHost />
    </>
  );
}

/**
 * The missing-photo warning.
 *
 * Not decoration and not a growth nudge. Since "Contact agent" became a live
 * conversation, a reply from an account with no photo reaches a buyer as a grey
 * circle with a letter in it, which reads as an autoresponder at the exact
 * moment the site is trying to prove a person is there. That is a real cost to
 * the business, so it is stated rather than left to be noticed.
 *
 * NOT DISMISSIBLE, and that is deliberate: a dismiss button turns a two minute
 * fix into a thing somebody clears every morning forever. It is instead SHOWN
 * ONLY TO ROLES WHO ACTUALLY ANSWER BUYERS, and it takes itself down the moment
 * a photo exists. An editor writing blog posts is never met by a buyer and is
 * not nagged about a headshot they have no use for.
 *
 * It also hides itself ON the profile screen. A banner telling you to go
 * somewhere you are already standing is noise.
 */
function AvatarNag({ user, pathname }: { user: AuthUser; pathname: string }) {
  const facesBuyers = hasDomain(user.role, "enquiries") || hasDomain(user.role, "listings");
  if (!facesBuyers) return null;
  if (user.avatarUrl !== "") return null;
  if (pathname === "/admin/profile") return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] text-amber-900">
        <span className="font-semibold">Add a profile photo.</span> Buyers see your
        face when you answer an enquiry. Without one your replies arrive from a
        blank circle.
      </p>
      {/* Full width below sm, and that is the honest shape rather than a
          concession. At 360px the paragraph already pushes this onto a line of
          its own, so it was reading as a primary action while being the
          smallest target on the page. `ButtonLink` carries the 44px. */}
      <ButtonLink
        href="/admin/profile"
        variant="ghost"
        className="w-full sm:w-auto"
      >
        Add one
      </ButtonLink>
    </div>
  );
}

/**
 * The account menu: a dropdown with a mouse, a bottom sheet with a thumb.
 *
 * The dropdown is unchanged, and on a phone it was the wrong shape in the worst
 * place: a 240px panel anchored to the top-right corner, which is the single
 * hardest point on a large phone for a thumb, holding two 36px rows one of
 * which signs you out. `ResponsiveMenu` draws the same items twice and shows
 * one by media query, so neither version is a compromise for the other.
 *
 * Every sheet row is wrapped in `Dialog.Close`. A dropdown item dismisses its
 * menu by itself; a sheet row is an ordinary control, and a Link inside a sheet
 * navigates while leaving the sheet sitting over the screen it just opened.
 */
function UserMenu({ user }: { user: AuthUser }) {
  function signOut() {
    // Logout never fails: an expired session and a live one both end with the
    // cookie gone, so the redirect is unconditional.
    void api.post("/auth/logout").finally(() => {
      // A FULL navigation, not router.push. The session cookie just changed and
      // the shell stays mounted across a client-side route change, so its
      // useSession effect would never re-run and the console would render the
      // old identity.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/admin/sign-in";
    });
  }

  const trigger = (
    <button
      type="button"
      className="flex h-11 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-white/12 sm:h-9 sm:pr-2.5"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-wine-500/25 text-[11px] font-bold text-white">
        {initials(user.displayName, "AV")}
      </span>
      <span className="hidden max-w-[9rem] truncate text-sm font-medium text-white sm:block">
        {user.displayName}
      </span>
    </button>
  );

  return (
    <ResponsiveMenu
      trigger={trigger}
      title="Account"
      items={(kind) => (
        <>
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-plum-950">{user.displayName}</p>
            <p className="truncate text-xs text-slate-600">{user.email}</p>
            <span className="mt-2 inline-flex rounded-full bg-wine-50 px-2 py-0.5 text-[11px] font-semibold text-wine-700">
              {user.role}
            </span>
          </div>

          {kind === "menu" ? (
            <DropdownMenu.Separator className="my-1.5 h-px bg-mist-200" />
          ) : (
            <div className="my-1.5 h-px bg-mist-200" aria-hidden="true" />
          )}

          {/* Not a rail row. Every role has a profile, so gating it by a domain
              would be a lie, and an ungated row in a rail whose whole contract
              is "these are your permissions" is worse. The account menu is where
              a reader already looks for their own things. */}
          {kind === "menu" ? (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  href="/admin/profile"
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-plum-950 outline-none data-[highlighted]:bg-mist-100"
                >
                  <UserRound className="h-4 w-4 text-slate-550" aria-hidden="true" />
                  Your profile
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={signOut}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-plum-950 outline-none data-[highlighted]:bg-mist-100"
              >
                <LogOut className="h-4 w-4 text-slate-550" aria-hidden="true" />
                Sign out
              </DropdownMenu.Item>
            </>
          ) : (
            <>
              <Dialog.Close asChild>
                <Link
                  href="/admin/profile"
                  className="flex h-12 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-plum-950 active:bg-mist-100"
                >
                  <UserRound className="h-4 w-4 text-slate-550" aria-hidden="true" />
                  Your profile
                </Link>
              </Dialog.Close>

              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex h-12 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-plum-950 active:bg-mist-100"
                >
                  <LogOut className="h-4 w-4 text-slate-550" aria-hidden="true" />
                  Sign out
                </button>
              </Dialog.Close>
            </>
          )}
        </>
      )}
    />
  );
}
