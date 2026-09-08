"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { socialLinks } from "./SocialIcons";

const links = [
  { href: "/", label: "Home" },
  { href: "/listings?status=For+Sale", label: "Buy" },
  { href: "/listings?status=For+Rent", label: "Rent" },
  { href: "/posts", label: "Insights" },
  { href: "/#about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

const EXIT_MS = 420;
const FOCUSABLE = "a[href], button:not([disabled])";

export default function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<number | undefined>(undefined);

  const openMenu = useCallback(() => {
    window.clearTimeout(exitTimer.current);
    setMounted(true);
    // One frame later so the entry transition has a starting state to move from.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);

  const closeMenu = useCallback(() => {
    setShown(false);
    exitTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  // Lock scroll, keep Tab inside the sheet, and hand focus back to the trigger.
  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = triggerRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        return;
      }
      if (e.key !== "Tab") return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mounted, closeMenu]);

  return (
    <>
      {/* Sits above the menu sheet at all times so the close button stays
          reachable. The background never changes. */}
      <header className="sticky top-0 z-[80] w-full border-b border-mist-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          {/* The horizontal lockup, not the stacked one. Stacked, the tagline is
              a tenth of the file's height, so a navbar had to run ~96px tall to
              keep that line readable. Set beside the mark instead, the same
              artwork gives a larger wordmark in a shorter bar. */}
          <Link href="/" className="flex items-center" aria-label="AVHomes, home">
            <Image
              src="/brand/logo-h.png"
              alt="AVHomes Ltd"
              width={830}
              height={178}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-slate-500 transition-colors hover:text-plum-950"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/listings"
              className="hidden rounded-full bg-wine-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 lg:inline-flex"
            >
              Find Property
            </Link>

            <button
              ref={triggerRef}
              type="button"
              onClick={() => (mounted ? closeMenu() : openMenu())}
              aria-label={mounted ? "Close menu" : "Open menu"}
              aria-expanded={mounted}
              aria-controls="mobile-menu"
              className="relative grid h-11 w-11 place-items-center rounded-full border border-mist-200 bg-white lg:hidden"
            >
              {/* Every bar is the same 2px stroke, so the hamburger and the X match. */}
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 block h-[2px] w-5 rounded-full bg-plum-950 transition-all duration-300 ease-out ${
                    shown ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
                  }`}
                />
                <span
                  className={`absolute left-0 top-1/2 block h-[2px] w-5 -translate-y-1/2 rounded-full bg-plum-950 transition-opacity duration-200 ${
                    shown ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 block h-[2px] w-5 rounded-full bg-plum-950 transition-all duration-300 ease-out ${
                    shown ? "bottom-1/2 translate-y-1/2 -rotate-45" : "bottom-0"
                  }`}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {mounted && (
        <div
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-[70] lg:hidden"
        >
          {/* Navy sheet wipes up from the bottom, then the links stagger in over it. */}
          <div
            className={`absolute inset-0 bg-plum-950 transition-transform duration-[520ms] [transition-timing-function:cubic-bezier(0.76,0,0.24,1)] ${
              shown ? "translate-y-0" : "translate-y-full"
            }`}
          />

          <div className="relative flex h-full flex-col overflow-y-auto px-6 pb-10 pt-24">
            <nav className="flex-1">
              <ul>
                {links.map((l, i) => (
                  <li key={l.label} className="overflow-hidden border-b border-white/10">
                    <Link
                      href={l.href}
                      onClick={closeMenu}
                      className={`group flex items-center gap-4 py-5 transition-[transform,opacity] duration-[560ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                        shown ? "translate-y-0 opacity-100" : "translate-y-[110%] opacity-0"
                      }`}
                      style={{ transitionDelay: `${(shown ? 220 : 0) + i * 65}ms` }}
                    >
                      <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        {l.label}
                      </span>
                      <ArrowUpRight
                        className="ml-auto h-5 w-5 text-white/30 transition-colors group-hover:text-wine-300"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div
              className={`mt-10 transition-[transform,opacity] duration-[560ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: `${shown ? 220 + links.length * 65 : 0}ms` }}
            >
              <Link
                href="/listings"
                onClick={closeMenu}
                className="flex items-center justify-center rounded-full bg-wine-600 px-6 py-4 text-sm font-semibold text-white"
              >
                Find Property
              </Link>

              <div className="mt-8 flex items-center justify-center gap-3">
                {socialLinks.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-wine-500 hover:text-wine-500"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>

              <p className="mt-8 text-center text-xs text-white/40">hello@avhomes.com</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
