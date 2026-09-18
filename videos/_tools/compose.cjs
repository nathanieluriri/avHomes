// Writes the HyperFrames project for one tutorial: intro card, the edited footage, numbered
// captions from timeline.json, and the closing card. One template, so the set looks like a set.
//
//   node videos/_tools/compose.cjs <name>
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const name = process.argv[2];
const dir = path.join(REPO, "videos", name);
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));

const META = {
  "01-add-a-listing": {
    eyebrow: "Tutorial",
    title: ["Adding a", "listing"],
    sub: "From a blank draft to a listing people want to view.",
    outro: "marketing",
  },
  "02-log-an-issue": {
    eyebrow: "Tutorial",
    title: ["Logging a", "change"],
    sub: "Show the developer exactly what should be different, in one note.",
    outro: "try-desktop",
  },
  "03-reply-to-enquiries": {
    eyebrow: "Tutorial",
    title: ["Replying to an", "enquiry"],
    sub: "Answer a buyer quickly, from the thread they started.",
    outro: "try",
  },
  "04-write-a-blog-post": {
    eyebrow: "Tutorial",
    title: ["Writing a", "journal post"],
    sub: "From the quick editor to a published article on the site.",
    outro: "try-desktop",
  },
  "05-check-a-deal": {
    eyebrow: "Tutorial",
    title: ["Checking a", "deal"],
    sub: "A marketer says they sold a house. Check it, then approve it.",
    outro: "try",
  },
  "06-pay-your-marketers": {
    eyebrow: "Tutorial",
    title: ["Paying your", "marketers"],
    sub: "The end of the month: one list, one transfer per person.",
    outro: "try",
  },
  "07-set-commission-rates": {
    eyebrow: "Tutorial",
    title: ["Setting", "commission"],
    sub: "Change what marketers earn, and see what it pays before you save.",
    outro: "try",
  },
  "10-sort-a-payment-problem": {
    eyebrow: "Tutorial",
    title: ["Sorting a", "payment problem"],
    sub: "A marketer says their money never arrived. Answer it, then close it.",
    outro: "try",
  },
  "15-list-an-estate": {
    eyebrow: "Tutorial",
    title: ["Listing an", "estate"],
    sub: "One listing, ten things a buyer can pick: houses, apartments and plots.",
    outro: "try",
  },
  "16-follow-a-buyer": {
    eyebrow: "Tutorial",
    title: ["Following up", "a buyer"],
    sub: "A marketer sent somebody in. Call them, then move them along the line.",
    outro: "try",
  },
  // Portrait, for the marketer app. There is no console walkthrough on a
  // marketer's phone, so the closing card says what to do in the app instead.
  "08-report-a-deal": {
    eyebrow: "Tutorial",
    app: "marketers",
    portrait: true,
    title: ["Reporting", "a deal"],
    sub: "Sold a home? Tell AV Homes, send the proof, and get paid.",
    outro: "phone",
    close: {
      h: ["Now report", "yours."],
      p: "Tap the round <b>+</b> in the middle of the bar.<br />We check the proof, then the money is yours.",
    },
  },
  "09-invite-and-earn": {
    eyebrow: "Tutorial",
    app: "marketers",
    portrait: true,
    title: ["Invite people,", "earn more"],
    sub: "Share your link, grow a team, and earn from their deals too.",
    outro: "phone",
    close: {
      h: ["Now bring", "someone in."],
      p: "Send your link to one person this week.<br />When they close a home, you earn from it too.",
    },
  },
  "11-share-a-listing": {
    eyebrow: "Tutorial",
    app: "marketers",
    portrait: true,
    title: ["Sharing a", "listing"],
    sub: "Send a buyer a home on AV Homes, with your code in the link.",
    outro: "phone",
    close: {
      h: ["Now share", "a home."],
      p: "Open <b>Listings</b> from the Menu and tap <b>Share</b>.<br />An enquiry from your link names you.",
    },
  },
  "12-send-more-proof": {
    eyebrow: "Tutorial",
    app: "marketers",
    portrait: true,
    title: ["Sending more", "proof"],
    sub: "AV Homes asked for more on your deal? Answer it from one screen.",
    outro: "phone",
    close: {
      h: ["Answer it", "the same day."],
      p: "Tap the alert, add the photo they asked for, send it back.<br />Your deal goes straight back to Being checked.",
    },
  },
  "13-join-as-a-marketer": {
    eyebrow: "Tutorial",
    app: "marketers",
    portrait: true,
    title: ["Joining as a", "marketer"],
    sub: "Got an invite link? Three short steps and you are in.",
    outro: "phone",
    close: {
      h: ["Welcome to", "the team."],
      p: "Your own invite code is on your home screen.<br />Report your first deal with the round <b>+</b>.",
    },
  },
}[name];

