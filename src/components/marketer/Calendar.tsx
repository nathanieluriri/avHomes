"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nowMs } from "@/lib/marketer/api";

/**
 * A month grid for picking one day.
 *
 * It opens on the month the value is in, or on today when there is no value.
 * That sounds obvious and is worth stating, because the usual bug is an empty
 * value falling through to `new Date(0)` and the picker opening on January
 * 1970 (or 1901, on a picker that counts from a different epoch). A date picker
 * that opens ninety years away is not a small blemish: it costs the reader
 * eleven hundred taps to reach this month, so they abandon the filter.
 *
 * Bounds are real. `min` and `max` grey out the days outside them AND stop the
 * month arrows, because a disabled day the reader can still navigate to is a
 * dead end they have to reason their way out of.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Midnight local, so two timestamps on the same day compare equal. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The last millisecond of a day, for the closed end of a range. */
export function endOfDay(at: number): number {
  return startOfDay(at) + DAY_MS - 1;
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

function monthKey(at: number): number {
  const d = new Date(at);
  return d.getFullYear() * 12 + d.getMonth();
}

function fromMonthKey(key: number): Date {
  return new Date(Math.floor(key / 12), key % 12, 1);
}

/** The 42 cells of a month grid: the month, padded with its neighbours. */
function gridFor(key: number): number[] {
  const first = fromMonthKey(key);
  const start = first.getTime() - first.getDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => startOfDay(start + i * DAY_MS));
}

export function Calendar({
  value,
  onPick,
  min,
  max,
  label = "Choose a date",
}: {
  /** Null shows no selection and opens on today. */
  value: number | null;
  onPick: (day: number) => void;
  /** Earliest day that can be picked. Defaults to ten years back. */
  min?: number;
  /** Latest day. Defaults to today: this app has no future money. */
  max?: number;
  label?: string;
}) {
  /* One clock reading for the life of this grid. Calling Date.now() per render
     would let "today" move underneath the reader mid-interaction, and it is an
     impure call in render besides. */
  const [today] = useState(() => nowMs());
  const ceiling = startOfDay(max ?? today);
  const floor = min ?? startOfDay(today - 3650 * DAY_MS);

  // Opens where the reader already is, never on the epoch.
  const [month, setMonth] = useState(() => monthKey(value ?? Math.min(today, ceiling)));
  const [jumping, setJumping] = useState(false);

  const cells = useMemo(() => gridFor(month), [month]);
  const shownMonth = fromMonthKey(month);
  const backOk = month > monthKey(floor);
  const nextOk = month < monthKey(ceiling);

  return (
    <div className="select-none" role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setJumping((was) => !was)}
          aria-expanded={jumping}
          className="m-tap m-press-light -ml-2 flex items-center gap-1.5 rounded-[12px] px-2 py-1.5 text-[15px] font-semibold"
        >
          {MONTHS[shownMonth.getMonth()]} {shownMonth.getFullYear()}
          <ChevronRight
            className={`h-4 w-4 text-m-muted transition-transform ${jumping ? "rotate-90" : "rotate-0"}`}
            aria-hidden
          />
        </button>

        <div className="flex items-center gap-1">
          <Arrow dir="back" disabled={!backOk} onClick={() => setMonth((m) => m - 1)} />
          <Arrow dir="next" disabled={!nextOk} onClick={() => setMonth((m) => m + 1)} />
        </div>
      </div>

      {jumping ? (
        <MonthJump
          month={month}
          floor={floor}
          ceiling={ceiling}
          onPick={(next) => {
            setMonth(next);
            setJumping(false);
          }}
        />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-7 gap-y-1">
            {WEEKDAYS.map((day, i) => (
              <div
                key={i}
                aria-hidden
                className="grid h-8 place-items-center text-[12px] font-semibold text-m-faint"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day) => {
              const outside = new Date(day).getMonth() !== shownMonth.getMonth();
              const blocked = day < startOfDay(floor) || day > ceiling;
              const picked = value !== null && sameDay(day, value);
              const isToday = sameDay(day, today);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={blocked}
                  onClick={() => onPick(day)}
                  aria-current={picked ? "date" : undefined}
                  aria-label={new Date(day).toLocaleDateString("en-NG", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  className={[
                    "m-tap relative mx-auto grid h-10 w-10 place-items-center rounded-full text-[15px] tabular-nums",
                    blocked
                      ? "text-m-faint/40"
                      : outside
                        ? "text-m-faint"
                        : "text-m-text active:bg-m-raised",
                    picked ? "!bg-[#a83550] font-bold !text-white" : "",
                  ].join(" ")}
                >
                  {new Date(day).getDate()}
                  {isToday && !picked && (
                    <span
                      aria-hidden
                      className="absolute bottom-1.5 h-1 w-1 rounded-full bg-(color:--m-link)"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Arrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "back" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "back" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "back" ? "Previous month" : "Next month"}
      className="m-tap grid h-10 w-10 place-items-center rounded-full text-m-text active:bg-m-raised disabled:text-m-faint/40"
    >
      <Icon className="h-5 w-5" strokeWidth={2.1} aria-hidden />
    </button>
  );
}

/**
 * Year and month in one pass.
 *
 * A separate year list then a month list is two decisions where the reader has
 * one. This shows the years it is allowed to offer, scrolled to the current one,
 * with twelve months under whichever year is open.
 */
function MonthJump({
  month,
  floor,
  ceiling,
  onPick,
}: {
  month: number;
  floor: number;
  ceiling: number;
  onPick: (key: number) => void;
}) {
  const firstYear = new Date(floor).getFullYear();
  const lastYear = new Date(ceiling).getFullYear();
  const [year, setYear] = useState(Math.floor(month / 12));
  const strip = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  // The open year should be visible without a scroll, not hiding off the right.
  useEffect(() => {
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, []);

  return (
    <div className="mt-3">
      <div ref={strip} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {years.map((value) => (
          <button
            key={value}
            type="button"
            aria-current={value === year}
            onClick={() => setYear(value)}
            className={`m-tap shrink-0 rounded-full px-3.5 py-2 text-[14px] font-semibold tabular-nums ${
              value === year ? "bg-[#a83550] text-white" : "bg-m-raised text-m-muted"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {MONTHS.map((name, index) => {
          const key = year * 12 + index;
          const blocked = key < monthKey(floor) || key > monthKey(ceiling);
          return (
            <button
              key={name}
              type="button"
              disabled={blocked}
              onClick={() => onPick(key)}
              className={`m-tap rounded-[12px] py-2.5 text-[14px] font-semibold ${
                key === month
                  ? "bg-[#a83550] text-white"
                  : "bg-m-raised text-m-text active:bg-m-line disabled:text-m-faint/40"
              }`}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
