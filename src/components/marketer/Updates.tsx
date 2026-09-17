"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MarketingUpdate } from "@avhomes/contracts";
import { IconListings, IconUpdates } from "./icons3d";
import { AppLink, Skeleton } from "./ui";

/**
 * The home screen's Updates: wide banners that snap one at a time and peek the
 * next, with dots that follow the scroll.
 *
 * A banner with a photo is shaded from the left, where the words are, so the
 * picture still shows on the right. One without a photo is drawn in its tone
 * with a 3D object as its art: the gift box for news the office wrote, the
 * house for a new listing.
 */

export function UpdatesRail({
  items,
  canReport = true,
}: {
  items: readonly MarketingUpdate[];
  /** False for a paused or closed account: a banner that opens Report a deal keeps its words and loses its button. */
  canReport?: boolean;
}) {
  const rail = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  const [index, setIndex] = useState(0);

  function onScroll() {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const node = rail.current;
      const first = node?.firstElementChild;
      if (!node || !(first instanceof HTMLElement)) return;
      const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
      const step = Math.max(1, first.offsetWidth + gap);
      // The last banner can never snap to the start, so the end of the strip is the last dot.
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
      const next = atEnd ? items.length - 1 : Math.round(node.scrollLeft / step);
      setIndex(Math.min(items.length - 1, Math.max(0, next)));
    });
  }

  return (
    <div>
      <ul ref={rail} onScroll={onScroll} className="m-rail m-rail--wide" aria-label="Updates">
        {items.map((update, position) => (
          <li key={update.id}>
            <UpdateCard update={update} eager={position === 0} canReport={canReport} />
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div aria-hidden className="m-dots">
          {items.map((update, position) => (
            <span key={update.id} data-on={position === index} />
          ))}
        </div>
      )}
    </div>
  );
}

function UpdateCard({
  update,
  eager,
  canReport,
}: {
  update: MarketingUpdate;
  eager: boolean;
  canReport: boolean;
}) {
  const photo = update.imageUrl !== "";
  const blocked = !canReport && update.linkHref.startsWith("/m/deals/new");
  const hasLink = update.linkHref !== "" && !blocked;
  const hasButton = hasLink && update.linkLabel !== "";
  const Art = update.source === "listing" ? IconListings : IconUpdates;

  const body = (
    <>
      {photo ? (
        <Image
          src={update.imageUrl}
          alt=""
          fill
          sizes="(max-width: 30rem) 86vw, 26rem"
          priority={eager}
          className="-z-20 object-cover"
        />
      ) : (
        <span aria-hidden className="m-update__art">
          <Art size={80} />
        </span>
      )}
      <span aria-hidden className="m-update__shade" />
      <span className={`flex flex-col items-start ${photo ? "max-w-[76%]" : "pr-16"}`}>
        <span className="line-clamp-2 text-[17px] font-bold leading-snug tracking-[-0.01em]">
          {update.title}
        </span>
        {update.body !== "" && (
          // One line when a button follows, so the banner stays a banner.
          <span
            className={`mt-1 text-[13px] leading-snug text-white/82 ${
              hasButton ? "line-clamp-1" : "line-clamp-2"
            }`}
          >
            {update.body}
          </span>
        )}
        {hasButton && (
          <span className="m-update__cta">
            {update.linkLabel}
            <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </span>
        )}
      </span>
    </>
  );

  const tone = photo ? "" : `m-update--${update.tone}`;

  if (hasLink) {
    return (
      <AppLink href={update.linkHref} className={`m-update m-press ${tone}`}>
        {body}
      </AppLink>
    );
  }
  return <div className={`m-update ${tone}`}>{body}</div>;
}

/** The banner's shape while the feed loads. No dots: the count is not known yet. */
export function UpdatesSkeleton() {
  return (
    <div aria-hidden>
      <div className="m-rail m-rail--wide">
        <div>
          <div className="m-update">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-2 h-3.5 w-1/2" />
            <Skeleton className="mt-3 h-8 w-28" radius="999px" />
          </div>
        </div>
        <div>
          <div className="m-update" />
        </div>
      </div>
    </div>
  );
}

/** Nothing live yet: one calm banner, shorter than a real one. */
export function UpdatesEmpty() {
  return (
    <div className="px-4 pb-2.5">
      <div className="m-update m-update--plum m-update--empty">
        <span aria-hidden className="m-update__art">
          <IconUpdates size={72} />
        </span>
        <span aria-hidden className="m-update__shade" />
        <span className="pr-20 text-[16px] font-bold leading-snug">
          News from AV Homes shows up here.
        </span>
        <span className="mt-1 pr-20 text-[13px] leading-snug text-white/78">
          Site visits, new homes and pay day changes.
        </span>
      </div>
    </div>
  );
}