// 9:16 for the phone app, 16:9 for everything else.
const P = META.portrait === true;
const VW = P ? 1080 : 1920;
const VH = P ? 1920 : 1080;

const INTRO = 3.4; // footage starts under the intro's fade-out
const FOOT = timeline.footageDuration;
const OUTRO = META.outro === "marketing" ? 11.5 : 5;
const TOTAL = +(INTRO + FOOT + OUTRO - 0.4).toFixed(2);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The phone stage shows the footage at 13/15. Scaled here with Lanczos, because the browser's
// own downscale at render time softened the app's small type; a keyframe a second keeps the
// renderer's seeks exact. The recorder's footage is untagged BT.601, which the renderer reads
// as BT.709 and turns the wine hero brick red, so this copy is converted and tagged BT.709.
// Accurate rounding and full chroma keep whites, greys and the wine within a level of the
// recording; without them they lost 2 to 5.
let footageSrc = "assets/edited.mp4";
if (P) {
  require("child_process").execFileSync(process.env.FFMPEG, ["-hide_banner", "-v", "error", "-y", "-i", path.join(dir, "assets/edited.mp4"),
    "-vf", "scale=936:1664:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-g", "30", "-keyint_min", "30",
    "-movflags", "+faststart", path.join(dir, "assets/phone.mp4")], { stdio: "inherit" });
  footageSrc = "assets/phone.mp4";
}

// The desk stage has the same BT.601 misread: the render drew wine-600 as 157,68,80 against the
// console's 152,60,83. Converted and tagged the same way, at full size. Accurate rounding and
// full chroma keep whites and greys within a level of the source; without them they lose 2 to 4.
if (!P) {
  require("child_process").execFileSync(process.env.FFMPEG, ["-hide_banner", "-v", "error", "-y", "-i", path.join(dir, "assets/edited.mp4"),
    "-vf", "scale=in_color_matrix=bt601:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-g", "30", "-keyint_min", "30",
    "-movflags", "+faststart", path.join(dir, "assets/desk.mp4")], { stdio: "inherit" });
  footageSrc = "assets/desk.mp4";
}

// No two captions on screen at once: each ends a beat before the next begins.
const caps = timeline.captions.map((c, i, all) => {
  const next = all[i + 1];
  const end = next ? Math.min(c.end, next.start - 0.3) : Math.min(c.end, FOOT - 0.2);
  return { ...c, start: +(INTRO + c.start).toFixed(2), end: +(INTRO + end).toFixed(2) };
});

// On the phone stage every caption sits in the band above the screen, so `place` does not apply.
const capHtml = caps
  .map(
    (c, i) => `      <div class="cap ${P ? "top" : c.place || "bottom"}" id="cap${i}" data-layout-allow-occlusion data-layout-allow-overlap>
        <span class="bar"></span>
        <div class="step">Step ${i + 1} of ${caps.length}</div>
        <div class="h">${esc(c.title)}</div>
        <div class="d">${esc(c.line)}</div>
      </div>`,
  )
  .join("\n");

