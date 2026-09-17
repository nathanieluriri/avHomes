"use client";

import { useMemo } from "react";
import { qrMatrix } from "./qr";

/**
 * A link as a QR code, drawn as one SVG: plum modules on white, with the three
 * corner eyes rounded and in wine. The white is part of the drawing, so the
 * quiet zone a scanner needs travels with the code wherever it is placed.
 */

/** Modules of quiet zone. The standard asks for four; phone scanners read two. */
const MARGIN = 2.5;

function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

function inEye(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

function draw(value: string): { size: number; modules: string; eyes: [number, number][] } {
  const matrix = qrMatrix(value);
  const size = matrix.length;
  let modules = "";
  matrix.forEach((row, y) => {
    // Runs rather than single squares: a shorter path, and no seams between neighbours.
    for (let x = 0; x < size; x += 1) {
      if (!row[x] || inEye(x, y, size)) continue;
      let run = 1;
      while (x + run < size && row[x + run] && !inEye(x + run, y, size)) run += 1;
      modules += `M${x} ${y}h${run}v1h-${run}z`;
      x += run - 1;
    }
  });
  return {
    size,
    modules,
    eyes: [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ],
  };
}

export function QrCode({
  value,
  size,
  label,
  className = "",
}: {
  value: string;
  /** Rendered width and height in px. */
  size: number;
  /** What the code opens, for a screen reader. */
  label: string;
  className?: string;
}) {
  const art = useMemo(() => draw(value), [value]);
  const box = art.size + MARGIN * 2;

  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${box} ${box}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <rect x={-MARGIN} y={-MARGIN} width={box} height={box} rx={3.2} fill="#ffffff" />
      <path d={art.modules} fill="#1c1214" shapeRendering="crispEdges" />
      {art.eyes.map(([x, y]) => (
        <g key={`${x}-${y}`} fill="#7d2c40">
          <path fillRule="evenodd" d={`${rrect(x, y, 7, 7, 2.2)}${rrect(x + 1, y + 1, 5, 5, 1.3)}`} />
          <path d={rrect(x + 2, y + 2, 3, 3, 0.9)} />
        </g>
      ))}
    </svg>
  );
}
