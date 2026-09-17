"use client";

import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import type { MarketerAlert, MarketerAlertIcon, MarketerAlertTone } from "@avhomes/contracts";
import { whenLabel } from "@/lib/marketer/api";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";
import {
  IconAlerts,
  IconBank,
  IconCheckBadge,
  IconDeals,
  IconMoney,
  IconPayDay,
  IconPhoto,
  IconShield,
  IconTeam,
  type IconProps,
} from "./icons3d";
import { AppLink, Chip, Skeleton, type ChipTone } from "./ui";

/**
 * The pieces every alert is drawn from: its 3D icon, its tone chip, a card for
 * the home screen's sideways strip and a row for the full list.
 *
 * Each alert names one action and links to the screen that completes it, so
 * both the card and the row are a single link.
 */

export const ALERT_TONE_LABEL: Record<MarketerAlertTone, string> = {
  act: "Do this",
  "heads-up": "Heads up",
  good: "Good news",
};

const ALERT_CHIP: Record<MarketerAlertTone, ChipTone> = {
  act: "act",
  "heads-up": "heads-up",
  good: "good",
};

const TONE_ORDER: Record<MarketerAlertTone, number> = { act: 0, "heads-up": 1, good: 2 };

export const ALERT_TONES: readonly MarketerAlertTone[] = ["act", "heads-up", "good"];

const ALERT_ICON: Record<MarketerAlertIcon, ComponentType<IconProps>> = {
  bank: IconBank,
  deals: IconDeals,
  shield: IconShield,
  money: IconMoney,
  team: IconTeam,
  payday: IconPayDay,
  photo: IconPhoto,
  check: IconCheckBadge,
  alerts: IconAlerts,
};

/** Act first, then heads up, then good news; newest first inside each. */
export function sortAlerts(items: readonly MarketerAlert[]): MarketerAlert[] {
  return [...items].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.at - a.at);
}

/** An alert's words, with the amounts masked when the reader has hidden their money. */
function useAlertText(alert: MarketerAlert): { title: string; body: string; detail: string } {
  const [hidden] = useMoneyHidden();
  // `detail` arrived after the first release of the feed; an older answer has none.
  const detail = alert.detail ?? "";
  if (!hidden) return { title: alert.title, body: alert.body, detail };
  return { title: maskMoney(alert.title), body: maskMoney(alert.body), detail: maskMoney(detail) };
}

export function AlertIcon({ icon, size }: { icon: MarketerAlertIcon; size: number }) {
  const Icon = ALERT_ICON[icon] ?? IconAlerts;
  return <Icon size={size} />;
}

export function AlertChip({ tone }: { tone: MarketerAlertTone }) {
  return <Chip tone={ALERT_CHIP[tone]}>{ALERT_TONE_LABEL[tone]}</Chip>;
}

/**
 * One alert on the home screen: a big 3D object, the chip, a bold title and the
 * short line whole. The server writes that line to fit, so nothing is clamped
 * but a title long enough to be a mistake. Cards in a strip stretch to the
 * tallest, so a shorter one ends in air rather than a cut sentence.
 */
export function AlertCard({ alert }: { alert: MarketerAlert }) {
  const text = useAlertText(alert);
  return (
    <AppLink href={alert.action.href} className="m-alert-card m-press m-press-light">
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden className="-ml-1.5 -mt-1">
          <AlertIcon icon={alert.icon} size={64} />
        </span>
        <AlertChip tone={alert.tone} />
      </span>
      <span className="mt-1.5 line-clamp-3 text-[15px] font-bold leading-snug text-m-text">
        {text.title}
      </span>
      <span className="mt-1 text-[13px] leading-snug text-m-muted">{text.body}</span>
      <span className="m-link mt-auto flex items-center gap-0.5 pt-3 text-[13px]">
        {alert.action.label}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </AppLink>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="m-alert-card" aria-hidden>
      <span className="flex items-start justify-between">
        <Skeleton className="h-14 w-14" radius="18px" />
        <Skeleton className="h-6 w-16" radius="999px" />
      </span>
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-2.5 h-3 w-3/4" />
      <Skeleton className="mt-5 h-3.5 w-24" />
    </div>
  );
}

/** One alert in the full list: icon, title, body, the longer detail, and the action as a pill. */
export function AlertRow({ alert }: { alert: MarketerAlert }) {
  const text = useAlertText(alert);
  return (
    <AppLink
      href={alert.action.href}
      className="m-press m-press-light flex w-full items-start gap-3 px-4 py-4 text-left"
    >
      {/* 44 draws the object at about the 40px the list calls for; the art has air around it. */}
      <span aria-hidden className="-mt-0.5 shrink-0">
        <AlertIcon icon={alert.icon} size={44} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug text-m-text">{text.title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-m-muted">{text.body}</span>
        {/* On a plate, so an admin's own words read apart from ours. A long reply
            stops after five lines; the screen the row opens holds all of it. */}
        {text.detail !== "" && (
          <span className="mt-2.5 line-clamp-5 rounded-[12px] bg-m-ground/60 px-3 py-2 text-[13px] leading-relaxed text-m-text ring-1 ring-m-line [overflow-wrap:anywhere]">
            {text.detail}
          </span>
        )}
        <span className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-m-faint">{whenLabel(alert.at)}</span>
          {/* The one thing to do is wine glass when it must be done; a quiet pill otherwise. */}
          <span
            className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full pl-3.5 pr-2.5 text-[13px] font-semibold ${
              alert.tone === "act"
                ? "m-btn--primary"
                : "bg-m-raised text-m-text ring-1 ring-m-line"
            }`}
          >
            {alert.action.label}
            <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
          </span>
        </span>
      </span>
    </AppLink>
  );
}

export function AlertRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-4" aria-hidden>
      <Skeleton className="h-10 w-10" radius="12px" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-2/3" />
        <div className="mt-3 flex justify-between">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-8 w-28" radius="999px" />
        </div>
      </div>
    </div>
  );
}
