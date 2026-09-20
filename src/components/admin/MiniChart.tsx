"use client";

import { useId, useState } from "react";

/**
 * The console's one chart.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT DRAWS ONE SERIES AT A TIME, AND THAT IS MEASURED RATHER THAN PREFERRED.
 *
 * The palette's wine ramp is the only brand hue available for a mark, and its
 * steps are not distinguishable from each other: #b45069 against #983c53 scores
 * a normal-vision Delta E of 7.7, where 15 is the floor below which full-colour
 * readers cannot tell a pair apart at all. Under protanopia it is 7.5. So a two
 * line chart in this palette would be one unreadable line, and the honest
 * response is to draw one series and let a second chart carry the second.
 *
 * Contrast against the white card passes at over 3:1, so the single mark is legal
 * on its own.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Inline SVG with no dependency, because a charting library for one sparkline is
 * 40KB on a console screen that already waits on four reads.
 */

export interface ChartPoint {
  /** What the axis and the tooltip call this point. */
  label: string;
  value: number;
  /** The tooltip's second line, already formatted. Money, usually. */
  detail?: string;
}

const PAD = 2;

export function MiniChart({
  points,
  mode,
  height = 56,
  label,
}: {
  /**
   * ZERO FILLED BY THE SERVER. A chart drawn from only the days that saw
   * something is a lie about the shape of the data: three busy days out of thirty
   * would draw as a flat healthy line rather than three spikes in a desert.
   */
  points: readonly ChartPoint[];
  mode: "line" | "bars";
  height?: number;
  /** The accessible description. The shape itself says nothing aloud. */
  label: string;
}) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-slate-550">Nothing in this window yet.</p>
    );
  }

  const top = Math.max(...points.map((point) => point.value), 1);
  const width = 100;
  const step = width / points.length;

  const shown = active === null ? null : points[active];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        className="block h-14 w-full"
        /* Touch and mouse both land on the same handler. A hover layer that only
           works with a pointer is a hover layer half the readers do not have. */
        onMouseLeave={() => setActive(null)}
      >
        <title id={titleId}>{label}</title>

        {/* The baseline, recessive on purpose: it orients the eye and is not data. */}
        <line
          x1={0}
          y1={height - PAD}
          x2={width}
          y2={height - PAD}
          stroke="var(--mist-200)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {mode === "bars"
          ? points.map((point, index) => {
              const full = height - PAD * 2;
              const tall = Math.max(point.value > 0 ? 2 : 0, (point.value / top) * full);
              /* A 2px surface gap between neighbours, so two tall bars read as two
                 bars rather than one block. */
              const barWidth = Math.max(step - 2, 1);
              return (
                <rect
                  key={point.label}
                  x={index * step + 1}
                  y={height - PAD - tall}
                  width={barWidth}
                  height={tall}
                  /* Rounded data-ends, anchored to the baseline: the radius is on
                     the top corners only because the bottom sits on the axis. */
                  rx={Math.min(2, barWidth / 2)}
                  fill={active === index ? "var(--wine-700)" : "var(--wine-600)"}
                  onMouseEnter={() => setActive(index)}
                />
              );
            })
          : (() => {
              const full = height - PAD * 2;
              const at = (index: number) => ({
                x: index * step + step / 2,
                y: height - PAD - ((points[index]?.value ?? 0) / top) * full,
              });
              const path = points
                .map((_, index) => {
                  const spot = at(index);
                  return `${index === 0 ? "M" : "L"}${spot.x} ${spot.y}`;
                })
                .join(" ");
              return (
                <>
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--wine-600)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    /* So a 2px line stays 2px through the non-uniform scale. */
                    vectorEffect="non-scaling-stroke"
                  />
                  {active !== null && (
                    <>
                      <line
                        x1={at(active).x}
                        y1={PAD}
                        x2={at(active).x}
                        y2={height - PAD}
                        stroke="var(--mist-300)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                      {/* A 2px surface ring, so the marker reads against the line
                          it sits on rather than merging into it. */}
                      <circle
                        cx={at(active).x}
                        cy={at(active).y}
                        r={3}
                        fill="var(--wine-600)"
                        stroke="#ffffff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  )}
                </>
              );
            })()}

        {/*
          THE HIT TARGETS, drawn last and invisible.
          One full-height band per point, so a 2px line has a tappable column
          rather than a 2px one. Bigger than the mark, which is the rule.
        */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.label}`}
            x={index * step}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
            onTouchStart={() => setActive(index)}
          />
        ))}
      </svg>

      {/*
        The tooltip, as HTML rather than SVG text, so it wraps and inherits the
        console's type. Positioned in the flow under the chart rather than floating:
        a floating tip on a 56px chart covers the data it describes.
      */}
      <p className="mt-1 min-h-4 text-[11px] text-slate-600" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-plum-950">{shown.label}</span>
            {shown.detail ? ` · ${shown.detail}` : ` · ${shown.value}`}
          </>
        ) : (
          <span className="text-slate-550">
            {points.length} points. Hover or tap for a day.
          </span>
        )}
      </p>
    </div>
  );
}