const capJs = caps
  .map((c, i) => {
    const d = Math.max(0.6, c.end - c.start);
    return `      tl.fromTo("#cap${i}", { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, ${c.start});
      tl.to("#cap${i}", { opacity: 0, x: -10, duration: 0.3, ease: "power1.in" }, ${(c.start + d - 0.3).toFixed(2)});`;
  })
  .join("\n");

/*
 * A phone hands a shared message to its share sheet or to WhatsApp, which no recording of
 * the app can show. A caption with `message` carries the exact text the app sent (from the
 * recorder's shared.json), shown over a dimmed screen with the marketer's code picked out.
 */
const linkHtml = (link, code) => {
  const at = code ? link.lastIndexOf(code) : -1;
  return at < 0 ? esc(link) : `${esc(link.slice(0, at))}<b>${esc(code)}</b>${esc(link.slice(at + code.length))}`;
};
const said = P ? caps.map((c, i) => ({ c, i })).filter(({ c }) => c.message) : [];
const msgHtml = said
  .map(
    ({ c, i }) => `
      <div class="scrim" id="scrim${i}" data-layout-allow-occlusion data-layout-allow-overlap></div>
      <div class="msg" id="msg${i}" data-layout-allow-occlusion data-layout-allow-overlap>
        <div class="m-label">${esc(c.message.label)}</div>
        <p class="m-text">${esc(c.message.text)}</p>
        <p class="m-link">${linkHtml(c.message.link, c.message.code)}</p>
      </div>`,
  )
  .join("");
const msgJs = said
  .map(({ c, i }) => {
    const from = +(c.start + (c.message.delay ?? 0.5)).toFixed(2);
    const to = +(c.end - 0.3).toFixed(2);
    return `
      tl.fromTo("#scrim${i}", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, ${from});
      tl.fromTo("#msg${i}", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${(from + 0.1).toFixed(2)});
      tl.to("#msg${i}", { opacity: 0, y: 16, duration: 0.3, ease: "power1.in" }, ${to});
      tl.to("#scrim${i}", { opacity: 0, duration: 0.3, ease: "power1.in" }, ${to});`;
  })
  .join("");

const outroStart = +(INTRO + FOOT - 0.4).toFixed(2);
const outroHtml =
  META.outro === "marketing"
    ? `      <section class="clip outro" id="outro" data-start="${outroStart}" data-duration="${(TOTAL - outroStart).toFixed(2)}">
        <div class="o-inner">
          <div class="eyebrow" id="o-eyebrow">Before you publish</div>
          <h2 id="o-h">Your listing is the <em>advert.</em></h2>
          <ul class="o-list">
            <li id="o-1"><span class="n">1</span>The title becomes its permanent web address.</li>
            <li id="o-2"><span class="n">2</span>The first photo leads the card and the gallery.</li>
            <li id="o-3"><span class="n">3</span>The tagline and description turn someone browsing into a viewing.</li>
          </ul>
          <p class="o-close" id="o-close">A few extra minutes on the words and pictures does more than any amount of promotion afterwards.</p>
          <div class="o-next" id="o-next">Now try it yourself: press <b>Try it now</b>.</div>
        </div>
      </section>`
    : META.outro === "phone"
      ? `      <section class="clip outro" id="outro" data-start="${outroStart}" data-duration="${(TOTAL - outroStart).toFixed(2)}">
        <div class="o-inner o-center">
          <img class="o-mark" src="assets/logo-mark-reversed.png" alt="" />
          <h2 id="o-h">${esc(META.close.h[0])}<br /><em>${esc(META.close.h[1])}</em></h2>
          <p class="o-close" id="o-close">${META.close.p}</p>
        </div>
      </section>`
      : `      <section class="clip outro" id="outro" data-start="${outroStart}" data-duration="${(TOTAL - outroStart).toFixed(2)}">
        <div class="o-inner o-center">
          <img class="o-mark" src="assets/logo-mark-reversed.png" alt="" />
          <h2 id="o-h">Now try it <em>yourself.</em></h2>
          <p class="o-close" id="o-close">${META.outro === "try-desktop" ? "On a computer, press <b>Try it now</b>." : "Press <b>Try it now</b>."}<br />A walkthrough guides you on the real screen, step by step.</p>
        </div>
      </section>`;

