"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  LEAD_STATE_HINT,
  LEAD_STATE_LABEL,
  formatMoney,
  isLeadOpen,
  leadWantLine,
  type LeadEvent,
  type LeadRow,
  type LeadState,
} from "@avhomes/contracts";
import { Skeleton } from "../ui";

/**
 * The pieces both buyer screens share.
 *
 * Kept here rather than inline so the list row and the detail header cannot
 * describe the same state in two different words, which is what a marketer
 * would read as the app contradicting itself.
 */

/** How far along a live lead is, as a fraction. Terminal states have no bar. */
const STEP: Record<LeadState, number> = {
  new: 1,
  contacted: 2,
  meeting: 3,
  viewed: 4,
  offer: 5,
  won: 5,
  lost: 0,
};

/**
 * The state, said with a colour AND a word AND a position on a track.
 *
 * The track is the reason this is not a plain pill: "Meeting booked" tells a
 * marketer where their buyer is, but not how much further there is to go, and
 * "how close am I to being paid" is the actual question they open this screen
 * with.
 */
export function LeadState({ state, showTrack = true }: { state: LeadState; showTrack?: boolean }) {
  const open = isLeadOpen(state);
  const tone =
    state === "won"
      ? "bg-(color:--m-in-bg) text-(color:--m-in-fg)"
      : state === "lost"
        ? "bg-m-raised text-m-faint"
        : "bg-(color:--m-heads-bg) text-(color:--m-heads-fg)";

  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>
        {LEAD_STATE_LABEL[state]}
      </span>
      {showTrack && open && (
        <span aria-hidden className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((step) => (
            <span
              key={step}
              className={`h-1 rounded-full transition-all ${
                step <= STEP[state] ? "w-4 bg-(color:--m-link)" : "w-2 bg-m-line"
              }`}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export function LeadRowLink({ lead }: { lead: LeadRow }) {
  return (
    <Link
      href={`/m/buyers/${lead.id}`}
      className="m-press-light flex items-start gap-3 px-4 py-3.5 text-left"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-m-raised text-[15px] font-bold text-m-text">
        {lead.buyerName.trim().charAt(0).toUpperCase() || "?"}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15.5px] font-semibold text-m-text">{lead.buyerName}</span>
          {lead.myShareMinor > 0 && (
            <span className="shrink-0 text-[14px] font-bold text-(color:--m-in-fg)">
              {formatMoney(lead.myShareMinor, lead.currency)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-m-muted">{leadWantLine(lead)}</span>
        <span className="mt-2 block">
          <LeadState state={lead.state} />
        </span>
      </span>

      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-m-faint" aria-hidden />
    </Link>
  );
}

export function LeadRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-44" />
        <Skeleton className="mt-3 h-5 w-24 rounded-full" />
      </div>
    </div>
  );
}

/**
 * One move, as a line in the history.
 *
 * Both surfaces render this same component from the same array. The marketer
 * seeing exactly what the admin wrote, in the admin's words, is the feature.
 */
export function LeadTimeline({ events }: { events: readonly LeadEvent[] }) {
  return (
    <ol className="relative space-y-0">
      {events
        .slice()
        .reverse()
        .map((event, index, all) => {
          const last = index === all.length - 1;
          const moved = event.from !== event.to;
          return (
            <li key={`${event.at}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
              <span className="relative flex flex-col items-center">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    index === 0 ? "bg-(color:--m-link)" : "bg-m-line"
                  }`}
                />
                {!last && <span className="mt-1 w-px flex-1 bg-m-line" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-m-text">
                  {moved ? LEAD_STATE_LABEL[event.to] : "Note added"}
                </p>
                {event.reason !== "" && (
                  <p className="mt-0.5 text-[13px] text-(color:--m-link)">{event.reason}</p>
                )}
                <p className="mt-1 text-[14px] leading-relaxed text-m-muted">{event.note}</p>
                <p className="mt-1.5 text-[12px] text-m-faint">
                  {event.bySide === "admin" ? "AV Homes" : event.byName} ·{" "}
                  {new Date(event.at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {new Date(event.at).toLocaleTimeString("en-NG", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          );
        })}
    </ol>
  );
}

export { LEAD_STATE_HINT };
