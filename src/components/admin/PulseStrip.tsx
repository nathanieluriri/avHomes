"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SitePulse } from "@avhomes/contracts";

/**
 * Traffic, drawn the way it is actually measured.
 *
 * Two numbers on the strip, and a chart that only appears when somebody asks
 * for it. Three honesty rules hold this together, because a traffic widget is
 * the easiest thing in a console to make quietly untrue:
 *
 *  1. **The scope is stated, always.** These are sessions from visitors who
 *     accepted analytics cookies, over a fixed 30 day window. A number labelled
 *     "Sessions" with no qualifier is a claim about all traffic, and this is
 *     not that.
 *  2. **The series is zero filled by the server**, so the sparkline draws the
 *     shape of the data rather than the shape of the days that happened to have
 *     any. Three busy days out of thirty must not look like a flat healthy line.
 *  3. **No trend is invented.** With nothing in the previous window there is no
 *     percentage to state, so it says "first traffic in this window" instead of
 *     dividing by zero and printing an arrow.
 *
 * Rule 1 is also why BOTH tiles open the panel and why the scope now lives in
 * the panel's footnote rather than in a `title`. A tooltip does not exist on a
 * touch screen, so on a phone the number labelled "Live visitors" had its
 * definition nowhere on the device.
 */

const OPEN_KEY = "avhomes.console.sessions-open";

export function PulseStrip({ pulse }: { pulse: SitePulse }) {
  /*
   * Remembered for the browser session, not forever. Somebody who opens the
   * chart, walks into a listing and comes back should find it open; somebody
   * arriving fresh tomorrow should get the compact strip the screen is designed
   * around. Every access is wrapped, because Safari in private mode throws on
   * storage rather than returning null, and an unguarded read here would blank
   * the dashboard behind an error boundary.
   */
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggle() {
    setOpen((was) => {
      const next = !was;
      try {
        window.sessionStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        // Not remembering the choice is survivable. Failing to make it is not.
      }
      return next;
    });
  }

  const trend = trendOf(pulse.sessions, pulse.previousSessions);
  const panelId = useId();

  return (
    <div className="flex flex-col items-center">
      {/*
        The strip is full width and WRAPPING below sm, and its two tiles share
        the row rather than sitting at their content widths. As a non-shrinking
        pill it measured about 320px inside a 328px content column: it fit at
        360px by eight pixels, and a five figure session count or a longer label
        pushed it past the column. On a `fixed inset-0` frame that is not a
        clipped pill, it is the whole console scrolling sideways with no way to
        scroll back.
      */}
      <div className="flex w-full flex-wrap items-stretch gap-1 rounded-xl bg-white p-1 shadow-card sm:w-auto sm:flex-nowrap">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          title="Visitors who accepted analytics cookies, over the last 30 days"
          className={`flex min-w-0 grow basis-36 items-center gap-3 rounded-lg px-3 py-1.5 text-left transition-colors sm:grow-0 sm:basis-auto ${
            open ? "bg-mist-100" : "hover:bg-mist-50"
          }`}
        >
          <span className="min-w-0">
            {/* The window is on the label, not only inside the panel. A bare
                "Sessions" is a claim about all traffic for all time, and this
                figure is neither. */}
            <span className="block text-[11px] font-medium text-slate-600">
              Sessions <span className="text-slate-550">· 30 days</span>
            </span>
            <span className="c-num block text-lg font-bold leading-tight text-plum-950">
              {pulse.sessions.toLocaleString("en-GB")}
            </span>
          </span>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-slate-550 transition-transform sm:ml-0 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {/* A vertical rule between two tiles that have wrapped onto separate
            rows is drawing a column that is not there. */}
        <span className="my-1.5 hidden w-px bg-mist-200 sm:block" aria-hidden="true" />

        {/* The live tile opens the same panel, because the panel's footnote is
            now the only place either number is defined and the sessions toggle
            was the only way in. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex min-w-0 grow basis-36 items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors sm:grow-0 sm:basis-auto ${
            open ? "bg-mist-100" : "hover:bg-mist-50"
          }`}
          title="Browser tabs that beaconed in the last five minutes"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-slate-600">
              Live visitors <span className="text-slate-550">· now</span>
            </span>
            <span className="c-num block text-lg font-bold leading-tight text-plum-950">
              {pulse.live}
            </span>
          </span>
          <span className="ml-auto flex items-center sm:ml-0">
            <LiveDot count={pulse.live} />
          </span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-2 w-full max-w-2xl rounded-2xl bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-sm font-semibold text-plum-950">Sessions over time</h2>
              <p className="c-num mt-0.5 text-2xl font-bold tracking-tight text-plum-950">
                {pulse.sessions.toLocaleString("en-GB")}
              </p>
            </div>
            <p className="text-[13px] text-slate-600">
              {trend.label}
              {pulse.views > 0 && (
                <>
                  {" · "}
                  <span className="c-num">{pulse.views.toLocaleString("en-GB")}</span> page views
                </>
              )}
            </p>
          </div>

          <Sparkline series={pulse.series} />

          {/* Both tiles are defined here, in copy. The live figure used to be
              explained only by a `title` tooltip, which is nothing at all on a
              phone. */}
          <p className="mt-2 text-[12px] leading-relaxed text-slate-550 sm:text-[11px]">
            The last 30 days, counted from visitors who accepted analytics cookies. A session is
            one browser tab. Live is the tabs that beaconed in the last five minutes, and a tab
            stops counting five minutes after its last page view.
          </p>
        </div>
      )}
    </div>
  );
}

