"use client";

import { type ReactNode } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import { X } from "lucide-react";
import { IconButton } from "./ui";

/**
 * The console's one overlay.
 *
 * A BOTTOM SHEET BELOW `sm`, the centred box the console already drew from `sm`
 * up. Every overlay here started life as the second of those and failed on a
 * phone in the same four ways: the thumb is at the bottom of the screen and the
 * controls were at the top, the whole panel was the scroll container so the
 * close button scrolled away, the panel was sized against `vh` which does not
 * shrink for the keyboard, and there was no Escape key to fall back on.
 *
 * PURELY CSS-RESPONSIVE, deliberately. Branching on a `useIsPhone` would read
 * better in the JSX and would cost a hydration flash and, worse, a portal that
 * mounts in one shape and re-mounts in the other on the first frame. One tree,
 * two sets of classes, no measurement.
 *
 * `dvh` rather than `vh` throughout, because mobile browser chrome moves: `vh`
 * is the LARGE viewport, so a sheet capped at `85vh` on a Safari tab with its
 * bar showing is taller than the screen it is drawn on, and its footer is off
 * the bottom until the user scrolls the address bar away.
 *
 * The footer reads both bottom insets. `--safe-b` keeps a Save out of the home
 * indicator's gesture strip, where the system swipe eats the tap; `--c-kb` is
 * the measured keyboard height, because a sheet with a text field in it is
 * exactly the case where iOS draws the footer underneath the keyboard.
 *
 * `console-float` is applied here rather than by the caller. It is what exempts
 * a portalled surface from the marketing site's blanket box-shadow removal, and
 * a sheet that forgets it loses its elevation AND its focus rings, which is not
 * a failure anybody notices while writing the call site.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  srOnlyTitle = false,
  description,
  children,
  footer,
  widthClassName = "sm:w-[min(34rem,calc(100vw-2rem))]",
  topAligned = false,
  className = "",
  bodyClassName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the sheet for a screen reader, and is drawn unless `srOnlyTitle`. */
  title: string;
  /** For a sheet whose body draws its own heading, such as the palette. */
  srOnlyTitle?: boolean;
  description?: string;
  children: ReactNode;
  /** Pinned below the scrolling body and above the safe-area pad. */
  footer?: ReactNode;
  /** REPLACES the `sm` and up width rather than competing with it. Two
   *  arbitrary values of the same utility in the same variant resolve by
   *  Tailwind's build order, not by which was written last, so a caller cannot
   *  be allowed to append a second `sm:w-*`. Below `sm` the sheet is always the
   *  full width of the screen. */
  widthClassName?: string;
  /** Anchors the `sm` and up box near the top of the window instead of
   *  centring it. For a panel whose content GROWS as the reader types: a
   *  vertically centred palette moves up the screen with every keystroke,
   *  because the box is recentred as its result list gets longer. */
  topAligned?: boolean;
  /** Anything else for the `sm` and up box. Not the width; see above. */
  className?: string;
  bodyClassName?: string;
}) {
  const anchor = topAligned
    ? "sm:top-[12vh] sm:translate-y-0"
    : "sm:top-1/2 sm:-translate-y-1/2";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="console-float fixed inset-0 z-[70] bg-plum-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {/* `console` as well as `console-float`. The console's only focus ring is
            declared as `.console :focus-visible`, so a portalled panel that
            carries just the float class keeps its shadow and loses every ring
            inside it, which on a field already carrying `outline-none` means no
            focus indicator at all. Applied here so no caller can forget it,
            which is the same reason `console-float` is applied here. */}
        <Dialog.Content
          // Radix warns for every content with no description, and this one is
          // optional. Saying `undefined` explicitly is how the warning is
          // waived rather than suppressed.
          aria-describedby={description ? undefined : undefined}
          className={`console console-float fixed inset-x-0 bottom-0 z-[71] flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:max-h-[min(42rem,85dvh)] sm:-translate-x-1/2 sm:rounded-2xl sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 ${anchor} ${widthClassName} ${className}`}
        >
          {/* The grab handle. It does not drag, and it is still worth drawing:
              it is the one mark that says "this came up from the bottom and
              goes back down", which is what tells a phone reader that tapping
              outside dismisses it. */}
          <div
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-mist-300 sm:hidden"
            aria-hidden="true"
          />

          {/* `shrink-0`, so the header never participates in the scroll. The
              close button leaving the screen when the body is long is the
              single most common way a phone modal becomes a trap. */}
          <div
            className={`flex shrink-0 items-start gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pt-4 ${
              srOnlyTitle ? "sr-only" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-plum-950">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-[13px] text-slate-600">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} />
            </Dialog.Close>
          </div>

          {/* Only this scrolls. `min-h-0` is what lets a flex child shrink below
              its content instead of pushing the footer off the bottom, and
              `overscroll-contain` stops a flick at the end of the list from
              scrolling the page behind the sheet. */}
          <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 ${bodyClassName}`}>
            {children}
          </div>

          {footer && (
            <div className="shrink-0 border-t border-mist-200 px-4 pt-3 pb-[calc(1rem+var(--safe-b)+var(--c-kb))] sm:px-5 sm:pb-4">
              {footer}
            </div>
          )}

          {/* With no footer the body still has to clear the home indicator. */}
          {!footer && <div className="h-[calc(var(--safe-b)+var(--c-kb))] shrink-0" aria-hidden="true" />}

          {srOnlyTitle && (
            <Dialog.Close asChild>
              <button type="button" className="sr-only">
                Close
              </button>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A menu that is a dropdown with a mouse and a sheet with a thumb.
 *
 * The same content, mounted twice and shown by media query, for the reason
 * `BottomSheet` itself does not branch in JavaScript. A Radix dropdown anchored
 * to a 36px trigger in the top-right corner of a phone opens a 240px panel in
 * the least reachable part of the screen; the same items in a sheet land under
 * the thumb.
 *
 * `items` is a render prop rather than children, because the two mounts need
 * different wrappers around each row: a dropdown row is a `DropdownMenu.Item`
 * with roving focus, a sheet row is an ordinary button.
 */
export function ResponsiveMenu({
  trigger,
  title,
  items,
  align = "end",
  contentClassName = "",
}: {
  trigger: ReactNode;
  /** Names the sheet. Never drawn in the dropdown, which is named by its
   *  trigger. */
  title: string;
  items: (kind: "menu" | "sheet") => ReactNode;
  align?: "start" | "center" | "end";
  contentClassName?: string;
}) {
  return (
    <>
      <div className="hidden sm:contents">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={8}
              align={align}
              className={`console-float z-[72] w-60 overflow-hidden rounded-xl border border-mist-200 bg-white p-1.5 shadow-pop ${contentClassName}`}
            >
              {items("menu")}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="contents sm:hidden">
        <SheetMenu trigger={trigger} title={title}>
          {items("sheet")}
        </SheetMenu>
      </div>
    </>
  );
}

function SheetMenu({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="console-float fixed inset-0 z-[70] bg-plum-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="console console-float fixed inset-x-0 bottom-0 z-[71] flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white pb-[calc(0.75rem+var(--safe-b))] shadow-pop data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
        >
          <div
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-mist-300"
            aria-hidden="true"
          />
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
