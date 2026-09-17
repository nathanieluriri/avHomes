import { useId, type ReactNode } from "react";

/**
 * The marketer app's 3D icons: small glossy objects drawn as inline SVG.
 *
 * One material system, one light (top left) and one kind of contact shadow, so
 * the set reads as a family. Ids are namespaced per instance with useId: a
 * screen renders many of these, and Safari resolves a duplicated gradient id to
 * the first definition in the document.
 */

export interface IconProps {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  /** Names the icon for assistive tech. Without it the icon is decorative. */
  title?: string;
}

/* ═══ MATERIALS ════════════════════════════════════════════════════════════ */

type Tone = { hi: string; light: string; base: string; shade: string; deep: string };

/** Primary. Held in the brand's pink red family, never violet. */
const WINE: Tone = { hi: "#ffc2d1", light: "#f07a9a", base: "#c93d64", shade: "#8a2342", deep: "#4d1426" };
/** Wine ceramic one step paler: figures standing behind, columns, steps. */
const ROSE: Tone = { hi: "#fff1f5", light: "#ffc2d1", base: "#f07a9a", shade: "#c93d64", deep: "#8a2342" };
/** Near white ceramic: paper, walls, calendar pages. */
const PAPER: Tone = { hi: "#ffffff", light: "#fff4f7", base: "#ffdbe4", shade: "#eeaabd", deep: "#c46e88" };
const GOLD: Tone = { hi: "#fff3c8", light: "#f5cf73", base: "#d99a3a", shade: "#b47828", deep: "#8f5a1b" };
const LILAC: Tone = { hi: "#ffffff", light: "#ece6ff", base: "#b9aaf0", shade: "#9383dc", deep: "#6f5fb8" };
const STEEL: Tone = { hi: "#f4f5f8", light: "#dde0e8", base: "#c9cdd8", shade: "#8b90a3", deep: "#4b5063" };

const TONES = { wine: WINE, rose: ROSE, paper: PAPER, gold: GOLD, lilac: LILAC, steel: STEEL };
type ToneName = keyof typeof TONES;

/* ═══ KIT ══════════════════════════════════════════════════════════════════ */

type Kit = { id: (name: string) => string; url: (name: string) => string };

