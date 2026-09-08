"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { ArrowLeft, Monitor } from "lucide-react";
import { Card } from "./ui";

/**
 * The one screen that says a feature needs a wider window.
 *
 * A GATE IS AN ADMISSION OF DEFEAT, so there are exactly two in the console and
 * both had to earn it against a specific, checkable fact rather than against
 * "this looks cramped". The customize studio sizes its screenshots from
 * `window.innerWidth`, so a note taken on a phone permanently stores a picture
 * of the MOBILE site while the reviewer reading it later believes they are
 * looking at the site; that is wrong data, not a wrong layout. The block editor
 * hides its drag handle on coarse pointers and offers Alt+Arrow as the
 * alternative, which is not an alternative on a device with no Alt key, so
 * reordering a document has no touch route at all.
 *
 * Three things the interstitial has to do, and the third is the one usually
 * skipped:
 *
 *  - Name the mechanic, in one sentence, without apologising. "The editor
 *    reorders blocks by dragging" tells the reader something true. "This
 *    feature is not available on mobile" tells them nothing and reads as an
 *    oversight.
 *  - Give a way back that is a real target, not a 13px link.
 *  - Carry what the phone CAN still do. A gate with nothing under it is a dead
 *    end. Both of the console's gates ship MORE capability than the screen had
 *    before: the customize route gains a notes reader that used to be desktop
 *    only, and the writing studio points at a simple editor that can do every
 *    part of the job except arrange blocks.
 */
export function WideScreenGate({
  feature,
  why,
  backHref,
  backLabel,
  children,
}: {
  /** Sentence case, no article: "the customize studio". */
  feature: string;
  /** One sentence naming the mechanic. Not an apology. */
  why: string;
  backHref: string;
  backLabel: string;
  /** What a phone can still do here. Rendered under the card. */
  children?: ReactNode;
}) {
  return (
    <div className="console min-h-[100dvh] bg-mist-50 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <Card padded={false} className="p-6">
          <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-wine-50 text-wine-600">
            <Monitor className="h-5 w-5" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-bold tracking-tight text-plum-950">
            Open {feature} on a wider screen
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{why}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            A wider window with a mouse or trackpad is what this needs. Nothing is
            lost by waiting: the work is saved where you left it.
          </p>

          <Link
            href={backHref}
            className="c-bevel mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-semibold text-plum-950 transition-colors hover:bg-mist-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </Card>

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
