"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ComponentType, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Lock, Phone, X } from "lucide-react";
import {
  GlyphHome,
  GlyphMenu,
  IconAccount,
  IconAlerts,
  IconDeals,
  IconHandshake,
  IconHelp,
  IconInvite,
  IconListings,
  IconMoney,
  IconTeam,
  OrbMark,
  type IconProps,
} from "./icons3d";
import { Sheet, useDialog, useMounted } from "./Sheet";
import { ButtonLink } from "./ui";

/**
 * The bottom bar: Home on the left, Menu on the right, and the glowing orb in
 * the middle that opens Report a deal. The sections themselves live in the
 * Menu sheet rather than in a row of tabs.
 */

export type NavKey = "home" | "menu";

interface MenuEntry {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** Grid placement on a six column grid: rows of three span two columns each. */
  column: string;
  row: number;
  /** The middle of a row of three sits higher. */
  up?: boolean;
  /** Carries the count of alerts to act on. */
  count?: boolean;
}

/* Three rows of three. Buyers filled the gap in row 2, which is why the middle
   row no longer sits inset: every row now has a raised middle tile. */
const MENU: readonly MenuEntry[] = [
  { href: "/m/deals", label: "Deals", Icon: IconDeals, column: "1 / span 2", row: 1 },
  { href: "/m/team", label: "Team", Icon: IconTeam, column: "3 / span 2", row: 1, up: true },
  { href: "/m/money", label: "Money", Icon: IconMoney, column: "5 / span 2", row: 1 },
  { href: "/m/buyers", label: "Buyers", Icon: IconHandshake, column: "1 / span 2", row: 2 },
  { href: "/m/invite", label: "Invite", Icon: IconInvite, column: "3 / span 2", row: 2, up: true },
  { href: "/m/listings", label: "Listings", Icon: IconListings, column: "5 / span 2", row: 2 },
  { href: "/m/alerts", label: "Alerts", Icon: IconAlerts, column: "1 / span 2", row: 3, count: true },
  { href: "/m/help", label: "Help", Icon: IconHelp, column: "3 / span 2", row: 3, up: true },
  { href: "/m/profile", label: "Account", Icon: IconAccount, column: "5 / span 2", row: 3 },
];

function countText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function NavBar({
  active,
  alertCount,
  reportBlock = null,
  supportPhone = "",
}: {
  active: NavKey;
  alertCount: number;
  /** Why this marketer cannot report a deal. The orb locks and explains instead of opening the form. */
  reportBlock?: string | null;
  supportPhone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const home = active === "home" && !open;

  return (
    <>
      <nav className="m-nav" aria-label="App">
        <div className="m-nav__row">
          <Link
            href="/m"
            aria-current={active === "home" ? "page" : undefined}
            data-on={home}
            className="m-nav__item m-press"
          >
            <GlyphHome size={24} />
            Home
          </Link>

          {reportBlock ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setExplaining(true)}
              className="m-orb m-orb--locked"
            >
              <OrbMark size={84} />
              <span aria-hidden className="m-orb__lock">
                <Lock className="h-6 w-6" strokeWidth={2.4} />
              </span>
              <span className="sr-only">Report a deal, turned off</span>
            </button>
          ) : (
            // Named by its text, not a label, so a script can find it the way a person reads it.
            <Link href="/m/deals/new" className="m-orb">
              <OrbMark plus size={84} />
              <span aria-hidden className="m-orb__sheen" />
              <span className="sr-only">Report a deal</span>
            </Link>
          )}

          <button
            ref={menuButton}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-on={active === "menu" || open}
            onClick={() => setOpen(true)}
            className="m-nav__item m-press"
          >
            <GlyphMenu size={24} />
            Menu
          </button>
        </div>
      </nav>

      <MenuSheet
        open={open}
        onClose={() => setOpen(false)}
        returnTo={menuButton}
        alertCount={alertCount}
      />

      {reportBlock && (
        <Sheet
          open={explaining}
          onClose={() => setExplaining(false)}
          title="Reporting is turned off"
          hint={reportBlock}
        >
          {supportPhone !== "" ? (
            <ButtonLink
              href={`tel:${supportPhone.replace(/\s/gu, "")}`}
              external
              variant="secondary"
              size="lg"
              full
            >
              <Phone className="h-4 w-4" aria-hidden />
              Call AV Homes
            </ButtonLink>
          ) : (
            <ButtonLink href="/m/help" variant="secondary" size="lg" full>
              Get help
            </ButtonLink>
          )}
        </Sheet>
      )}
    </>
  );
}

function MenuSheet({
  open,
  onClose,
  returnTo,
  alertCount,
}: {
  open: boolean;
  onClose: () => void;
  returnTo: RefObject<HTMLButtonElement | null>;
  alertCount: number;
}) {
  const mounted = useMounted();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, panel, returnTo);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="m-float">
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
        className="m-scrim m-scrim--menu block w-full cursor-default"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="m-menu outline-none"
      >
        <div className="flex justify-center pb-2.5 pt-1">
          <span aria-hidden className="m-sheet__grip" />
        </div>

        <div className="m-menu__panel">
          <ul className="m-menu__grid">
            {MENU.map((entry, index) => {
              const badge = entry.count === true && alertCount > 0;
              return (
                <li
                  key={entry.href}
                  className={`m-menu__cell ${entry.up ? "m-menu__cell--up" : ""} ${
                    entry.row === 3 ? "m-menu__cell--last" : ""
                  }`}
                  style={{ gridColumn: entry.column, gridRow: entry.row }}
                >
                  <Link
                    href={entry.href}
                    onClick={onClose}
                    aria-current={pathname === entry.href ? "page" : undefined}
                    className="m-menu__item"
                    style={{ "--i": index } as CSSProperties}
                  >
                    <span className="m-menu__dot">
                      <entry.Icon size={64} />
                      {badge && (
                        <span aria-hidden className="m-menu__badge">
                          {countText(alertCount)}
                        </span>
                      )}
                    </span>
                    <span className="m-menu__label">
                      {entry.label}
                      {badge && <span className="sr-only">, {alertCount} to do</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="m-menu__foot">
          <button type="button" onClick={onClose} aria-label="Close menu" className="m-menu__close">
            <X className="h-6 w-6" strokeWidth={2.2} aria-hidden />
          </button>
          <span aria-hidden className="m-menu__close-label">
            Close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