/** Ids unique to this instance. useId's punctuation is stripped so url(#...) always parses. */
function useKit(): Kit {
  const ns = `i3d${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return { id: (name) => `${ns}-${name}`, url: (name) => `url(#${ns}-${name})` };
}

/** Two decimals keeps the markup short and identical on server and client. */
const n2 = (v: number) => Math.round(v * 100) / 100;

function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n2(x + r)} ${y}H${n2(x + w - r)}A${r} ${r} 0 0 1 ${n2(x + w)} ${n2(y + r)}` +
    `V${n2(y + h - r)}A${r} ${r} 0 0 1 ${n2(x + w - r)} ${n2(y + h)}H${n2(x + r)}` +
    `A${r} ${r} 0 0 1 ${x} ${n2(y + h - r)}V${n2(y + r)}A${r} ${r} 0 0 1 ${n2(x + r)} ${y}Z`
  );
}

function disc(cx: number, cy: number, r: number): string {
  return `M${n2(cx - r)} ${cy}A${r} ${r} 0 1 0 ${n2(cx + r)} ${cy}A${r} ${r} 0 1 0 ${n2(cx - r)} ${cy}Z`;
}

/** Part of a circle, clockwise from `from` to `to` degrees, 0 at three o'clock. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = (from * Math.PI) / 180;
  const b = (to * Math.PI) / 180;
  return (
    `M${n2(cx + r * Math.cos(a))} ${n2(cy + r * Math.sin(a))}` +
    `A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${n2(cx + r * Math.cos(b))} ${n2(cy + r * Math.sin(b))}`
  );
}

function ToneDefs({ k, name }: { k: Kit; name: ToneName }) {
  const t = TONES[name];
  return (
    <>
      {/* Rounded bodies: light pools top left, core shadow bottom right. */}
      <radialGradient id={k.id(`${name}-ball`)} cx="0.42" cy="0.38" r="0.7" fx="0.3" fy="0.24">
        <stop offset="0" stopColor={t.hi} />
        <stop offset="0.28" stopColor={t.light} />
        <stop offset="0.68" stopColor={t.base} />
        <stop offset="1" stopColor={t.shade} />
      </radialGradient>
      <linearGradient id={k.id(`${name}-face`)} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor={t.light} />
        <stop offset="0.55" stopColor={t.base} />
        <stop offset="1" stopColor={t.shade} />
      </linearGradient>
      <linearGradient id={k.id(`${name}-top`)} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={t.hi} />
        <stop offset="1" stopColor={t.light} />
      </linearGradient>
      <linearGradient id={k.id(`${name}-side`)} x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0" stopColor={t.shade} />
        <stop offset="1" stopColor={t.deep} />
      </linearGradient>
      {/* A swept box: its top strip lands in the light half, its right strip in the dark half. */}
      <linearGradient id={k.id(`${name}-box`)} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={t.light} />
        <stop offset="0.45" stopColor={t.base} />
        <stop offset="0.55" stopColor={t.shade} />
        <stop offset="1" stopColor={t.deep} />
      </linearGradient>
      <linearGradient id={k.id(`${name}-cyl`)} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={t.base} />
        <stop offset="0.22" stopColor={t.light} />
        <stop offset="0.5" stopColor={t.base} />
        <stop offset="0.85" stopColor={t.shade} />
        <stop offset="1" stopColor={t.deep} />
      </linearGradient>
      {/* Strong enough to see on the dark ground; Rim clips it inside the silhouette. */}
      <linearGradient id={k.id(`${name}-rim`)} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0.55" stopColor={t.hi} stopOpacity="0" />
        <stop offset="1" stopColor={t.hi} stopOpacity="0.7" />
      </linearGradient>
    </>
  );
}

function Defs({ k, tones, children }: { k: Kit; tones: readonly ToneName[]; children?: ReactNode }) {
  return (
    <defs>
      {/* One blur per icon, sized to the icon rather than to each shape it softens. */}
      <filter id={k.id("soft")} filterUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
        <feGaussianBlur stdDeviation="0.9" />
      </filter>
      <radialGradient id={k.id("shadow")}>
        <stop offset="0" stopColor="#000" stopOpacity="0.35" />
        <stop offset="0.5" stopColor="#000" stopOpacity="0.18" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={k.id("gloss")} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      {tones.map((name) => (
        <ToneDefs key={name} k={k} name={name} />
      ))}
      {children}
    </defs>
  );
}

/** `box` crops the 64 unit canvas to the object, so every icon fills its circle alike. */
function Svg({
  k,
  box = [0, 0, 64],
  size = 64,
  className,
  title,
  children,
}: IconProps & { k: Kit; box?: readonly [number, number, number]; children: ReactNode }) {
  return (
    <svg
      viewBox={`${box[0]} ${box[1]} ${box[2]} ${box[2]}`}
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? k.id("title") : undefined}
      focusable="false"
    >
      {title ? <title id={k.id("title")}>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Contact shadow: a wide soft pool plus a tighter core where the object touches down. */
function Ground({ k, cx = 32, cy = 57, rx = 22, ry = 3.4 }: { k: Kit; cx?: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <g fill={k.url("shadow")}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
      <ellipse cx={cx} cy={n2(cy - ry * 0.15)} rx={n2(rx * 0.6)} ry={n2(ry * 0.55)} />
    </g>
  );
}

/**
 * Fakes thickness: the face repeated along one short vector, farthest copy first.
 * Steps stay under a third of a unit, or rounded corners show a staircase at 96px.
 */
function Sweep({ d, dx, dy, fill, at }: { d: string; dx: number; dy: number; fill: string; at?: string }) {
  const n = Math.max(3, Math.ceil(Math.hypot(dx, dy) / 0.3));
  const copies: ReactNode[] = [];
  for (let i = n; i >= 1; i -= 1) {
    const move = `translate(${n2((dx * i) / n)} ${n2((dy * i) / n)})`;
    copies.push(<path key={i} d={d} transform={at ? `${move} ${at}` : move} />);
  }
  return <g fill={fill}>{copies}</g>;
}

/**
 * Rim light on the shadow side, clipped inside the silhouette. Centred on the
 * edge, half of it would lie on the ground as a pale halo and read as an outline.
 */
function Rim({ k, name, d, tone, at, width = 1.1 }: { k: Kit; name: string; d: string; tone: ToneName; at?: string; width?: number }) {
  return (
    <>
      <clipPath id={k.id(`rim-${name}`)}>
        <path d={d} transform={at} />
      </clipPath>
      <g clipPath={k.url(`rim-${name}`)}>
        <path d={d} transform={at} fill="none" stroke={k.url(`${tone}-rim`)} strokeWidth={width * 2} strokeLinejoin="round" />
      </g>
    </>
  );
}

/**
 * Specular light: white, blurred, and clipped to its surface so it never haloes
 * past the edge. The filter sits on an untransformed group because its region is
 * in icon units; children carry their own transforms.
 */
function Glint({ k, clip, children }: { k: Kit; clip?: string; children: ReactNode }) {
  const light = (
    <g fill="#fff" filter={k.url("soft")}>
      {children}
    </g>
  );
  return clip ? <g clipPath={k.url(clip)}>{light}</g> : light;
}

/* ═══ ICONS ════════════════════════════════════════════════════════════════ */

const DEAL_BOARD = rrect(11, 7, 32, 44, 5);
const DEAL_SHEET = rrect(15, 13.5, 24, 33, 2.5);
const DEAL_CLIP =
  "M23.5 4.5H30.5A2.5 2.5 0 0 1 33 7V9.5H36A2 2 0 0 1 38 11.5V14H16V11.5A2 2 0 0 1 18 9.5H21V7A2.5 2.5 0 0 1 23.5 4.5Z";
const DEAL_SEAL = disc(44, 43, 11);
const DEAL_TILT = "rotate(-8 27 29)";
const DEAL_CHECK = "M39.2 43.2 42.7 46.7 49.2 40.2";

/** A wine clipboard with a gold seal: a deal that went through. */
export function IconDeals(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["wine", "paper", "gold"]}>
        <clipPath id={k.id("board")}>
          <path d={DEAL_BOARD} transform={DEAL_TILT} />
        </clipPath>
        <clipPath id={k.id("seal")}>
          <path d={DEAL_SEAL} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={28} cy={56.5} rx={21} />
      <Ground k={k} cx={46} cy={57.5} rx={11} ry={2.4} />
      <Sweep d={DEAL_BOARD} dx={1.3} dy={2.6} fill={k.url("wine-side")} at={DEAL_TILT} />
      <g transform={DEAL_TILT}>
        <Rim k={k} name="board" d={DEAL_BOARD} tone="wine" at="translate(1.3 2.6)" width={1.2} />
        <path d={DEAL_BOARD} fill={k.url("wine-face")} />
        <path d={DEAL_SHEET} transform="translate(0.6 1.1)" fill={WINE.deep} opacity="0.4" />
        <path d={DEAL_SHEET} fill={k.url("paper-face")} />
        <path d="M19.5 21.5H34.5M19.5 27.5H32M19.5 33.5H27" stroke={WINE.light} strokeWidth="2.3" strokeLinecap="round" opacity="0.65" />
        <path d={DEAL_CLIP} transform="translate(0.5 2.2)" fill={WINE.deep} opacity="0.3" />
        <Sweep d={DEAL_CLIP} dx={0.5} dy={1.4} fill={k.url("gold-side")} />
        <path d={DEAL_CLIP} fill={k.url("gold-face")} />
        <path d="M17 12.6H37" stroke={GOLD.hi} strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
        <circle cx="27" cy="7.4" r="1.5" fill={GOLD.deep} />
      </g>
      <g clipPath={k.url("board")}>
        <path d={DEAL_BOARD} transform={DEAL_TILT} fill="none" stroke={k.url("gloss")} strokeWidth="2.2" />
      </g>
      <Glint k={k} clip="board">
        <g transform={DEAL_TILT}>
          <ellipse cx="13" cy="28" rx="1.3" ry="12" opacity="0.5" />
          <ellipse cx="15.5" cy="10.5" rx="3" ry="1.3" transform="rotate(-35 15.5 10.5)" opacity="0.7" />
        </g>
      </Glint>

      <Sweep d={DEAL_SEAL} dx={0.9} dy={2.2} fill={k.url("gold-side")} />
      <Rim k={k} name="seal" d={DEAL_SEAL} tone="gold" at="translate(0.9 2.2)" width={1.2} />
      <path d={DEAL_SEAL} fill={k.url("gold-ball")} />
      <circle cx="44" cy="43" r="8.2" fill="none" stroke={GOLD.hi} strokeWidth="0.9" opacity="0.6" transform="translate(0.4 0.6)" />
      <circle cx="44" cy="43" r="8.2" fill="none" stroke={GOLD.deep} strokeWidth="0.9" opacity="0.45" />
      <Glint k={k} clip="seal">
        <ellipse cx="39.5" cy="37.5" rx="4.2" ry="2" transform="rotate(-40 39.5 37.5)" opacity="0.85" />
      </Glint>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={DEAL_CHECK} transform="translate(0.4 1)" stroke={GOLD.deep} strokeWidth="3.4" opacity="0.5" />
        <path d={DEAL_CHECK} stroke="#fff" strokeWidth="3.2" />
      </g>
    </Svg>
  );
}

/** A clay figure's body: a dome on top, a softly squared base. */
function bust(cx: number, top: number, w: number, bottom: number): string {
  const r = w / 2;
  const b = 3.5;
  return (
    `M${n2(cx - r)} ${n2(bottom - b)}V${n2(top + r)}A${r} ${r} 0 0 1 ${n2(cx + r)} ${n2(top + r)}` +
    `V${n2(bottom - b)}A${b} ${b} 0 0 1 ${n2(cx + r - b)} ${bottom}H${n2(cx - r + b)}` +
    `A${b} ${b} 0 0 1 ${n2(cx - r)} ${n2(bottom - b)}Z`
  );
}

const TEAM_L = bust(16.5, 31, 20, 50);
const TEAM_R = bust(47.5, 31, 20, 50);
const TEAM_M = bust(32, 27, 25, 54);

function Figure({
  k,
  tone,
  body,
  clip,
  cx,
  headY,
  headR,
  top,
  w,
}: {
  k: Kit;
  tone: "wine" | "rose";
  body: string;
  clip: string;
  cx: number;
  headY: number;
  headR: number;
  top: number;
  w: number;
}) {
  const hx = n2(cx - headR * 0.34);
  const hy = n2(headY - headR * 0.42);
  const sx = n2(cx - w * 0.25);
  const sy = n2(top + w * 0.2);
  return (
    <>
      <path d={body} fill={k.url(`${tone}-body`)} />
      {/* The head's shadow on the shoulders is what separates the two at 40px. */}
      <g clipPath={k.url(clip)}>
        <g filter={k.url("soft")}>
          <ellipse cx={cx} cy={top + 0.6} rx={n2(headR * 0.9)} ry="2.2" fill={TONES[tone].deep} opacity="0.4" />
        </g>
      </g>
      <Rim k={k} name={`${clip}-rim`} d={body} tone={tone} width={1.2} />
      <Glint k={k} clip={clip}>
        <ellipse cx={sx} cy={sy} rx={n2(w * 0.15)} ry={n2(w * 0.065)} transform={`rotate(-50 ${sx} ${sy})`} opacity="0.6" />
      </Glint>
      <circle cx={cx} cy={headY} r={headR} fill={k.url(`${tone}-ball`)} />
      <circle cx={cx} cy={headY} r={n2(headR - 0.55)} fill="none" stroke={k.url(`${tone}-rim`)} strokeWidth="1.1" />
      <Glint k={k}>
        <ellipse cx={hx} cy={hy} rx={n2(headR * 0.4)} ry={n2(headR * 0.22)} transform={`rotate(-35 ${hx} ${hy})`} opacity="0.85" />
      </Glint>
    </>
  );
}

/** Three clay figures, the one in front taller and in wine. */
export function IconTeam(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[1, 1.5, 62]} {...props}>
      <Defs k={k} tones={["wine", "rose"]}>
        {(["wine", "rose"] as const).map((name) => (
          // A body is taller than a head, so its light falls off further before the core shadow.
          <radialGradient key={name} id={k.id(`${name}-body`)} cx="0.38" cy="0.3" r="0.85" fx="0.3" fy="0.16">
            <stop offset="0" stopColor={TONES[name].hi} />
            <stop offset="0.2" stopColor={TONES[name].light} />
            <stop offset="0.52" stopColor={TONES[name].base} />
            <stop offset="0.84" stopColor={TONES[name].shade} />
            <stop offset="1" stopColor={TONES[name].deep} />
          </radialGradient>
        ))}
        <clipPath id={k.id("fig-l")}>
          <path d={TEAM_L} />
        </clipPath>
        <clipPath id={k.id("fig-r")}>
          <path d={TEAM_R} />
        </clipPath>
        <clipPath id={k.id("fig-m")}>
          <path d={TEAM_M} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={32} cy={55.5} rx={27} ry={3.4} />
      <Figure k={k} tone="rose" body={TEAM_L} clip="fig-l" cx={16.5} headY={21.5} headR={6.8} top={31} w={20} />
      <Figure k={k} tone="rose" body={TEAM_R} clip="fig-r" cx={47.5} headY={21.5} headR={6.8} top={31} w={20} />
      {/* The front figure's shadow falls right, onto the one behind it. */}
      <g clipPath={k.url("fig-r")}>
        <g filter={k.url("soft")}>
          <path d={TEAM_M} transform="translate(2.6 0.8)" fill={WINE.deep} opacity="0.45" />
        </g>
      </g>
      <g clipPath={k.url("fig-l")}>
        <g filter={k.url("soft")}>
          <path d={TEAM_M} transform="translate(-1.2 0.6)" fill={WINE.deep} opacity="0.25" />
        </g>
      </g>
      <Figure k={k} tone="wine" body={TEAM_M} clip="fig-m" cx={32} headY={15.5} headR={8.4} top={27} w={25} />
    </Svg>
  );
}

const COIN_SIDE = "M12 20V43A20 9.5 0 0 0 52 43V20A20 9.5 0 0 0 12 20Z";
const COIN_BAND = "M11.75 28.4A20.25 9.6 0 0 0 52.25 28.4V34.6A20.25 9.6 0 0 1 11.75 34.6Z";

/** The naira sign as it lies on the coin's top face, foreshortened. */
function FlatNaira({ stroke }: { stroke: string }) {
  return (
    <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M26.5 24V16L37.5 24V16" strokeWidth="2.3" />
      <path d="M23.8 19H40.2M23.8 21.4H40.2" strokeWidth="1.3" />
    </g>
  );
}

/** A short stack of gold coins in a wine band, naira on top. */
export function IconMoney(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[5.75, 7.25, 52.5]} {...props}>
      <Defs k={k} tones={["gold", "wine"]}>
        <clipPath id={k.id("side")}>
          <path d={COIN_SIDE} />
        </clipPath>
        <clipPath id={k.id("top")}>
          <ellipse cx="32" cy="20" rx="20" ry="9.5" />
        </clipPath>
      </Defs>
      <Ground k={k} cx={32} cy={53.5} rx={23} ry={3.6} />
      <path d={COIN_SIDE} fill={k.url("gold-cyl")} />
      <g fill="none" strokeWidth="0.8">
        <path d="M12 25.75A20 9.5 0 0 0 52 25.75M12 37.25A20 9.5 0 0 0 52 37.25" stroke={GOLD.deep} opacity="0.6" />
        <path d="M12 26.65A20 9.5 0 0 0 52 26.65M12 38.15A20 9.5 0 0 0 52 38.15" stroke={GOLD.hi} opacity="0.45" />
      </g>
      <path d={COIN_BAND} fill={k.url("wine-cyl")} />
      <path d="M11.75 28.4A20.25 9.6 0 0 0 52.25 28.4" fill="none" stroke={WINE.hi} strokeWidth="0.7" opacity="0.55" />
      <Rim k={k} name="side" d={COIN_SIDE} tone="gold" width={1.2} />
      <Glint k={k} clip="side">
        <ellipse cx="18" cy="41" rx="1.5" ry="9" opacity="0.6" />
      </Glint>
      <ellipse cx="32" cy="20" rx="20" ry="9.5" fill={k.url("gold-top")} />
      <ellipse cx="32" cy="20" rx="16" ry="7.6" fill="none" stroke={GOLD.base} strokeWidth="1" opacity="0.7" />
      <ellipse cx="32" cy="20.7" rx="16" ry="7.6" fill="none" stroke={GOLD.hi} strokeWidth="0.7" opacity="0.8" />
      <g transform="translate(0.35 0.7)" opacity="0.8">
        <FlatNaira stroke={GOLD.hi} />
      </g>
      <FlatNaira stroke={GOLD.deep} />
      <path d="M12 20A20 9.5 0 0 0 52 20" fill="none" stroke={GOLD.hi} strokeWidth="0.9" opacity="0.85" />
      <Glint k={k} clip="top">
        <ellipse cx="23" cy="14.5" rx="7" ry="2.2" transform="rotate(-10 23 14.5)" opacity="0.7" />
      </Glint>
    </Svg>
  );
}

const PLANE_TOP = "M56 9L7 30.5L26.5 37Z";
const PLANE_WING = "M56 9L26.5 37L34 54.5Z";
const PLANE_KEEL = "M26.5 37L34 54.5L24.5 46Z";
const PLANE_TRAIL = "M25.5 42C19.5 48.5 11.5 53 2 55.5C1 55.8 1 56.9 2.2 56.9C12 57.2 22.5 54.5 31 48.5C32.5 45.5 28.5 40.5 25.5 42Z";
const PLANE_TRAIL_SHINE = "M24.2 44.6C18.6 49.6 11.6 53.1 4.6 55.2";
const PLANE_TRAIL_FOOT = "M30 49.6C22 54.9 12.6 57.1 4.2 56.9";
const PLANE_WISP = "M16.5 35.8C12 39.2 7.5 41.4 2.5 42.6C8 43.9 13.5 42.8 19 39.8Z";
const PLANE_SPARK = "M9.5 44.2Q9.5 47 12.3 47Q9.5 47 9.5 49.8Q9.5 47 6.7 47Q9.5 47 9.5 44.2Z";

/** A wine paper plane in flight, trailing lilac glass. */
export function IconInvite(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["wine", "lilac"]}>
        {/* The trail is glass that thins to nothing, so it fades along its own length. */}
        <linearGradient id={k.id("trail")} gradientUnits="userSpaceOnUse" x1="29" y1="45.5" x2="3" y2="58">
          <stop offset="0" stopColor={LILAC.light} stopOpacity="0.95" />
          <stop offset="0.4" stopColor={LILAC.base} stopOpacity="0.8" />
          <stop offset="0.8" stopColor={LILAC.base} stopOpacity="0.4" />
          <stop offset="1" stopColor={LILAC.base} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={k.id("wisp")} gradientUnits="userSpaceOnUse" x1="18.5" y1="38" x2="2.5" y2="43.5">
          <stop offset="0" stopColor={LILAC.light} stopOpacity="0.7" />
          <stop offset="0.6" stopColor={LILAC.base} stopOpacity="0.35" />
          <stop offset="1" stopColor={LILAC.base} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={k.id("trail-edge")} gradientUnits="userSpaceOnUse" x1="28" y1="43" x2="3" y2="58">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={k.id("wing")} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={WINE.base} />
          <stop offset="0.6" stopColor={WINE.shade} />
          <stop offset="1" stopColor={WINE.deep} />
        </linearGradient>
        <clipPath id={k.id("top")}>
          <path d={PLANE_TOP} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={34} cy={59.5} rx={15} ry={2.4} />
      <path d={PLANE_WISP} fill={k.url("wisp")} />
      <path d={PLANE_TRAIL} fill={k.url("trail")} />
      {/* Glass, not a blade: a soft reflection inside the top edge and a darker refracted foot. */}
      <path d={PLANE_TRAIL_FOOT} fill="none" stroke={LILAC.deep} strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
      <g filter={k.url("soft")}>
        <path d={PLANE_TRAIL_SHINE} fill="none" stroke={k.url("trail-edge")} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path d={PLANE_SPARK} fill="#fff" opacity="0.9" />
      <g strokeWidth="2.4" strokeLinejoin="round">
        <path d={PLANE_KEEL} fill={WINE.deep} stroke={WINE.deep} />
        <path d={PLANE_WING} fill={k.url("wing")} stroke={k.url("wing")} />
        <path d={PLANE_TOP} fill={k.url("wine-face")} stroke={k.url("wine-face")} />
      </g>
      <g clipPath={k.url("top")}>
        <path d={PLANE_TOP} fill="none" stroke={k.url("gloss")} strokeWidth="2.2" />
      </g>
      <Glint k={k} clip="top">
        <ellipse cx="27" cy="25.5" rx="12" ry="2.2" transform="rotate(-23.7 27 25.5)" opacity="0.6" />
      </Glint>
      <path d="M54.5 10.4 27.4 35.9" stroke={WINE.hi} strokeWidth="0.9" strokeLinecap="round" opacity="0.75" />
    </Svg>
  );
}

const HOUSE_FRONT = "M8 54V35L19 22L30 35V54Z";
const HOUSE_SIDE = "M30 35V54L45 47V28Z";
const HOUSE_ROOF = "M19 20.3L34 13.3L48.5 30.5L33.5 37.5Z";
const HOUSE_EAVE = "M33.5 37.5L48.5 30.5L45 32.5L30 39.5Z";
const HOUSE_FASCIA = "M4.5 37.5L19 20.3L33.5 37.5L30 39.5L19 26.5L8 39.5Z";
const HOUSE_WINDOW = "M34.5 38.9L40.5 36.1V43.1L34.5 45.9Z";

/** A small ceramic house: wine roof, pale walls, a lit window. */
export function IconListings(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[-0.5, 6.5, 55]} {...props}>
      <Defs k={k} tones={["wine", "paper", "gold"]}>
        <clipPath id={k.id("roof")}>
          <path d={HOUSE_ROOF} />
        </clipPath>
        <clipPath id={k.id("front")}>
          <path d={HOUSE_FRONT} />
        </clipPath>
      </Defs>
      <g transform="rotate(-14 27.5 54.5)">
        <Ground k={k} cx={27.5} cy={54.5} rx={23} ry={3.8} />
      </g>
      <path d={HOUSE_SIDE} fill={k.url("paper-side")} />
      <g filter={k.url("soft")}>
        <ellipse cx="37.5" cy="41" rx="5.5" ry="5.5" fill={GOLD.light} opacity="0.55" />
      </g>
      <path d={HOUSE_WINDOW} fill={k.url("gold-ball")} stroke={GOLD.light} strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M37.5 37.5V44.5M34.5 42.4 40.5 39.6" stroke={PAPER.light} strokeWidth="0.9" opacity="0.9" />
      <Rim k={k} name="side" d={HOUSE_SIDE} tone="paper" width={1.2} />
      <path d={HOUSE_FRONT} fill={k.url("paper-face")} />
      <g clipPath={k.url("front")}>
        <path d={HOUSE_FRONT} fill="none" stroke={k.url("gloss")} strokeWidth="2" />
      </g>
      <path d="M15.5 54V47.5A3.5 3.5 0 0 1 22.5 47.5V54Z" fill={k.url("wine-face")} />
      <circle cx="21" cy="50.8" r="0.8" fill={GOLD.light} />
      <g strokeWidth="1.6" strokeLinejoin="round">
        <path d={HOUSE_EAVE} fill={k.url("wine-side")} stroke={k.url("wine-side")} />
        <path d={HOUSE_ROOF} fill={k.url("wine-face")} stroke={k.url("wine-face")} />
        <path d={HOUSE_FASCIA} fill={k.url("wine-face")} stroke={k.url("wine-face")} />
      </g>
      <path d="M19.4 20.8 33.3 37.1" stroke={WINE.hi} strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <Glint k={k} clip="roof">
        <path d="M20.5 21 34.2 14.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      </Glint>
      {/* The chimney sits on the roof plane, so both of its lower edges follow the slope. */}
      <g strokeWidth="0.6" strokeLinejoin="round">
        <path d="M34.6 13 37.6 11.6V22.03L34.6 23.43Z" fill={k.url("wine-side")} stroke={k.url("wine-side")} />
        <path d="M30.6 13H34.6V23.43L30.6 18.69Z" fill={k.url("wine-face")} stroke={k.url("wine-face")} />
        <path d="M30.6 13H34.6L37.6 11.6H33.6Z" fill={WINE.light} stroke={WINE.light} />
      </g>
      <path d="M31.9 12.6H34.2L35.6 12H33.3Z" fill={WINE.deep} />
      <Glint k={k}>
        <path d="M7.5 36.6 18.4 23.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </Glint>
    </Svg>
  );
}

/** A glossy lifebuoy, wine and white. */
export function IconHelp(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[4, 4.5, 56]} {...props}>
      <Defs k={k} tones={["wine"]}>
        {/* Outer half of the tube faces the light top left, inner half faces it bottom right. */}
        <linearGradient id={k.id("out")} gradientUnits="userSpaceOnUse" x1="13" y1="10.5" x2="51" y2="48.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.55" stopColor={WINE.deep} stopOpacity="0" />
          <stop offset="1" stopColor={WINE.deep} stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={k.id("in")} gradientUnits="userSpaceOnUse" x1="13" y1="10.5" x2="51" y2="48.5">
          <stop offset="0" stopColor={WINE.deep} stopOpacity="0.55" />
          <stop offset="0.5" stopColor={WINE.deep} stopOpacity="0" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id={k.id("tube")} gradientUnits="userSpaceOnUse" cx="32" cy="29.5" r="22.5">
          <stop offset="0.42" stopColor={WINE.deep} stopOpacity="0.5" />
          <stop offset="0.52" stopColor={WINE.deep} stopOpacity="0.12" />
          <stop offset="0.62" stopColor={WINE.deep} stopOpacity="0" />
          <stop offset="0.8" stopColor={WINE.deep} stopOpacity="0" />
          <stop offset="0.92" stopColor={WINE.deep} stopOpacity="0.22" />
          <stop offset="1" stopColor={WINE.deep} stopOpacity="0.5" />
        </radialGradient>
      </Defs>
      <Ground k={k} cx={32} cy={56.5} rx={19} ry={3} />
      <g fill="none">
        <circle cx="32" cy="29.5" r="16" stroke={PAPER.light} strokeWidth="13" />
        <circle
          cx="32"
          cy="29.5"
          r="16"
          stroke={WINE.base}
          strokeWidth="13"
          pathLength={8}
          strokeDasharray="1 1"
          transform="rotate(22.5 32 29.5)"
        />
        <circle cx="32" cy="29.5" r="19.25" stroke={k.url("out")} strokeWidth="6.7" />
        <circle cx="32" cy="29.5" r="12.75" stroke={k.url("in")} strokeWidth="6.7" />
        <circle cx="32" cy="29.5" r="16" stroke={k.url("tube")} strokeWidth="13" />
        <path d={arc(32, 29.5, 22, 10, 100)} stroke={WINE.hi} strokeWidth="1" opacity="0.5" />
      </g>
      <Glint k={k}>
        <g fill="none" stroke="#fff" strokeLinecap="round">
          <path d={arc(32, 29.5, 19.5, 190, 255)} strokeWidth="2.6" opacity="0.85" />
          <path d={arc(32, 29.5, 12, 15, 75)} strokeWidth="1.8" opacity="0.45" />
        </g>
        <ellipse cx="17.5" cy="16.5" rx="2" ry="1.2" transform="rotate(-48 17.5 16.5)" />
      </Glint>
    </Svg>
  );
}

const VAULT = rrect(8, 16, 38, 36, 5);
const VAULT_DOOR = rrect(12, 20, 30, 28, 3);
const VAULT_DIAL = disc(25, 34, 8.5);

/** A brushed steel vault with a wine dial. */
export function IconAccount(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[0.4, 5.5, 58]} {...props}>
      <Defs k={k} tones={["steel", "wine", "rose"]}>
        {/* Brushed metal reads as several soft reflections, not one ramp. */}
        <linearGradient id={k.id("brush")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eceef2" />
          <stop offset="0.3" stopColor="#cfd3dc" />
          <stop offset="0.46" stopColor="#e6e9ee" />
          <stop offset="0.66" stopColor="#b0b5c3" />
          <stop offset="0.82" stopColor="#c3c7d2" />
          <stop offset="1" stopColor="#8b90a3" />
        </linearGradient>
        <linearGradient id={k.id("recess")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={STEEL.deep} stopOpacity="0.55" />
          <stop offset="0.5" stopColor={STEEL.deep} stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.9" />
        </linearGradient>
        <clipPath id={k.id("face")}>
          <path d={VAULT} />
        </clipPath>
        <clipPath id={k.id("dial")}>
          <path d={VAULT_DIAL} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={30} cy={55.5} rx={25} ry={3.4} />
      <path d={rrect(12, 48, 7, 6.5, 1.6)} fill={k.url("steel-side")} />
      <path d={rrect(35, 48, 7, 6.5, 1.6)} fill={k.url("steel-side")} />
      <Sweep d={VAULT} dx={7} dy={-5} fill={k.url("steel-box")} />
      <Rim k={k} name="box" d={VAULT} tone="steel" at="translate(7 -5)" width={1.2} />
      <path d={VAULT} fill={k.url("brush")} />
      <g clipPath={k.url("face")}>
        <path d={VAULT} fill="none" stroke={k.url("gloss")} strokeWidth="2" />
      </g>
      <path d={VAULT_DOOR} fill={k.url("steel-face")} opacity="0.55" />
      <path d={VAULT_DOOR} fill="none" stroke={k.url("recess")} strokeWidth="1.3" />
      <path d={rrect(5.5, 22, 4, 6.5, 1.5)} fill={k.url("steel-cyl")} />
      <path d={rrect(5.5, 39.5, 4, 6.5, 1.5)} fill={k.url("steel-cyl")} />
      <Glint k={k} clip="face">
        <path d="M10 34 25 16.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      </Glint>

      <path d={rrect(36, 26.5, 3.2, 15, 1.6)} fill={k.url("steel-cyl")} />
      <circle cx="37.6" cy="34" r="2.7" fill={k.url("steel-ball")} />
      <Sweep d={VAULT_DIAL} dx={1} dy={1.8} fill={k.url("wine-side")} />
      <Rim k={k} name="dial" d={VAULT_DIAL} tone="wine" at="translate(1 1.8)" />
      <path d={VAULT_DIAL} fill={k.url("wine-ball")} />
      <circle
        cx="25"
        cy="34"
        r="6.3"
        fill="none"
        stroke={WINE.hi}
        strokeWidth="1.4"
        pathLength={24}
        strokeDasharray="0.4 1.6"
        opacity="0.75"
      />
      <circle cx="25" cy="34" r="3.4" fill={k.url("rose-ball")} />
      <path d="M25 31.2V33" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
      <Glint k={k} clip="dial">
        <ellipse cx="21.5" cy="29.5" rx="3" ry="1.6" transform="rotate(-40 21.5 29.5)" opacity="0.8" />
      </Glint>
    </Svg>
  );
}

const BELL =
  "M31 11C22.8 11 18 17.5 18 26V33.5C18 38.5 15.2 41.8 12 43.8C10.4 44.8 11 47 12.9 47H49.1C51 47 51.6 44.8 50 43.8C46.8 41.8 44 38.5 44 33.5V26C44 17.5 39.2 11 31 11Z";
const BELL_LIP = rrect(8.75, 45.5, 44.5, 5.5, 2.75);
const BELL_SWING = "rotate(8 31 9)";

/** A gold bell with a wine clapper and a notification dot. */
export function IconAlerts(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["gold", "wine"]}>
        <clipPath id={k.id("bell")}>
          <path d={BELL} transform={BELL_SWING} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={30} cy={59} rx={18} ry={2.8} />
      <g transform={BELL_SWING}>
        <circle cx="31" cy="8.8" r="3.3" fill={k.url("gold-ball")} />
        <circle cx="31" cy="52.5" r="4.3" fill={k.url("wine-ball")} />
        <circle cx="31" cy="52.5" r="3.8" fill="none" stroke={k.url("wine-rim")} strokeWidth="1" />
        <path d={BELL} fill={k.url("gold-ball")} />
        <Rim k={k} name="bell" d={BELL} tone="gold" width={1.2} />
        <path d={BELL_LIP} fill={k.url("gold-cyl")} />
        <path d="M11.5 45.9H50.5" stroke={GOLD.hi} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
      </g>
      <Glint k={k} clip="bell">
        <g transform={BELL_SWING}>
          <path d="M23.5 17C21 21.5 20.8 30 21.2 37" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="25.5" cy="15.5" rx="2.6" ry="1.5" transform="rotate(-40 25.5 15.5)" opacity="0.85" />
        </g>
      </Glint>
      <Glint k={k}>
        <ellipse cx="15.5" cy="47.2" rx="3" ry="0.9" transform={BELL_SWING} opacity="0.6" />
      </Glint>
      <g filter={k.url("soft")}>
        <ellipse cx="46.8" cy="19.2" rx="5.8" ry="5" fill={WINE.deep} opacity="0.45" />
      </g>
      <circle cx="45" cy="16.5" r="6.2" fill={k.url("wine-ball")} />
      <circle cx="45" cy="16.5" r="5.65" fill="none" stroke={k.url("wine-rim")} strokeWidth="1.1" />
      <Glint k={k}>
        <ellipse cx="42.7" cy="13.7" rx="2.5" ry="1.3" transform="rotate(-40 42.7 13.7)" opacity="0.85" />
      </Glint>
    </Svg>
  );
}

/** A key with a bow, a shaft and teeth, in one path so one gradient lights all of it. */
const KEY =
  "M-11 0A11 11 0 0 0 11 0A11 11 0 0 0 -11 0Z" +
  "M-4.4 0A4.4 4.4 0 0 1 4.4 0A4.4 4.4 0 0 1 -4.4 0Z" +
  "M9 -3.2V3.2H25V9H29V6.5H32V9.5H36.5A2.5 2.5 0 0 0 39 7V-1.2A2 2 0 0 0 37 -3.2Z" +
  "M9 -5V5H13.5V-5Z";
const KEY_AT = "translate(21 19) rotate(40)";
const TAG = "M0 -13L7.5 -5.5V11A2.5 2.5 0 0 1 5 13.5H-5A2.5 2.5 0 0 1 -7.5 11V-5.5Z";
const TAG_AT = "translate(17 41.5) rotate(16)";

/** A gold house key with a wine sold tag. */
export function IconReport(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[-1.1, 3.2, 61]} {...props}>
      <Defs k={k} tones={["gold", "wine"]}>
        {/* Rotated with the key: along the shaft is top left to bottom right on screen. */}
        <linearGradient id={k.id("key")} x1="0" y1="0.3" x2="1" y2="0.7">
          <stop offset="0" stopColor={GOLD.hi} />
          <stop offset="0.25" stopColor={GOLD.light} />
          <stop offset="0.65" stopColor={GOLD.base} />
          <stop offset="1" stopColor={GOLD.shade} />
        </linearGradient>
        <clipPath id={k.id("key-clip")}>
          <path d={KEY} transform={KEY_AT} />
        </clipPath>
        <clipPath id={k.id("tag-clip")}>
          <path d={TAG} transform={TAG_AT} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={32} cy={58.5} rx={23} ry={3} />
      <Sweep d={KEY} dx={0.8} dy={2.2} fill={k.url("gold-side")} at={KEY_AT} />
      <Rim k={k} name="key" d={KEY} tone="gold" at={`translate(0.8 2.2) ${KEY_AT}`} />
      <path d={KEY} transform={KEY_AT} fill={k.url("key")} />
      <g clipPath={k.url("key-clip")}>
        <path d={KEY} transform={KEY_AT} fill="none" stroke={k.url("gloss")} strokeWidth="1.8" />
      </g>
      <Glint k={k} clip="key-clip">
        <g transform={KEY_AT} fill="none" stroke="#fff" strokeLinecap="round">
          <path d={arc(0, 0, 7.8, 140, 215)} strokeWidth="2.2" opacity="0.8" />
          <path d="M15 -1.4H33" strokeWidth="1.2" opacity="0.55" />
        </g>
      </Glint>

      <Sweep d={TAG} dx={0.9} dy={1.8} fill={k.url("wine-side")} at={TAG_AT} />
      <Rim k={k} name="tag" d={TAG} tone="wine" at={`translate(0.9 1.8) ${TAG_AT}`} />
      <g transform={TAG_AT}>
        <path d={TAG} fill={k.url("wine-face")} stroke={k.url("wine-face")} strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="0" cy="-6" r="2.5" fill={k.url("gold-ball")} />
        <circle cx="0" cy="-6" r="1.1" fill={WINE.deep} />
        <path d="M-3.8 3.5-1 6.3 4.2 1.1" transform="translate(0.3 0.8)" fill="none" stroke={WINE.deep} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
        <path d="M-3.8 3.5-1 6.3 4.2 1.1" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Glint k={k} clip="tag-clip">
        <ellipse cx="-4.4" cy="0" rx="1.3" ry="7" transform={TAG_AT} opacity="0.5" />
      </Glint>
      <path d="M18.7 35.7C18.4 31 19.2 26.5 21 23.6" fill="none" stroke={PAPER.base} strokeWidth="1.1" strokeLinecap="round" opacity="0.9" />
    </Svg>
  );
}

const CAL = rrect(6, 14, 34, 38, 5);
const CAL_STRIP = "M11 14H35A5 5 0 0 1 40 19V24H6V19A5 5 0 0 1 11 14Z";
const PAY_COIN = disc(45, 41, 12);

/** The naira sign seen face on. */
function Naira({ stroke, at }: { stroke: string; at?: string }) {
  return (
    <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" transform={at}>
      <path d="M40.3 46.5V35.5L49.7 46.5V35.5" strokeWidth="2.1" />
      <path d="M38 39.6H52M38 42.6H52" strokeWidth="1.6" />
    </g>
  );
}

/** A desk calendar with a gold coin leaning on it. */
export function IconPayDay(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["paper", "wine", "gold", "steel"]}>
        <linearGradient id={k.id("strip-shadow")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={WINE.deep} stopOpacity="0.3" />
          <stop offset="1" stopColor={WINE.deep} stopOpacity="0" />
        </linearGradient>
        <clipPath id={k.id("cal")}>
          <path d={CAL} />
        </clipPath>
        <clipPath id={k.id("coin")}>
          <path d={PAY_COIN} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={25} cy={55} rx={21} ry={3} />
      <Ground k={k} cx={47} cy={56} rx={11} ry={2.4} />
      <Sweep d={CAL} dx={5} dy={-3.5} fill={k.url("paper-box")} />
      <Sweep d={CAL_STRIP} dx={5} dy={-3.5} fill={k.url("wine-box")} />
      <Rim k={k} name="cal" d={CAL} tone="paper" at="translate(5 -3.5)" />
      <path d={CAL} fill={k.url("paper-face")} />
      <path d={CAL_STRIP} fill={k.url("wine-face")} />
      <g clipPath={k.url("cal")}>
        <rect x="6" y="24" width="34" height="2.4" fill={k.url("strip-shadow")} />
        <path d={CAL} fill="none" stroke={k.url("gloss")} strokeWidth="2" />
      </g>
      <g fill={WINE.deep} opacity="0.85">
        <ellipse cx="15" cy="18.8" rx="2.1" ry="1.2" />
        <ellipse cx="31" cy="18.8" rx="2.1" ry="1.2" />
      </g>
      <path d={rrect(13.3, 8, 3.4, 11, 1.7)} fill={k.url("steel-cyl")} />
      <path d={rrect(29.3, 8, 3.4, 11, 1.7)} fill={k.url("steel-cyl")} />
      <g fill={PAPER.shade} opacity="0.75">
        <rect x="10.5" y="29" width="7" height="5.5" rx="1.4" />
        <rect x="28.5" y="29" width="7" height="5.5" rx="1.4" />
        <rect x="10.5" y="38" width="7" height="5.5" rx="1.4" />
        <rect x="19.5" y="38" width="7" height="5.5" rx="1.4" />
      </g>
      <rect x="19.5" y="29" width="7" height="5.5" rx="1.4" fill={k.url("wine-ball")} />

      <Sweep d={PAY_COIN} dx={2.6} dy={-1.6} fill={k.url("gold-side")} />
      <Rim k={k} name="coin" d={PAY_COIN} tone="gold" at="translate(2.6 -1.6)" />
      <path d={PAY_COIN} fill={k.url("gold-ball")} />
      <circle cx="45" cy="41" r="9.2" fill="none" stroke={GOLD.hi} strokeWidth="0.9" opacity="0.6" transform="translate(0.4 0.6)" />
      <circle cx="45" cy="41" r="9.2" fill="none" stroke={GOLD.deep} strokeWidth="0.9" opacity="0.45" />
      <Naira stroke={GOLD.hi} at="translate(0.4 0.7) rotate(-8 45 41)" />
      <Naira stroke={GOLD.deep} at="rotate(-8 45 41)" />
      <Glint k={k} clip="coin">
        <ellipse cx="39.5" cy="34.5" rx="4.4" ry="2.1" transform="rotate(-40 39.5 34.5)" opacity="0.8" />
      </Glint>
    </Svg>
  );
}

const GIFT_BODY = rrect(9, 33, 30, 22, 1.4);
const GIFT_BODY_SIDE = "M39 33L49 27V49L39 55Z";
const GIFT_LID = rrect(6.5, 23, 35, 10.5, 1.4);
const GIFT_LID_SIDE = "M41.5 23L51.5 17V27.5L41.5 33.5Z";
const GIFT_LID_TOP = "M6.5 23L16.5 17H51.5L41.5 23Z";
const BOW_L = "M29 20C23.5 22.8 11.5 22 10.5 13.8C9.8 7.2 20.5 7 29 20Z";
const BOW_R = "M29 20C34.5 22.8 46.5 22 47.5 13.8C48.2 7.2 37.5 7 29 20Z";

/** A wine gift box with a gold ribbon and bow. */
export function IconUpdates(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[-1.35, 3.15, 60.7]} {...props}>
      <Defs k={k} tones={["wine", "gold"]}>
        <linearGradient id={k.id("lid-shadow")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={WINE.deep} stopOpacity="0.6" />
          <stop offset="1" stopColor={WINE.deep} stopOpacity="0" />
        </linearGradient>
        {/* The lid's top faces the light, so it is the brightest wine in the box. */}
        <linearGradient id={k.id("lid-top")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffa3bb" />
          <stop offset="1" stopColor={WINE.light} />
        </linearGradient>
        <clipPath id={k.id("lid")}>
          <path d={GIFT_LID} />
        </clipPath>
        <clipPath id={k.id("body")}>
          <path d={GIFT_BODY} />
        </clipPath>
        <clipPath id={k.id("bow-l")}>
          <path d={BOW_L} />
        </clipPath>
        <clipPath id={k.id("bow-r")}>
          <path d={BOW_R} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={29} cy={57} rx={25} ry={3.2} />
      <g strokeWidth="0.8" strokeLinejoin="round">
        <path d={GIFT_BODY_SIDE} fill={k.url("wine-side")} stroke={k.url("wine-side")} />
        <path d="M43 30.6 45 29.4V51.4L43 52.6Z" fill={k.url("gold-side")} />
        <path d={GIFT_BODY} fill={k.url("wine-face")} />
        <rect x="9" y="33" width="30" height="4.5" fill={k.url("lid-shadow")} />
        <rect x="21" y="33" width="6" height="22" fill={k.url("gold-cyl")} />
        <path d={GIFT_LID_SIDE} fill={k.url("wine-side")} stroke={k.url("wine-side")} />
        <path d="M45.5 20.6 47.5 19.4V29.9L45.5 31.1Z" fill={k.url("gold-side")} />
        <path d={GIFT_LID} fill={k.url("wine-face")} />
        <rect x="20.5" y="23" width="7" height="10.5" fill={k.url("gold-cyl")} />
        <path d={GIFT_LID_TOP} fill={k.url("lid-top")} stroke={k.url("lid-top")} />
        <path d="M10.5 20.6H45.5L47.5 19.4H12.5Z" fill={k.url("gold-top")} />
        <path d="M20.5 23H27.5L37.5 17H30.5Z" fill={k.url("gold-top")} />
      </g>
      {/* Bevels where the faces meet: the lid's front top edge catches the light. */}
      <g fill="none" stroke={WINE.hi} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 23H41.3L51.2 17.1" strokeWidth="0.8" opacity="0.8" />
        <path d="M41.5 23.6V33" strokeWidth="0.6" opacity="0.45" />
        <path d="M39 37.5V54.5" strokeWidth="0.6" opacity="0.35" />
      </g>
      <Glint k={k} clip="lid">
        <ellipse cx="10" cy="28" rx="1.2" ry="3.8" opacity="0.6" />
      </Glint>
      <Glint k={k} clip="body">
        <ellipse cx="12" cy="45" rx="1.3" ry="8" opacity="0.45" />
      </Glint>

      <g filter={k.url("soft")}>
        <ellipse cx="30.5" cy="21" rx="13" ry="2.6" fill={WINE.deep} opacity="0.5" />
      </g>
      <path d={BOW_L} fill={k.url("gold-ball")} />
      <path d={BOW_R} fill={k.url("gold-ball")} />
      <g fill={GOLD.deep} opacity="0.6">
        <path d="M27 18C22.5 15.8 16.5 11.6 14.5 13.2C14 16.3 20.8 18.5 27 18Z" />
        <path d="M31 18C35.5 15.8 41.5 11.6 43.5 13.2C44 16.3 37.2 18.5 31 18Z" />
      </g>
      {/* Where the loops tuck into the knot they turn away from the light. */}
      <g clipPath={k.url("bow-l")}>
        <g filter={k.url("soft")}>
          <ellipse cx="27" cy="19.5" rx="6" ry="4" fill={GOLD.deep} opacity="0.55" />
        </g>
      </g>
      <g clipPath={k.url("bow-r")}>
        <g filter={k.url("soft")}>
          <ellipse cx="31" cy="19.5" rx="6" ry="4" fill={GOLD.deep} opacity="0.55" />
        </g>
      </g>
      <Rim k={k} name="bow" d={BOW_R} tone="gold" width={1} />
      <Glint k={k} clip="bow-l">
        <ellipse cx="14.5" cy="10.8" rx="3.2" ry="1.4" transform="rotate(-25 14.5 10.8)" opacity="0.85" />
      </Glint>
      <Glint k={k} clip="bow-r">
        <ellipse cx="38" cy="11.2" rx="2.6" ry="1.1" transform="rotate(-15 38 11.2)" opacity="0.6" />
      </Glint>
      <ellipse cx="29" cy="20" rx="3.8" ry="3.3" fill={k.url("gold-ball")} />
      <Glint k={k}>
        <ellipse cx="27.8" cy="18.6" rx="1.2" ry="0.8" opacity="0.8" />
      </Glint>
    </Svg>
  );
}

const BANK_COLUMNS = [17, 27, 37, 47];

/** A classical bank in pink ceramic under a gold pediment. */
export function IconBank(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["rose", "gold", "wine"]} />
      <Ground k={k} cx={32} cy={58.5} rx={28} ry={2.8} />
      <path d="M5 52L8 49.6H56L59 52Z" fill={k.url("rose-top")} stroke={k.url("rose-top")} strokeWidth="0.6" strokeLinejoin="round" />
      <path d={rrect(5, 52, 54, 5, 1.2)} fill={k.url("rose-face")} />
      <path d="M9 47.6L11 45.8H53L55 47.6Z" fill={k.url("rose-top")} stroke={k.url("rose-top")} strokeWidth="0.6" strokeLinejoin="round" />
      <path d={rrect(9, 47.4, 46, 3, 0.8)} fill={k.url("rose-face")} />
      <rect x="12" y="25.5" width="40" height="20.5" fill={k.url("wine-side")} />
      {BANK_COLUMNS.map((cx) => (
        <g key={cx}>
          <rect x={cx - 2.8} y="27.5" width="5.6" height="17" fill={k.url("rose-cyl")} />
          <path d={rrect(cx - 4, 25.4, 8, 2.4, 0.8)} fill={k.url("rose-top")} />
          <path d={rrect(cx - 4, 44, 8, 2.2, 0.8)} fill={k.url("rose-face")} />
        </g>
      ))}
      <path d={rrect(8, 20.5, 48, 5.2, 1)} fill={k.url("gold-face")} />
      <path d="M7 21L32 7L57 21Z" fill={k.url("gold-face")} stroke={k.url("gold-face")} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16.5 18.6L32 10.6L47.5 18.6Z" fill={k.url("gold-side")} opacity="0.85" />
      <circle cx="32" cy="15.3" r="2.4" fill={k.url("wine-ball")} />
      <path d="M8.5 20.2 32 7.2 55.5 20.2" fill="none" stroke={GOLD.hi} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
      <path d="M8.5 25.3H55.5" stroke={GOLD.deep} strokeWidth="0.8" opacity="0.6" />
      <Glint k={k}>
        <path d="M11 19.4 24 12.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
        {BANK_COLUMNS.map((cx) => (
          <rect key={cx} x={cx - 1.9} y="28.5" width="1.1" height="14.5" rx="0.55" opacity="0.5" />
        ))}
      </Glint>
    </Svg>
  );
}

const SHIELD = "M32 5C38.5 9 45.5 10.5 52.5 10.5V28C52.5 40.5 44 49.5 32 55C20 49.5 11.5 40.5 11.5 28V10.5C18.5 10.5 25.5 9 32 5Z";
const SHIELD_IN =
  "M32 10.8C37.2 14 42.6 15.4 47.6 15.6V28.3C47.6 37.9 41.2 45 32 49.6C22.8 45 16.4 37.9 16.4 28.3V15.6C21.4 15.4 26.8 14 32 10.8Z";
const BANG = "M29.2 19.5A2.8 2.8 0 0 1 34.8 19.5L33.9 32.7A1.9 1.9 0 0 1 30.1 32.7Z";

/** A wine shield with a white exclamation: paused, or look at this. */
export function IconShield(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["wine"]}>
        <linearGradient id={k.id("frame")} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={WINE.base} />
          <stop offset="0.6" stopColor={WINE.shade} />
          <stop offset="1" stopColor={WINE.deep} />
        </linearGradient>
        <linearGradient id={k.id("boss")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={WINE.hi} stopOpacity="0.9" />
          <stop offset="0.45" stopColor={WINE.hi} stopOpacity="0" />
          <stop offset="0.6" stopColor={WINE.deep} stopOpacity="0" />
          <stop offset="1" stopColor={WINE.deep} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={k.id("enamel")} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffd9e3" />
        </linearGradient>
        <clipPath id={k.id("inner")}>
          <path d={SHIELD_IN} />
        </clipPath>
        <clipPath id={k.id("outer")}>
          <path d={SHIELD} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={33} cy={58.5} rx={16} ry={2.6} />
      <Sweep d={SHIELD} dx={1.3} dy={2.4} fill={k.url("wine-side")} />
      <Rim k={k} name="shield" d={SHIELD} tone="wine" at="translate(1.3 2.4)" width={1.2} />
      <path d={SHIELD} fill={k.url("frame")} />
      <g clipPath={k.url("outer")}>
        <path d={SHIELD} fill="none" stroke={k.url("gloss")} strokeWidth="2" />
      </g>
      <path d={SHIELD_IN} fill={k.url("wine-ball")} />
      <path d={SHIELD_IN} fill="none" stroke={k.url("boss")} strokeWidth="1.2" />
      <Glint k={k} clip="inner">
        <ellipse cx="21.5" cy="25" rx="3" ry="8.5" transform="rotate(12 21.5 25)" opacity="0.45" />
        <ellipse cx="22.5" cy="17.8" rx="2.8" ry="1.3" transform="rotate(-30 22.5 17.8)" opacity="0.8" />
      </Glint>
      <g transform="translate(0.5 1.1)" fill={WINE.deep} opacity="0.5">
        <path d={BANG} stroke={WINE.deep} strokeWidth="0.6" strokeLinejoin="round" />
        <circle cx="32" cy="40.5" r="2.9" />
      </g>
      <path d={BANG} fill={k.url("enamel")} stroke="#fff" strokeWidth="0.6" strokeLinejoin="round" />
      <circle cx="32" cy="40.5" r="2.9" fill={k.url("enamel")} />
    </Svg>
  );
}

/** Scalloped disc: points on a circle joined by outward arcs. */
function scallop(cx: number, cy: number, r: number, lobes: number, depth: number): string {
  const step = (Math.PI * 2) / lobes;
  const chord = 2 * r * Math.sin(step / 2);
  const radius = n2((chord * chord) / (8 * depth) + depth / 2);
  let d = "";
  for (let i = 0; i <= lobes; i += 1) {
    const a = i * step - Math.PI / 2;
    const x = n2(cx + r * Math.cos(a));
    const y = n2(cy + r * Math.sin(a));
    d += i === 0 ? `M${x} ${y}` : `A${radius} ${radius} 0 0 1 ${x} ${y}`;
  }
  return `${d}Z`;
}

const ROSETTE = scallop(32, 24, 16.2, 16, 2.2);
const ROSETTE_CHECK = "M26 24.3 30.2 28.5 38.4 20.3";

/** A gold rosette with a white check, for good news. */
export function IconCheckBadge(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <Defs k={k} tones={["gold", "wine"]}>
        <linearGradient id={k.id("raised")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GOLD.hi} stopOpacity="0.95" />
          <stop offset="0.45" stopColor={GOLD.hi} stopOpacity="0" />
          <stop offset="0.6" stopColor={GOLD.deep} stopOpacity="0" />
          <stop offset="1" stopColor={GOLD.deep} stopOpacity="0.75" />
        </linearGradient>
        <clipPath id={k.id("rosette")}>
          <path d={ROSETTE} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={32} cy={59.5} rx={17} ry={2.4} />
      <path d="M25 33L17 55.5L22.2 52.8L25.8 57.5L33 36Z" fill={k.url("wine-face")} stroke={k.url("wine-face")} strokeWidth="1" strokeLinejoin="round" />
      <path d="M39 33L47 55.5L41.8 52.8L38.2 57.5L31 36Z" fill={k.url("wine-side")} stroke={k.url("wine-side")} strokeWidth="1" strokeLinejoin="round" />
      <g filter={k.url("soft")}>
        <ellipse cx="33" cy="40" rx="11" ry="3" fill={WINE.deep} opacity="0.55" />
      </g>
      <Sweep d={ROSETTE} dx={1} dy={2.2} fill={k.url("gold-side")} />
      <Rim k={k} name="rosette" d={ROSETTE} tone="gold" at="translate(1 2.2)" />
      <path d={ROSETTE} fill={k.url("gold-face")} />
      <g clipPath={k.url("rosette")}>
        <path d={ROSETTE} fill="none" stroke={k.url("gloss")} strokeWidth="1.8" />
      </g>
      <circle cx="32" cy="24" r="11.5" fill={k.url("gold-ball")} />
      <circle cx="32" cy="24" r="11.5" fill="none" stroke={k.url("raised")} strokeWidth="1.2" />
      <Glint k={k} clip="rosette">
        <path d={arc(32, 24, 15.6, 195, 250)} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
        <ellipse cx="27.5" cy="18.5" rx="3.4" ry="1.8" transform="rotate(-35 27.5 18.5)" opacity="0.75" />
      </Glint>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={ROSETTE_CHECK} transform="translate(0.5 1)" stroke={GOLD.deep} strokeWidth="3.6" opacity="0.5" />
        <path d={ROSETTE_CHECK} stroke="#fff" strokeWidth="3.3" />
      </g>
    </Svg>
  );
}

const CARD = rrect(-19, -15.5, 38, 31, 5);
const CARD_WINDOW = rrect(-15, -11.5, 30, 18, 2.8);
const CARD_BACK_AT = "translate(35.5 26.5) rotate(9)";
const CARD_FRONT_AT = "translate(29 34) rotate(-6)";

/** A frosted lilac photo card with a wine sun, for adding proof. */
export function IconPhoto(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[2.65, 3.15, 60.7]} {...props}>
      <Defs k={k} tones={["lilac", "wine"]}>
        <linearGradient id={k.id("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="0.45" stopColor={LILAC.light} stopOpacity="0.93" />
          <stop offset="1" stopColor={LILAC.base} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={k.id("sky")} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={LILAC.base} />
          <stop offset="1" stopColor={LILAC.light} />
        </linearGradient>
        <clipPath id={k.id("front")}>
          <path d={CARD} transform={CARD_FRONT_AT} />
        </clipPath>
        <clipPath id={k.id("window")}>
          <path d={CARD_WINDOW} transform={CARD_FRONT_AT} />
        </clipPath>
      </Defs>
      <Ground k={k} cx={32} cy={57} rx={22} ry={3.2} />
      <Sweep d={CARD} dx={0.8} dy={1.6} at={CARD_BACK_AT} fill={k.url("lilac-side")} />
      <path d={CARD} transform={CARD_BACK_AT} fill={k.url("lilac-face")} />
      <path d={CARD} transform={CARD_BACK_AT} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" />
      <g filter={k.url("soft")}>
        <path d={CARD} transform={`translate(1.4 2) ${CARD_FRONT_AT}`} fill={LILAC.deep} opacity="0.4" />
      </g>
      <Sweep d={CARD} dx={0.8} dy={1.8} at={CARD_FRONT_AT} fill={k.url("lilac-side")} />
      <Rim k={k} name="card" d={CARD} tone="lilac" at={`translate(0.8 1.8) ${CARD_FRONT_AT}`} />
      <path d={CARD} transform={CARD_FRONT_AT} fill={k.url("glass")} />
      <g clipPath={k.url("front")}>
        <path d={CARD} transform={CARD_FRONT_AT} fill="none" stroke={k.url("gloss")} strokeWidth="2.4" />
      </g>
      <path d={CARD_WINDOW} transform={CARD_FRONT_AT} fill={k.url("sky")} />
      <g clipPath={k.url("window")}>
        <g transform={CARD_FRONT_AT}>
          <path d="M-15 6.5L-5.5 -3.5L1.5 3L6.5 -1L15 6.5Z" fill={LILAC.shade} stroke={LILAC.shade} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M-15 6.5L-9.5 1L-3 6.5Z" fill={LILAC.deep} stroke={LILAC.deep} strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="8" cy="-5.5" r="3.8" fill={k.url("wine-ball")} />
        </g>
        <path d={CARD_WINDOW} transform={CARD_FRONT_AT} fill="none" stroke={LILAC.deep} strokeWidth="1.2" opacity="0.35" />
      </g>
      <Glint k={k} clip="front">
        <g transform={CARD_FRONT_AT}>
          <ellipse cx="-13" cy="-12.6" rx="4.5" ry="1.1" opacity="0.9" />
          <ellipse cx="6.1" cy="-7.2" rx="1.3" ry="0.8" opacity="0.8" />
        </g>
      </Glint>
    </Svg>
  );
}

const SLEEVE_L = rrect(-10, -7, 22, 14, 7);
const SLEEVE_R = rrect(-12, -7, 22, 14, 7);
const SLEEVE_L_AT = "translate(12 47) rotate(-42)";
const SLEEVE_R_AT = "translate(52 47) rotate(42)";
const HAND_L = "M17.5 37.5C16.5 32.5 20 29.5 25 29.5H33C36.5 29.5 38.5 31.5 38.5 34.5C38.5 38 36 40.5 32.5 41.5L24.5 44C21 45 18.3 41.5 17.5 37.5Z";
const HAND_R = "M46.5 37.5C47.5 32.5 44 28.5 38.5 28.5H30.5C27 28.5 25 30.5 25 33.5C25 37 27.5 39.5 31 40.5L39.5 43C43 44 45.7 41.5 46.5 37.5Z";
const FINGER = rrect(-2.3, -5.4, 4.6, 10.8, 2.3);
const FINGERS = [
  [21.6, 38.2],
  [25.7, 39.2],
  [29.8, 40],
  [33.8, 40.5],
] as const;
const THUMB = "M26.6 31.2C27.8 29.4 36 27.4 40.6 27.2C42.8 27.1 43.6 29.6 41.8 30.6C38.4 32.4 31 33.8 28.2 33.6C26.6 33.5 25.9 32.3 26.6 31.2Z";

/** Two clay hands meeting, one wine sleeve and one gold. */
export function IconHandshake(props: IconProps) {
  const k = useKit();
  return (
    <Svg k={k} box={[1, 10.5, 62]} {...props}>
      <Defs k={k} tones={["wine", "gold", "rose", "paper"]} />
      <Ground k={k} cx={32} cy={57.5} rx={26} ry={3} />
      <Sweep d={SLEEVE_L} dx={0.6} dy={1.6} fill={k.url("wine-side")} at={SLEEVE_L_AT} />
      <path d={SLEEVE_L} transform={SLEEVE_L_AT} fill={k.url("wine-face")} />
      <path d={rrect(7.5, -7.8, 5, 15.6, 2.4)} transform={SLEEVE_L_AT} fill={k.url("paper-face")} />
      <Sweep d={SLEEVE_R} dx={0.6} dy={1.6} fill={k.url("gold-side")} at={SLEEVE_R_AT} />
      <path d={SLEEVE_R} transform={SLEEVE_R_AT} fill={k.url("gold-face")} />
      <path d={rrect(-12.5, -7.8, 5, 15.6, 2.4)} transform={SLEEVE_R_AT} fill={k.url("paper-face")} />
      <path d={HAND_L} fill={k.url("rose-face")} />
      <path d={HAND_R} fill={k.url("rose-ball")} />
      {FINGERS.map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y}) rotate(28)`}>
          <path d={FINGER} transform="translate(0.7 0.5)" fill={ROSE.deep} opacity="0.35" />
          <path d={FINGER} fill={k.url("rose-ball")} />
        </g>
      ))}
      <path d={THUMB} transform="translate(0.4 0.9)" fill={ROSE.deep} opacity="0.35" />
      <path d={THUMB} fill={k.url("rose-ball")} />
      <Glint k={k}>
        <ellipse cx="33" cy="29.6" rx="4.5" ry="0.9" transform="rotate(-10 33 29.6)" opacity="0.7" />
        <ellipse cx="13.4" cy="43.4" rx="4" ry="1.3" transform="rotate(-42 13.4 43.4)" opacity="0.55" />
        <ellipse cx="54.4" cy="44.4" rx="3.2" ry="1" transform="rotate(42 54.4 44.4)" opacity="0.45" />
      </Glint>
    </Svg>
  );
}

