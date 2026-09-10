"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { AlertSeverity, SiteAlert } from "@avhomes/contracts";
import { ButtonLink } from "./ui";

/**
 * What the site is getting wrong, rendered for the person who can fix it.
 *
 * ONE ROW COMPONENT, TWO SURFACES. The dashboard shows the first two and the
 * alerts page shows all of them, and they must look like the same object in
 * both places: a reader who acts on a banner and then opens the full list is
 * checking whether they already did this one, and two different renderings of
 * the same alert make that a re-read rather than a glance.
 *
 * There is no dismiss control anywhere in this file, deliberately. Every alert
 * clears by fixing the thing it names, which is the promise `site-health.ts`
 * makes and the only reason the count on the rail can be trusted.
 */

const SEVERITY: Record<
  AlertSeverity,
  { label: string; badge: string; icon: typeof TriangleAlert; iconClass: string }
> = {
  blocker: {
    label: "Blocking",
    badge: "bg-red-100 text-red-800",
    icon: CircleAlert,
    iconClass: "text-red-600",
  },
  warning: {
    label: "Needs you",
    badge: "bg-amber-50 text-amber-700",
    icon: TriangleAlert,
    iconClass: "text-amber-600",
  },
  advisory: {
    label: "Worth doing",
    badge: "bg-mist-100 text-slate-600",
    icon: Info,
    iconClass: "text-slate-500",
  },
};

export function AlertRow({ alert }: { alert: SiteAlert }) {
  const grade = SEVERITY[alert.severity];
  const Icon = grade.icon;

  return (
    /* The action sits BELOW the text on a phone and beside it from `sm`. Beside
       it on a handheld leaves the message a three-word-per-line ribbon, and the
       message is the half that does the work. */
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:flex-row sm:items-start sm:gap-5 sm:p-6">
      <span className="mt-0.5 hidden shrink-0 sm:block">
        <Icon className={`h-5 w-5 ${grade.iconClass}`} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold sm:text-[11px] ${grade.badge}`}
          >
            {grade.label}
          </span>
          <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-plum-950">
            {alert.title}
          </h3>
        </div>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-slate-600">
          {alert.message}
        </p>
      </div>

      <div className="shrink-0 sm:pt-0.5">
        <ButtonLink href={alert.action.href} variant="ghost" size="sm" className="w-full sm:w-auto">
          {alert.action.label}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * The dashboard's cut of the list.
 *
 * TWO, then a door. The whole point of a banner on the front door is that it is
 * readable without becoming the front door: a console that opens onto nine
 * chores is a console people learn to scroll past, and the tenth chore is the
 * one that was actually urgent. Everything past the second lives one click
 * away on a page whose job is that list.
 */
export function AlertBanner({ alerts }: { alerts: readonly SiteAlert[] }) {
  if (alerts.length === 0) return null;

  const shown = alerts.slice(0, 2);
  const rest = alerts.length - shown.length;
  const blockers = alerts.filter((a) => a.severity === "blocker").length;

  return (
    <section aria-labelledby="alerts-heading">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="alerts-heading" className="text-[15px] font-semibold text-plum-950">
          {blockers > 0
            ? `${blockers} ${blockers === 1 ? "thing is" : "things are"} stopping your site working`
            : `${alerts.length} ${alerts.length === 1 ? "thing needs" : "things need"} you`}
        </h2>
        {blockers > 0 && alerts.length > blockers && (
          <span className="text-[13px] text-slate-500">
            and {alerts.length - blockers} smaller {alerts.length - blockers === 1 ? "one" : "ones"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {shown.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>

      {rest > 0 && (
        <Link
          href="/admin/alerts"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-wine-700 transition-colors hover:text-wine-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
        >
          Show {rest} more
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
