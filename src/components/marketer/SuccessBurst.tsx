"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/**
 * The scalloped badge grows, then confetti goes off around it.
 *
 * One orchestrated moment, once, on a screen that exists to say a thing went
 * right. Not a loop: confetti that keeps firing turns into wallpaper and the
 * reader stops reading the words underneath it.
 *
 * Canvas rather than a few dozen absolutely positioned divs, because 34 nodes
 * each running their own transform animation is 34 things for the compositor on
 * a mid-range Android, and the whole point is that this frame does not stutter.
 * No library either: the physics here is gravity and drag, which is nine lines.
 *
 * `prefers-reduced-motion` gets the badge and nothing else. Not a slower
 * confetti, no confetti: the setting means "do not throw things across my
 * screen", and honouring it halfway is not honouring it.
 */

/* Deliberately not the wine. The badge is green because it means "done", and
   the confetti picks up the app's own accents so the moment still reads as this
   app rather than as a generic celebration. */
const CONFETTI = ["#5fd3a3", "#ff8fa3", "#ffcf7d", "#c9a9ff", "#7fd1ff", "#ffffff"];
const PIECES = 34;
const GRAVITY = 0.16;
const DRAG = 0.986;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  turn: number;
  colour: string;
  /** Rectangles and discs, so the scatter is not a grid of identical chips. */
  round: boolean;
}

export function SuccessBurst({
  size = 104,
  label = "Done",
}: {
  size?: number;
  /** Read out when the burst lands. The picture alone tells a screen reader nothing. */
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (quiet.matches) {
      setStill(true);
      return;
    }

    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
      // Spread evenly around the badge with a little jitter, so the ring reads
      // as a burst rather than as a clock face.
      const angle = (i / PIECES) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 3.4 + Math.random() * 3.6;
      return {
        x: cx + Math.cos(angle) * (size * 0.34),
        y: cy + Math.sin(angle) * (size * 0.34),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.6,
        size: 4 + Math.random() * 4,
        spin: Math.random() * Math.PI,
        turn: (Math.random() - 0.5) * 0.3,
        colour: CONFETTI[i % CONFETTI.length]!,
        round: i % 3 === 0,
      };
    });

    let frame = 0;
    let raf = 0;
    // The badge finishes growing first, so the confetti reads as caused by it.
    const started = performance.now() + 260;

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      ctx!.clearRect(0, 0, w, h);
      if (now < started) return;

      frame += 1;
      const fade = Math.max(0, 1 - frame / 95);
      if (fade === 0) {
        cancelAnimationFrame(raf);
        return;
      }

      ctx!.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.turn;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.spin);
        ctx!.fillStyle = p.colour;
        if (p.round) {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        }
        ctx!.restore();
      }
      ctx!.globalAlpha = 1;
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div
      className="relative mx-auto grid place-items-center"
      style={{ width: size * 2.6, height: size * 2.6 }}
    >
      {!still && (
        <canvas
          ref={canvas}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      )}

      <div
        className={still ? "m-burst m-burst--still" : "m-burst"}
        style={{ width: size, height: size }}
        role="img"
        aria-label={label}
      >
        <Badge />
        <Check
          className="absolute inset-0 m-auto text-white"
          style={{ width: size * 0.42, height: size * 0.42 }}
          strokeWidth={3}
          aria-hidden
        />
      </div>
    </div>
  );
}

/**
 * The scalloped disc.
 *
 * A twelve-lobed rosette rather than a circle: a plain green circle with a tick
 * is the default success mark every app ships, and the scallop is the one thing
 * that makes this screen recognisably ours at a glance.
 */
function Badge() {
  const lobes = 12;
  const outer = 50;
  const valley = 41;
  const step = (Math.PI * 2) / lobes;

  /* Quadratic lobes, not a polygon. Straight edges between a near and a far
     radius draw a twelve-pointed star; the curve is what makes it a scallop.
     The control radius is solved so each curve's midpoint lands exactly on
     `outer`: a quadratic's midpoint is (P0 + 2C + P2) / 4. */
  const control = 2 * outer - valley * Math.cos(step / 2);
  const at = (r: number, a: number) =>
    `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;

  let d = `M ${at(valley, -Math.PI / 2)}`;
  for (let i = 0; i < lobes; i++) {
    const from = -Math.PI / 2 + i * step;
    d += ` Q ${at(control, from + step / 2)} ${at(valley, from + step)}`;
  }

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <path d={`${d} Z`} fill="#1aa06d" />
    </svg>
  );
}