/* ═══ BAR ══════════════════════════════════════════════════════════════════ */

function Glyph({ size = 24, className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Flat bar glyph: a rounded house. */
export function GlyphHome(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 10.2V19a2 2 0 0 0 2 2h3.6v-5.2a1.6 1.6 0 0 1 1.6-1.6h1.6a1.6 1.6 0 0 1 1.6 1.6V21H18a2 2 0 0 0 2-2v-8.8a2 2 0 0 0-.75-1.56l-6-4.8a2 2 0 0 0-2.5 0l-6 4.8A2 2 0 0 0 4 10.2Z" />
    </Glyph>
  );
}

/** Flat bar glyph: three circles in a triangle. */
export function GlyphMenu(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="6.9" r="3.5" />
      <circle cx="6.6" cy="16.3" r="3.5" />
      <circle cx="17.4" cy="16.3" r="3.5" />
    </Glyph>
  );
}

/** The bar's centre orb: a glowing glass sphere, optionally carrying a plus. */
export function OrbMark({ plus = false, ...props }: IconProps & { plus?: boolean }) {
  const k = useKit();
  return (
    <Svg k={k} {...props}>
      <defs>
        <filter id={k.id("soft")} filterUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <radialGradient id={k.id("glow")} gradientUnits="userSpaceOnUse" cx="32" cy="32.5" r="31.5">
          <stop offset="0.7" stopColor={WINE.light} stopOpacity="0.55" />
          <stop offset="1" stopColor={WINE.light} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={k.id("glass")} cx="0.44" cy="0.4" r="0.66" fx="0.34" fy="0.26">
          <stop offset="0" stopColor="#ffd7e1" />
          <stop offset="0.3" stopColor={WINE.light} />
          <stop offset="0.72" stopColor={WINE.base} />
          <stop offset="1" stopColor={WINE.shade} />
        </radialGradient>
        {/* A hint of lilac where light passes through the glass and out the far side. */}
        <linearGradient id={k.id("lilac")} x1="0.2" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0.45" stopColor={LILAC.base} stopOpacity="0" />
          <stop offset="1" stopColor={LILAC.base} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31.5" fill={k.url("glow")} />
      <circle cx="32" cy="32" r="24" fill={k.url("glass")} />
      <circle cx="32" cy="32" r="24" fill={k.url("lilac")} />
      <g filter={k.url("soft")} fill="none" strokeLinecap="round">
        <path d={arc(32, 32, 19.5, 20, 110)} stroke={WINE.hi} strokeWidth="4" opacity="0.55" />
        <path d={arc(32, 32, 19, 200, 262)} stroke="#fff" strokeWidth="3.4" opacity="0.85" />
        <ellipse cx="21" cy="19.5" rx="3" ry="1.8" transform="rotate(-40 21 19.5)" fill="#fff" opacity="0.95" />
      </g>
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.8" />
      {plus && (
        <g fill="none" strokeLinecap="round">
          <g filter={k.url("soft")}>
            <path d="M32 23V41M23 32H41" transform="translate(0 1.2)" stroke={WINE.deep} strokeWidth="4.4" opacity="0.35" />
          </g>
          <path d="M32 23V41M23 32H41" stroke="#fff" strokeWidth="4.2" />
        </g>
      )}
    </Svg>
  );
}
