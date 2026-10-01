/**
 * The home screen icons for the two installable apps, drawn from the real mark
 * in public/brand. Run with `node scripts/make-app-icons.mjs` after the logo
 * changes; the PNGs it writes to public/pwa are committed.
 *
 * Partners get the hero's wine, the console its chrome. Both carry the reversed
 * mark, the one the apps' own bars use, because the standard artwork's charcoal
 * V disappears on a dark ground.
 *
 * `maskable` keeps the mark inside the central 80% safe zone, so Android's
 * circle and squircle crops never clip it. `badge` is the white silhouette
 * Android draws in the status bar, where colour is thrown away.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const MARK = "public/brand/logo-mark-reversed.png";
const OUT = "public/pwa";

const APPS = {
  m: { top: "#9a3a52", bottom: "#4a1724" },
  admin: { top: "#4d1a26", bottom: "#1f0a10" },
};

function ground(size, { top, bottom }, radius = 0) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
      </linearGradient></defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
    </svg>`,
  );
}

async function mark(width) {
  return sharp(MARK).resize({ width, kernel: "lanczos3" }).png().toBuffer();
}

async function icon(app, size, share, file) {
  const art = await mark(Math.round(size * share));
  const meta = await sharp(art).metadata();
  // A hair above centre, where the eye reads the middle of a square.
  const top = Math.round((size - meta.height) / 2 - size * 0.02);
  const left = Math.round((size - meta.width) / 2);
  await sharp(ground(size, APPS[app]))
    .composite([{ input: art, top, left }])
    .png()
    .toFile(`${OUT}/${file}`);
}

async function badge(size, file) {
  const art = await mark(Math.round(size * 0.86));
  const meta = await sharp(art).metadata();
  const alpha = await sharp(art).extractChannel("alpha").toBuffer();
  const white = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: white, top: Math.round((size - meta.height) / 2), left: Math.round((size - meta.width) / 2) }])
    .png()
    .toFile(`${OUT}/${file}`);
}

await mkdir(OUT, { recursive: true });
for (const app of Object.keys(APPS)) {
  await icon(app, 192, 0.68, `${app}-192.png`);
  await icon(app, 512, 0.68, `${app}-512.png`);
  await icon(app, 512, 0.52, `${app}-maskable-512.png`);
  // iOS rounds the corners itself and shows black through any transparency.
  await icon(app, 180, 0.66, `${app}-apple-180.png`);
}
await badge(96, "badge-96.png");
console.log("App icons written to", OUT);
