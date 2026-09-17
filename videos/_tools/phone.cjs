// Shared pieces for the marketer app scenarios (videos 08, 09, 11, 12 and 13).
//
// The stage is 360x640 CSS at 3x, exactly 1080x1920: 360px is the narrowest phone the app is
// judged on, and a whole device pixel ratio keeps hairlines and the sheet's tab free of seams.
// The app is served from its live address, so the invite link and a shared listing read as
// they do for a real marketer.
const STAGE = { width: 360, height: 640, dpr: 3, mobile: true };
const ORIGIN = "https://av-homes.vercel.app";

const BTN = (text) => `::-p-xpath(//button[normalize-space()="${text}"])`;
const LINK = (text) => `::-p-xpath(//a[normalize-space()="${text}"])`;
const TAB = (text) => `::-p-xpath(//button[@role="tab"][normalize-space()="${text}"])`;
const FIELD = (label, tag = "input") =>
  `::-p-xpath(//label[.//span[normalize-space()="${label}"]]//${tag} | //div[@role="group"][.//span[normalize-space()="${label}"]]//${tag})`;

/**
 * Scrolls until `sel` sits at `at` of the screen height, when it is not already clear of the
 * hero bar at the top and the bar pinned to the bottom. A tap aimed under a pinned bar lands
 * on the bar, which is why the recorder's own scrollIntoView is not enough here.
 */
async function reveal(a, sel, at = 0.4, ms = 750, clear = { top: 72, bottom: 110 }) {
  const delta = await a.tab.$eval(
    sel,
    (el, at, clear) => {
      const r = el.getBoundingClientRect();
      if (r.top >= clear.top && r.bottom <= innerHeight - clear.bottom) return 0;
      return Math.round(r.top - innerHeight * at);
    },
    at,
    clear,
  );
  if (delta !== 0) await a.scrollBy(delta, ms);
  return delta;
}

/** Everything a take needs loaded once before the camera runs, so no screen compiles on film. */
async function warm(a, paths) {
  for (const p of paths) {
    await a.goto(p);
    await a.dismissCookies();
    await a.sleep(500);
  }
}

/**
 * Scrolls the screen the take opens on down and back. The 3D icons and photo strips are
 * slow to paint the first time they come into view, which froze a filmed scroll for 0.4s.
 */
async function prepaint(a, depth = 1400) {
  await a.scrollBy(depth, 700);
  await a.sleep(900);
  await a.scrollBy(-depth, 700);
  await a.sleep(1200);
}

module.exports = { STAGE, ORIGIN, BTN, LINK, TAB, FIELD, reveal, warm, prepaint };