/** Pulses only when somebody is actually on the site. A heartbeat over a zero
 *  is decoration pretending to be a signal. */
function LiveDot({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-mist-300"
        aria-label="Nobody on the site right now"
      />
    );
  }
  return (
    <span
      className="c-ping relative h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 text-emerald-500"
      aria-label={`${count} on the site right now`}
    />
  );
}

function trendOf(now: number, before: number): { label: string } {
  if (before === 0) {
    return { label: now === 0 ? "No sessions yet" : "First traffic in this window" };
  }
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return { label: "Level with the previous 30 days" };
  const direction = change > 0 ? "up" : "down";
  return { label: `${direction} ${Math.abs(change)}% on the previous 30 days` };
}

/*
 * Where a value sits in the box, as a fraction from the top. The SVG maps a
 * value to `H - PAD_B - (value / scale) * (H - PAD_B - PAD_T)`, and the axis
 * labels and gridlines have to agree with that exactly, so both read these.
 */
const H = 72;
const PAD_T = 8;
const PAD_B = 4;

function yFor(value: number, scale: number): number {
  return H - PAD_B - (value / scale) * (H - PAD_B - PAD_T);
}

/**
 * The 30 day chart: a line over a soft area, with an axis.
 *
 * The axis is the part that was missing and the part that matters. The line
 * auto-scales to its own peak, so without a labelled maximum a single session
 * draws exactly the same full-height cliff as a thousand: the shape says surge
 * and the number says one, and nothing on screen reconciles them. Three
 * gridlines and three labels cost one row of small text and make the shape
 * readable.
 *
 * Reading a single day is a hover, a drag or an arrow key, not a guess from the
 * line.
 */