const outroJs =
  META.outro === "marketing"
    ? `      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, ${outroStart});
      tl.fromTo("#o-eyebrow", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, ${(outroStart + 0.4).toFixed(2)});
      tl.fromTo("#o-h", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${(outroStart + 0.6).toFixed(2)});
      tl.fromTo("#o-1", { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, ${(outroStart + 1.7).toFixed(2)});
      tl.fromTo("#o-2", { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, ${(outroStart + 2.9).toFixed(2)});
      tl.fromTo("#o-3", { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, ${(outroStart + 4.1).toFixed(2)});
      tl.fromTo("#o-close", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${(outroStart + 6.0).toFixed(2)});
      tl.fromTo("#o-next", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, ${(outroStart + 8.6).toFixed(2)});`
    : `      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, ${outroStart});
      tl.fromTo(".o-mark", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, ${(outroStart + 0.3).toFixed(2)});
      tl.fromTo("#o-h", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${(outroStart + 0.6).toFixed(2)});
      tl.fromTo("#o-close", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${(outroStart + 1.3).toFixed(2)});`;

// The phone stage: 1080 wide, so type and panels are sized for a screen held in one hand.
// The recording (360x640 at 3x) is inset at 13/15 under a band that holds the caption, so a
// caption never covers the logo or the control being tapped. Descriptions stay on one line.
const PORTRAIT_CSS = `      html, body, #root { width: 1080px; height: 1920px; }
      #root { background: radial-gradient(120% 70% at 18% 6%, #5a2130 0%, var(--chrome-800) 34%, var(--chrome-900) 72%, #230b11 100%); }
      #footage { inset: auto; left: 72px; top: 256px; width: 936px; height: 1664px; border-radius: 40px 40px 0 0; background: #140b0e;
        box-shadow: 0 0 0 2px rgb(255 190 210 / 0.14), 0 -18px 60px rgb(0 0 0 / 0.4); }
      .intro .inner { left: 96px; right: 96px; max-width: none; }
      .intro .mark { width: 136px; margin-bottom: 56px; }
      .eyebrow { font-size: 26px; }
      .intro h1 { margin-top: 24px; font-size: 128px; line-height: 1.0; }
      .intro .sub { margin-top: 38px; font-size: 42px; line-height: 1.3; max-width: 880px; }
      .intro .rule { margin-top: 60px; width: 240px; height: 4px; }
      .cap { left: 40px; right: 40px; top: 46px; bottom: auto; max-width: none; border-radius: 22px; padding: 20px 32px 22px 46px; }
      .cap .bar { top: 18px; bottom: 18px; width: 6px; }
      .cap .step { font-size: 19px; line-height: 1.2; }
      .cap .h { margin-top: 4px; font-size: 40px; line-height: 1.12; }
      .cap .d { margin-top: 4px; font-size: 29px; line-height: 1.3; }
      .scrim { position: absolute; left: 72px; top: 256px; width: 936px; height: 1664px; border-radius: 40px 40px 0 0; background: rgb(14 6 9 / 0.66); opacity: 0; z-index: 18; }
      .msg { position: absolute; left: 112px; right: 112px; top: 760px; z-index: 19; opacity: 0; background: rgb(28 18 20 / 0.97); border-radius: 28px; padding: 34px 40px 38px;
        box-shadow: 0 30px 70px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.08); }
      .msg .m-label { color: var(--wine-300); font-size: 22px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
      .msg .m-text { margin-top: 16px; color: #fff; font-size: 36px; font-weight: 500; line-height: 1.38; letter-spacing: -.01em; }
      .msg .m-link { margin-top: 22px; padding: 16px 20px; border-radius: 16px; background: rgb(255 255 255 / 0.06); color: var(--wine-100); font-size: 28px; line-height: 1.4; overflow-wrap: anywhere; }
      .msg .m-link b { color: #fff; font-weight: 700; background: rgb(180 80 105 / 0.5); border-radius: 8px; padding: 0 8px; }
      .progress { width: 1080px; height: 8px; }
      .outro h2 { font-size: 112px; line-height: 1.02; }
      .o-center .o-close { margin: 44px auto 0; max-width: 1000px; padding: 0 40px; font-size: 36px; line-height: 1.45; }
      .o-mark { width: 136px; margin-bottom: 40px; }
`;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${VW}, height=${VH}" />
    <title>AVHomes ${META.app || "console"} tutorial: ${esc(META.title.join(" "))}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
    <style>
      /* Tokens from src/app/globals.css. */
      :root {
        --plum-950: #1c1214; --wine-700: #762d3f; --wine-600: #983c53; --wine-500: #b45069;
        --wine-300: #e6a8b7; --wine-100: #f2dee3; --chrome-900: #321119; --chrome-800: #4d1a26;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--chrome-900);
        font-family: "Geist", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: var(--chrome-900); }
      .clip { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
      video.clip { object-fit: cover; background: #faf4f6; }

      .card { background: radial-gradient(120% 90% at 18% 20%, #5a2130 0%, var(--chrome-800) 38%, var(--chrome-900) 78%, #230b11 100%); }
      .intro .inner { position: absolute; left: 180px; top: 50%; transform: translateY(-50%); max-width: 1300px; }
      .intro .mark { width: 132px; height: auto; display: block; margin-bottom: 44px; }
      .eyebrow { color: var(--wine-300); font-size: 22px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; }
      .intro h1 { margin-top: 18px; color: #fff; font-size: 116px; font-weight: 700; letter-spacing: -.035em; line-height: 1.02; }
      h1 em, h2 em { font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-weight: 400; color: var(--wine-300); letter-spacing: -.01em; }
      .intro .sub { margin-top: 26px; color: var(--wine-100); font-size: 32px; font-weight: 400; line-height: 1.35; max-width: 1100px; }
      .intro .rule { margin-top: 46px; width: 220px; height: 3px; border-radius: 3px; background: var(--wine-500); transform-origin: 0 50%; }

      .cap { position: absolute; left: 48px; bottom: 48px; max-width: 600px; z-index: 20; opacity: 0;
        background: rgb(28 18 20 / 0.95); border-radius: 16px; padding: 18px 26px 20px 32px;
        box-shadow: 0 18px 44px rgb(28 18 20 / 0.36), 0 0 0 1px rgb(255 255 255 / 0.06); }
      .cap .bar { position: absolute; left: 0; top: 16px; bottom: 16px; width: 5px; border-radius: 3px; background: var(--wine-500); }
      .cap .step { color: var(--wine-300); font-size: 13px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
      .cap .h { margin-top: 6px; color: #fff; font-size: 27px; font-weight: 700; letter-spacing: -.02em; line-height: 1.15; }
      .cap .d { margin-top: 6px; color: var(--wine-100); font-size: 18px; font-weight: 400; line-height: 1.4; }
      .cap.raised { bottom: 132px; }

      .progress { position: absolute; left: 0; bottom: 0; height: 5px; width: 1920px; background: var(--wine-500); transform-origin: 0 50%; z-index: 21; }

      .outro .o-inner { position: absolute; left: 180px; top: 50%; transform: translateY(-50%); max-width: 1400px; }
      .outro .o-center { left: 0; right: 0; max-width: none; text-align: center; }
      .outro h2 { margin-top: 18px; color: #fff; font-size: 96px; font-weight: 700; letter-spacing: -.035em; line-height: 1.04; }
      .o-list { margin-top: 44px; list-style: none; }
      .o-list li { display: flex; align-items: center; gap: 22px; color: #fff; font-size: 34px; font-weight: 500; line-height: 1.3; letter-spacing: -.01em; }
      .o-list li + li { margin-top: 22px; }
      .o-list .n { flex: 0 0 auto; display: grid; place-items: center; width: 50px; height: 50px; border-radius: 999px;
        background: rgb(180 80 105 / 0.28); color: var(--wine-100); font-size: 22px; font-weight: 700; }
      .o-close { margin-top: 44px; color: var(--wine-100); font-size: 30px; line-height: 1.45; max-width: 1260px; }
      .o-center .o-close { margin: 34px auto 0; max-width: 1100px; }
      .o-close b, .o-next b { color: #fff; font-weight: 600; }
      .o-next { margin-top: 40px; color: var(--wine-300); font-size: 24px; font-weight: 500; }
      .o-mark { width: 120px; height: auto; display: block; margin: 0 auto 30px; }
${P ? PORTRAIT_CSS : ""}    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${VW}" data-height="${VH}" data-duration="${TOTAL}">
      <video class="clip" id="footage" data-start="${(INTRO - 0.5).toFixed(2)}" data-duration="${(FOOT + 0.1).toFixed(2)}" data-media-start="0" src="${footageSrc}" muted playsinline></video>
      <div class="progress" id="progress"></div>

      <section class="clip card intro" id="intro" data-start="0" data-duration="${INTRO.toFixed(2)}">
        <div class="inner">
          <img class="mark" id="i-mark" src="assets/logo-mark-reversed.png" alt="" />
          <div class="eyebrow" id="i-eyebrow">AVHomes ${META.app || "console"} &middot; ${esc(META.eyebrow)}</div>
          <h1 id="i-h">${esc(META.title[0])}${P ? "<br />" : " "}<em>${esc(META.title[1])}</em></h1>
          <p class="sub" id="i-sub">${esc(META.sub)}</p>
          <div class="rule" id="i-rule"></div>
        </div>
      </section>

${capHtml}${msgHtml}

${outroHtml.replace('class="clip outro"', 'class="clip card outro"')}
    </div>

    <script>
      var tl = gsap.timeline({ paused: true });
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;

      tl.fromTo("#i-mark", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, 0.1);
      tl.fromTo("#i-eyebrow", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.35);
      tl.fromTo("#i-h", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.5);
      tl.fromTo("#i-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.85);
      tl.fromTo("#i-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, 1.1);
      tl.to("#intro", { opacity: 0, duration: 0.5, ease: "power1.in" }, ${(INTRO - 0.5).toFixed(2)});

      tl.fromTo("#progress", { scaleX: 0 }, { scaleX: 1, duration: ${FOOT.toFixed(2)}, ease: "none" }, ${INTRO.toFixed(2)});
      tl.to("#progress", { opacity: 0, duration: 0.3 }, ${(INTRO + FOOT - 0.3).toFixed(2)});

${capJs}${msgJs}

${outroJs}
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(dir, "index.html"), html);
fs.copyFileSync(path.join(REPO, "public/brand/logo-mark-reversed.png"), path.join(dir, "assets/logo-mark-reversed.png"));
const pin = "hyperframes@0.8.33";
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `avhomes-tutorial-${name}`, private: true, type: "module", scripts: { check: `npx --yes ${pin} check`, render: `npx --yes ${pin} render` } }, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id: `avhomes-tutorial-${name}`, name: META.title.join(" ") }, null, 2) + "\n");
console.log(`${name}: ${TOTAL}s total (intro ${INTRO}, footage ${FOOT}, outro ${OUTRO}), ${caps.length} captions`);
