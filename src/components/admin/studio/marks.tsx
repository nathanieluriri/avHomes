import type { MarkKind, NoteMark } from "@avhomes/contracts";

/**
 * The marks, drawn once, for every size they are drawn at.
 *
 * The same note appears as a sidebar thumbnail, in the review pane and full
 * screen. Two things make that work from one component:
 *
 *  - the points are stored NORMALISED to 0..1 and multiplied by the shot's own
 *    pixel dimensions here, so the SVG viewBox matches the image exactly and the
 *    browser scales both together;
 *  - `vector-effect: non-scaling-stroke` keeps the line the same visual weight
 *    at every scale. Without it a circle drawn at 3px on a 1440px shot is a
 *    hairline in a 200px thumbnail and a fat band on a 4K monitor.
 */

export const MARK_COLORS = [
  { value: "#e11d48", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#0b1a33", label: "Ink" },
] as const;

export const DEFAULT_COLOR = MARK_COLORS[0].value;

export function MarkLayer({
  marks,
  width,
  height,
  className = "",
}: {
  marks: readonly NoteMark[];
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      {/*
        One shared arrowhead per colour would need a marker id per colour and a
        defs block that outlives the marks it serves. The head is drawn as a
        plain path instead, in `arrowPath`, which keeps a mark self contained.
      */}
      {marks.map((mark, index) => (
        <MarkShape key={index} mark={mark} width={width} height={height} />
      ))}
    </svg>
  );
}

function MarkShape({ mark, width, height }: { mark: NoteMark; width: number; height: number }) {
  const p = (i: number): [number, number] => [
    (mark.points[i * 2] ?? 0) * width,
    (mark.points[i * 2 + 1] ?? 0) * height,
  ];
  const common = {
    stroke: mark.color,
    strokeWidth: 3,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (mark.kind === "pen") {
    const d = mark.points
      .reduce<string[]>((acc, _, i) => {
        if (i % 2 !== 0) return acc;
        const [x, y] = p(i / 2);
        acc.push(`${acc.length === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
        return acc;
      }, [])
      .join(" ");
    return <path d={d} {...common} />;
  }

  const [x1, y1] = p(0);
  const [x2, y2] = p(1);

  if (mark.kind === "ellipse") {
    return (
      <ellipse
        cx={(x1 + x2) / 2}
        cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2}
        ry={Math.abs(y2 - y1) / 2}
        {...common}
      />
    );
  }

  if (mark.kind === "rect") {
    return (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        rx={4}
        {...common}
      />
    );
  }

  return <path d={arrowPath(x1, y1, x2, y2)} {...common} />;
}

/**
 * A line plus two barbs, sized in SHOT pixels rather than as a fraction of the
 * line's own length.
 *
 * A head proportional to the line looks right on a long arrow and becomes an
 * invisible speck on a short one, which is the arrow somebody draws when they
 * are pointing at something small and precise.
 */
function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 14;
  const spread = Math.PI / 7;
  const bx = x2 - head * Math.cos(angle - spread);
  const by = y2 - head * Math.sin(angle - spread);
  const cx = x2 - head * Math.cos(angle + spread);
  const cy = y2 - head * Math.sin(angle + spread);
  return `M${x1},${y1} L${x2},${y2} M${bx},${by} L${x2},${y2} L${cx},${cy}`;
}

export const TOOLS: { kind: MarkKind; label: string; hint: string }[] = [
  { kind: "ellipse", label: "Circle", hint: "Ring the thing you mean" },
  { kind: "arrow", label: "Arrow", hint: "Point at it" },
  { kind: "rect", label: "Box", hint: "Frame a whole area" },
  { kind: "pen", label: "Pen", hint: "Draw freehand" },
];