function Sparkline({ series }: { series: SitePulse["series"] }) {
  const W = 300;
  const [cursor, setCursor] = useState<number | null>(null);

  const { line, area, length, peak, scale } = useMemo(() => {
    const values = series.map((point) => point.sessions);
    /* Two different numbers. `scale` is the y-axis floor, held at 1 so a flat
       week does not divide by zero; `peak` is what actually happened, and it is
       the one a screen reader is told. Reporting the floor as the peak had the
       caption announcing "peaking at 1" over thirty days of nothing. */
    const peakValue = Math.max(0, ...values);
    const scaleValue = Math.max(1, peakValue);
    const step = series.length > 1 ? W / (series.length - 1) : W;
    // Padding at both ends, so a peak on the last day is not clipped in half by
    // the top of the box.
    const points = values.map((value, index) => {
      const x = index * step;
      return [x, yFor(value, scaleValue)] as const;
    });

    let sum = 0;
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      sum += Math.hypot(x1 - x0, y1 - y0);
    }

    const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return {
      line: d,
      area: `${d} L${W} ${H} L0 ${H} Z`,
      length: Math.ceil(sum),
      peak: peakValue,
      scale: scaleValue,
    };
  }, [series]);

  const first = series[0]?.day;
  const last = series[series.length - 1]?.day;
  const mid = Math.round(scale / 2);
  const active = cursor === null ? null : series[cursor];

  /*
   * The gridlines, as fractions of the box height, computed from the same
   * mapping the line uses so a label cannot drift off its rule.
   *
   * Deduplicated by value, because a quiet week scales to a peak of 1 and the
   * midpoint rounds to 1 as well: without this the axis reads "1, 1, 0" with
   * two rules a pixel apart.
   */
  const rules = [scale, mid, 0]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => ({ value, top: (yFor(value, scale) / H) * 100 }));

  function moveTo(index: number) {
    setCursor(Math.max(0, Math.min(series.length - 1, index)));
  }

  /** Where along the chart box an x coordinate falls, as a day. */
  function readAt(clientX: number, box: DOMRect) {
    if (box.width === 0) return;
    moveTo(Math.round(((clientX - box.left) / box.width) * (series.length - 1)));
  }

  return (
    <figure className="mt-3">
      <figcaption className="sr-only">
        {peak === 0
          ? "No sessions on any of the last 30 days."
          : `Sessions per day over the last 30 days, peaking at ${peak}.`}
      </figcaption>

      {/* The readout sits above the chart rather than floating over it: a
          tooltip that follows the pointer cannot be reached by a keyboard, and
          this line is the same object for both. */}
      <p className="mb-1 h-5 text-[12px] text-slate-600 sm:h-4 sm:text-[11px]" aria-live="polite">
        {active ? (
          <>
            <span className="font-semibold text-plum-950">{dayLabel(active.day)}</span>
            {": "}
            <span className="c-num">{active.sessions}</span>
            {active.sessions === 1 ? " session" : " sessions"}
          </>
        ) : (
          <span className="text-slate-550">
            <span className="sm:hidden">Drag along the line for a day.</span>
            <span className="hidden sm:inline">Hover or arrow along the line for a day.</span>
          </span>
        )}
      </p>

      <div className="flex items-stretch gap-2">
        {/* The axis. Without it the line's height means nothing: it always
            reaches the top, whatever the peak is. */}
        <div className="relative w-10 shrink-0 sm:w-9" aria-hidden="true">
          {rules.map((rule) => (
            <span
              key={rule.value}
              className="c-num absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-slate-550 sm:text-[10px]"
              style={{ top: `${rule.top}%` }}
            >
              {rule.value.toLocaleString("en-GB")}
            </span>
          ))}
        </div>

        {/*
          Three ways in, one readout. `touch-pan-y` is what makes the touch pair
          safe: a drag ACROSS the chart reads days, a drag DOWN it still scrolls
          the console. It has to be declared rather than handled, because React
          registers touchmove passively and `preventDefault` there does nothing.

          Unlike the mouse, a lift does NOT clear the reading. A finger covers
          the day it is asking about, and a pointer leaving the box means "done
          reading" where lifting a thumb means "let me look". The value that
          stays carries its own date, so it cannot be misread as today.
        */}
        <div
          className="relative min-w-0 flex-1 touch-pan-y"
          onMouseLeave={() => setCursor(null)}
          onMouseMove={(event) => readAt(event.clientX, event.currentTarget.getBoundingClientRect())}
          onTouchStart={(event: React.TouchEvent<HTMLDivElement>) => {
            const touch = event.touches[0];
            if (touch) readAt(touch.clientX, event.currentTarget.getBoundingClientRect());
          }}
          onTouchMove={(event: React.TouchEvent<HTMLDivElement>) => {
            const touch = event.touches[0];
            if (touch) readAt(touch.clientX, event.currentTarget.getBoundingClientRect());
          }}
        >
          {rules.map((rule) => (
            <span
              key={rule.value}
              aria-hidden="true"
              className="absolute inset-x-0 h-px bg-mist-200"
              style={{ top: `${rule.top}%` }}
            />
          ))}

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="relative h-20 w-full rounded outline-none"
            tabIndex={0}
            role="img"
            aria-label={
              peak === 0
                ? `No sessions from ${dayLabel(first)} to ${dayLabel(last)}`
                : `Daily sessions from ${dayLabel(first)} to ${dayLabel(last)}, peak ${peak}. Use the arrow keys to read a day.`
            }
            onFocus={() => setCursor((was) => was ?? series.length - 1)}
            onBlur={() => setCursor(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTo((cursor ?? series.length - 1) + 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTo((cursor ?? series.length - 1) - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                moveTo(0);
              } else if (event.key === "End") {
                event.preventDefault();
                moveTo(series.length - 1);
              }
            }}
          >
            <defs>
              <linearGradient id="c-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--wine-500)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--wine-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#c-spark-fill)" />
            <path
              className="c-spark"
              style={{ "--c-len": length } as React.CSSProperties}
              d={line}
              fill="none"
              stroke="var(--wine-600)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {cursor !== null && active && (
              <>
                <line
                  x1={(cursor / (series.length - 1)) * W}
                  x2={(cursor / (series.length - 1)) * W}
                  y1={PAD_T}
                  y2={H - PAD_B}
                  stroke="var(--wine-500)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                {/* A circle would be an ellipse under this viewBox's
                    non-uniform scale, so the marker is drawn as a stroked dot
                    whose geometry cannot distort. */}
                <line
                  x1={(cursor / (series.length - 1)) * W}
                  x2={(cursor / (series.length - 1)) * W}
                  y1={yFor(active.sessions, scale)}
                  y2={yFor(active.sessions, scale)}
                  stroke="var(--wine-600)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Indented past the axis gutter plus its gap, so the first date sits
          under the start of the line rather than under the numbers. */}
      <div className="ml-12 mt-1 flex justify-between text-[11px] text-slate-550 sm:ml-11">
        <span>{dayLabel(first)}</span>
        <span>{dayLabel(last)}</span>
      </div>
    </figure>
  );
}

/** "2026-08-04" to "4 Aug". Parsed as UTC, because the server bucketed by it. */
function dayLabel(day: string | undefined): string {
  if (!day) return "";
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
